"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  asignarProspectos,
  cambiarEtapaDeProspecto,
  convertirProspecto,
  crearProspecto,
  descartarProspecto,
  editarActividadDeProspecto,
  editarProspecto,
  importarProspectos,
  registrarActividadDeProspecto,
  type AltaDeProspecto,
} from "@/lib/domain/lead";
import { parseCsv } from "@/lib/domain/csv";
import { validarFilas, type FilaValidada } from "@/lib/domain/leadImport";
import { ETAPAS_DE_PROSPECTO } from "@/lib/domain/leadStages";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { catalogosDeProspectos, correosConProspectoAbierto, getLeadDetail } from "@/lib/scope/leads";
import type { SincroniaDeCalendario } from "@/lib/domain/activity";
import { duracionEnMinutos, instanteEn } from "@/lib/tiempo";

/**
 * Las mutaciones de Prospectos · decisiones §58. El contrato de siempre: Zod,
 * el detalle por `lib/scope`, y el dominio decide y escribe. Nunca lanzan.
 */
const NO_ALCANZA = "No encontramos ese prospecto, o no está a tu alcance.";
const PAISES = ["MX", "CO", "CL"] as const;

async function cargar(id: string) {
  const session = await requireSession();
  const lead = await getLeadDetail(session, id);
  return { session, lead };
}

const opcional = z.string().trim().optional().transform((v) => (v ? v : null));

const esquemaAlta = z.object({
  contactName: z.string().trim().min(2, "Escribe el nombre del contacto."),
  email: opcional,
  phone: opcional,
  jobTitle: opcional,
  companyName: z.string().trim().min(2, "Escribe la empresa."),
  companyIndustry: opcional,
  countryCode: z.enum(PAISES, { message: "Elige el país." }),
  channelId: z.string().trim().min(1, "Elige el canal."),
  campaignId: opcional,
  score: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100), "El puntaje va de 0 a 100."),
  notes: opcional,
  assignedToId: opcional,
});

type ResultadoDeAlta = ResultadoAccion<{ id: string; folio: string }>;

export async function crearProspectoAccion(_previo: ResultadoDeAlta | null, form: FormData): Promise<ResultadoDeAlta> {
  const datos = esquemaAlta.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const session = await requireSession();
  const politica = await getCommercialPolicy(datos.data.countryCode);
  const r = await crearProspecto(session, datos.data, { leadFirstContactSlaHours: politica.leadFirstContactSlaHours });
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(r.datos);
}

const esquemaEdicion = esquemaAlta.omit({ countryCode: true, assignedToId: true }).extend({ leadId: z.string().min(1) });

export async function editarProspectoAccion(_previo: ResultadoAccion | null, form: FormData): Promise<ResultadoAccion> {
  const datos = esquemaEdicion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const { leadId, ...cambios } = datos.data;
  const { session, lead } = await cargar(leadId);
  if (!lead) return falla("AUTORIZACION", NO_ALCANZA);
  const r = await editarProspecto(session, lead, cambios);
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(null);
}

const esquemaEtapa = z.object({
  leadId: z.string().min(1),
  toStage: z.enum(ETAPAS_DE_PROSPECTO as [string, ...string[]], { message: "Elige la etapa." }),
});

type ResultadoDeEtapa = ResultadoAccion<{ etapa: string }>;

export async function cambiarEtapaDeProspectoAccion(_previo: ResultadoDeEtapa | null, form: FormData): Promise<ResultadoDeEtapa> {
  const datos = esquemaEtapa.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const { session, lead } = await cargar(datos.data.leadId);
  if (!lead) return falla("AUTORIZACION", NO_ALCANZA);
  const r = await cambiarEtapaDeProspecto(session, lead, datos.data.toStage as (typeof ETAPAS_DE_PROSPECTO)[number]);
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(r.datos);
}

type ResultadoDeAsignacion = ResultadoAccion<{ asignados: number }>;

/** Uno o varios: los ids llegan repetidos y se leen con `getAll`. */
export async function asignarProspectosAccion(_previo: ResultadoDeAsignacion | null, form: FormData): Promise<ResultadoDeAsignacion> {
  const ids = form.getAll("ids").flatMap((v) => (typeof v === "string" && v ? [v] : []));
  const vendedorId = String(form.get("vendedorId") ?? "").trim();
  if (ids.length === 0) return falla("VALIDACION", { campo: "ids", mensaje: "Elige al menos un prospecto." });
  if (!vendedorId) return falla("VALIDACION", { campo: "assignedToId", mensaje: "Elige al vendedor." });

  const session = await requireSession();
  const leads = (await Promise.all(ids.map((id) => getLeadDetail(session, id)))).flatMap((l) => (l ? [l] : []));
  if (leads.length !== ids.length) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await asignarProspectos(session, leads, vendedorId);
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(r.datos);
}

const esquemaDescarte = z.object({ leadId: z.string().min(1), discardReasonId: z.string().trim().optional().default("") });

export async function descartarProspectoAccion(_previo: ResultadoAccion | null, form: FormData): Promise<ResultadoAccion> {
  const datos = esquemaDescarte.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const { session, lead } = await cargar(datos.data.leadId);
  if (!lead) return falla("AUTORIZACION", NO_ALCANZA);
  const r = await descartarProspecto(session, lead, datos.data.discardReasonId);
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(null);
}

// ─────────────────────────────────────────────────────────────── Conversión

const importe = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, "Escribe el importe en dólares, sin símbolo.").refine((v) => Number(v) > 0, "El importe tiene que ser mayor que cero."));

const TIPOS_DE_CUENTA = ["CLIENTE", "PROSPECTO", "PARTNER", "FABRICANTE", "PROVEEDOR"] as const;

// §59 · cuenta y persona explícitas: la existente elegida (su id) o los datos
// de la nueva, prellenados desde el prospecto y completados en el panel.
const esquemaConversion = z.object({
  leadId: z.string().min(1),
  organizationId: z.string().trim().optional(),
  organizacionNombre: z.string().trim().optional(),
  organizacionTipo: z.enum(TIPOS_DE_CUENTA).default("PROSPECTO"),
  organizacionGiro: opcional,
  organizacionCiudad: opcional,
  primaryPersonId: z.string().trim().optional(),
  personaNombre: z.string().trim().optional(),
  personaCargo: opcional,
  personaCorreo: z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Escribe un correo válido."),
  personaTelefono: opcional,
  personaRolComiteId: opcional,
  name: z.string().trim().min(3, "Ponle nombre a la oportunidad."),
  pipelineId: z.string().min(1, "Elige el pipeline."),
  stageId: z.string().optional(),
  estimatedAmount: importe,
  expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pon la fecha de cierre estimada."),
  businessType: z.enum(["NUEVO", "EXPANSION", "RENOVACION"], { message: "Elige el tipo de negocio." }),
  ownerId: z.string().optional(),
});

type ResultadoDeConversion = ResultadoAccion<{ opportunityId: string; folio: string; cuentaReutilizada: boolean; personaReutilizada: boolean }>;

/** Convertir · §58. La compuerta de la etapa de entrada la evalúa `crearOportunidad`, como en el alta. */
export async function convertirProspectoAccion(_previo: ResultadoDeConversion | null, form: FormData): Promise<ResultadoDeConversion> {
  const datos = esquemaConversion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;
  if (!d.organizationId && !d.organizacionNombre) return falla("VALIDACION", { campo: "organizacionNombre", mensaje: "Elige la cuenta o escribe el nombre de la nueva." });
  if (!d.primaryPersonId && !d.personaNombre) return falla("VALIDACION", { campo: "personaNombre", mensaje: "Elige el contacto o escribe el nombre del nuevo." });
  const { session, lead } = await cargar(d.leadId);
  if (!lead) return falla("AUTORIZACION", NO_ALCANZA);
  const politica = await getCommercialPolicy(lead.countryCode);
  const r = await convertirProspecto(
    session,
    lead,
    {
      cuenta: d.organizationId ? { id: d.organizationId } : { nueva: { name: d.organizacionNombre!, type: d.organizacionTipo, industry: d.organizacionGiro, city: d.organizacionCiudad } },
      persona: d.primaryPersonId
        ? { id: d.primaryPersonId }
        : { nueva: { name: d.personaNombre!, jobTitle: d.personaCargo, email: d.personaCorreo, phone: d.personaTelefono, committeeRoleId: d.personaRolComiteId } },
      name: d.name,
      pipelineId: d.pipelineId,
      stageId: d.stageId || undefined,
      estimatedAmount: d.estimatedAmount,
      // Mediodía, como en el alta: a medianoche un huso al oeste de UTC devuelve el día anterior.
      expectedCloseDate: new Date(`${d.expectedCloseDate}T12:00:00`),
      businessType: d.businessType,
      ownerId: d.ownerId || undefined,
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  revalidatePath("/oportunidades");
  revalidatePath("/contactos");
  return ok(r.datos);
}

// ────────────────────────────────────────────────────────────── Importación

type ResultadoDePrevisualizacion = ResultadoAccion<{ filas: FilaValidada[] }>;
type ResultadoDeImportacion = ResultadoAccion<{ creados: number; ids: string[] }>;

const TAMANO_MAXIMO = 2 * 1024 * 1024;

/** Paso uno: leer el archivo y decir fila por fila qué está bien. No escribe nada. */
export async function previsualizarImportacionAccion(_previo: ResultadoDePrevisualizacion | null, form: FormData): Promise<ResultadoDePrevisualizacion> {
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return falla("VALIDACION", { campo: "archivo", mensaje: "Elige un archivo CSV." });
  if (archivo.size > TAMANO_MAXIMO) return falla("VALIDACION", { campo: "archivo", mensaje: "El archivo pesa más de 2 MB." });

  const session = await requireSession();
  if (!can(session, "GESTIONAR_PROSPECTOS")) return falla("AUTORIZACION", "Importar prospectos es de Marketing o Gerencia.");

  let filas: string[][];
  try {
    filas = parseCsv(await archivo.text());
  } catch {
    return falla("VALIDACION", { campo: "archivo", mensaje: "No se pudo leer el archivo como CSV." });
  }
  if (filas.length < 2) return falla("VALIDACION", { campo: "archivo", mensaje: "El archivo no trae filas debajo de la cabecera." });

  const catalogos = await catalogosDeProspectos();
  const correos = filas.slice(1).flatMap((f) => f.flatMap((v) => (v.includes("@") ? [v.trim().toLowerCase()] : [])));
  const correosAbiertos = await correosConProspectoAbierto(correos);
  try {
    const validadas = validarFilas(filas, { canales: catalogos.canales, campanas: catalogos.campanas, paises: session.countryCodes, correosAbiertos });
    return ok({ filas: validadas });
  } catch (e) {
    return falla("VALIDACION", { campo: "archivo", mensaje: e instanceof Error ? e.message : "El archivo no tiene la forma esperada." });
  }
}

const esquemaFilas = z.array(
  z.object({
    contactName: z.string().min(2),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    companyName: z.string().min(2),
    companyIndustry: z.string().nullable().optional(),
    countryCode: z.enum(PAISES),
    channelId: z.string().min(1),
    campaignId: z.string().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
);

/** Paso dos: crear las filas válidas, con el SLA de cada país. */
export async function importarProspectosAccion(_previo: ResultadoDeImportacion | null, form: FormData): Promise<ResultadoDeImportacion> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(form.get("filas") ?? "[]"));
  } catch {
    return falla("VALIDACION", { campo: "filas", mensaje: "No se pudieron leer las filas. Vuelve a revisar el archivo." });
  }
  const filas = esquemaFilas.safeParse(crudo);
  if (!filas.success) return deZod(filas.error);

  const session = await requireSession();
  const paises = [...new Set(filas.data.map((f) => f.countryCode))];
  const politicas = await Promise.all(paises.map(async (p) => [p, (await getCommercialPolicy(p)).leadFirstContactSlaHours] as const));
  const r = await importarProspectos(session, filas.data as AltaDeProspecto[], Object.fromEntries(politicas));
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  return ok(r.datos);
}

// ───────────────────────────────────────────────────────────── Actividades

const HORA = /^\d{2}:\d{2}$/;

const esquemaActividad = z.object({
  leadId: z.string().min(1),
  activityId: z.string().optional(),
  typeId: z.string().min(1, "Elige el tipo de actividad."),
  subject: z.string().trim().min(3, "Escribe de qué se trata la actividad."),
  notas: z.string().trim().optional(),
  outcome: z.string().trim().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pon la fecha."),
  inicio: z.string().regex(HORA, "Pon la hora de inicio."),
  fin: z.string().regex(HORA, "Pon la hora de fin."),
  userId: z.string().min(1, "Elige al responsable."),
  hecha: z.coerce.boolean().optional(),
});

type ResultadoDeActividad = ResultadoAccion<{ id: string; siguienteEn: Date | null; calendario: SincroniaDeCalendario }>;

/**
 * La actividad de un prospecto, nueva o editada. Misma forma que la de la
 * oportunidad: horas de pared en la zona del país del prospecto (§20). Sin
 * calendario en esta entrega (§58) y sin la pregunta de §12.4.
 */
export async function guardarActividadDeProspectoAccion(_previo: ResultadoDeActividad | null, form: FormData): Promise<ResultadoDeActividad> {
  const datos = esquemaActividad.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;
  const { session, lead } = await cargar(d.leadId);
  if (!lead) return falla("AUTORIZACION", NO_ALCANZA);
  const { timezone: zona } = await getCountry(lead.countryCode);

  const comunes = {
    typeId: d.typeId,
    subject: d.subject,
    notes: d.notas,
    outcome: d.outcome,
    cuando: instanteEn(d.fecha, d.inicio, zona),
    durationMin: duracionEnMinutos(d.inicio, d.fin),
    hecha: d.hecha === true,
    userId: d.userId,
    zona,
  };
  const r = d.activityId ? await editarActividadDeProspecto(session, lead, d.activityId, comunes) : await registrarActividadDeProspecto(session, lead, comunes);
  if (!r.ok) return r;
  revalidatePath("/prospectos");
  revalidatePath("/actividades");
  return ok({ id: r.datos.id, siguienteEn: null, calendario: "NO_APLICA" });
}
