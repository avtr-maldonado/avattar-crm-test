"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { editarActividad, registrarActividad } from "@/lib/domain/activity";
import { cambiarEtapa, editarOportunidad, marcarGanada, marcarPerdida } from "@/lib/domain/opportunity";
import { cambioDeCampo } from "@/lib/domain/opportunityField";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { duracionEnMinutos, instanteEn } from "@/lib/tiempo";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";

/**
 * Las mutaciones de P-02.
 *
 * Cada una hace cuatro cosas y ninguna más: parsea con Zod, obtiene la sesión,
 * carga el detalle **por `lib/scope`** —que es donde se aplica el alcance por
 * rol (INV-01)— y delega en el servicio de dominio, que decide y escribe.
 *
 * Los umbrales se leen aquí y se pasan al dominio: la prueba de AC-31 verifica
 * que ningún archivo de `lib/domain` importe `lib/policy`, para que sus
 * funciones sigan siendo probables sin base.
 */
async function cargar(id: string) {
  const session = await requireSession();
  const detalle = await getOpportunityDetail(session, id);
  if (!detalle) return { session, detalle: null };

  // La política es la del país de la oportunidad, que es el del pipeline. La
  // cuenta ya no tiene país que decida nada (decisiones §18).
  const politica = await getCommercialPolicy(detalle.countryCode);
  return {
    session,
    detalle,
    umbrales: {
      meddicMinToClosing: Number(politica.meddicMinToClosing),
      meddicMinToCommit: Number(politica.meddicMinToCommit),
    },
  };
}

/**
 * `AUTORIZACION` no distingue «no existe» de «no puedes». Distinguirlas le
 * confirmaría a un vendedor que cierta oportunidad existe aunque no sea suya,
 * que es justo lo que INV-01 evita.
 */
const NO_ALCANZA = "No encontramos esa oportunidad, o no está a tu alcance.";

const esquemaEtapa = z.object({
  opportunityId: z.string().min(1),
  toStageId: z.string().min(1, "Elige la etapa."),
  omitirCompuerta: z.coerce.boolean().optional(),
});

export async function cambiarEtapaAccion(
  _previo: ResultadoAccion<{ etapa: string; gateOverride: boolean }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ etapa: string; gateOverride: boolean }>> {
  const datos = esquemaEtapa.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const { session, detalle, umbrales } = await cargar(datos.data.opportunityId);
  if (!detalle || !umbrales) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await cambiarEtapa(
    session,
    detalle,
    { toStageId: datos.data.toStageId, omitirCompuerta: datos.data.omitirCompuerta },
    umbrales,
  );
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${datos.data.opportunityId}`);
  revalidatePath("/oportunidades");
  return ok(r.datos);
}

/** `INV-03` · el importe viaja como cadena. Se aceptan comas de miles. */
const importe = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, "Escribe el importe en dólares, sin símbolo.")
      .refine((v) => Number(v) > 0, "El importe tiene que ser mayor que cero."),
  );

const esquemaEdicion = z.object({
  opportunityId: z.string().min(1),
  name: z.string().trim().min(3, "Ponle nombre a la oportunidad."),
  primaryPersonId: z.string().optional(),
  estimatedAmount: importe.optional(),
  expectedCloseDate: z.string().min(1, "Pon la fecha de cierre estimada."),
  businessType: z.enum(["NUEVO", "EXPANSION", "RENOVACION"]),
  forecastCategory: z.enum(["PIPELINE", "MEJOR_CASO", "COMPROMISO", "OMITIDA"]),
  sourceId: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function editarOportunidadAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquemaEdicion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle, umbrales } = await cargar(d.opportunityId);
  if (!detalle || !umbrales) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await editarOportunidad(
    session,
    detalle,
    {
      name: d.name,
      // Cadena vacía significa «quitar», no «no tocar»: el `select` del
      // formulario ofrece «Sin especificar» y hay que poder volver a él.
      primaryPersonId: d.primaryPersonId === undefined ? undefined : d.primaryPersonId || null,
      estimatedAmount: d.estimatedAmount,
      expectedCloseDate: new Date(`${d.expectedCloseDate}T12:00:00`),
      businessType: d.businessType,
      forecastCategory: d.forecastCategory,
      sourceId: d.sourceId === undefined ? undefined : d.sourceId || null,
      ownerId: d.ownerId || undefined,
    },
    umbrales,
  );
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${d.opportunityId}`);
  revalidatePath("/oportunidades");
  return ok(null);
}

/**
 * Un solo dato de la ficha · la edición rápida de P-02.
 *
 * Recibe argumentos y no un `FormData` porque no viene de un formulario: viene
 * de un control que se pulsa y se guarda. Lo que **no** cambia es el camino:
 * carga el detalle por `lib/scope`, traduce el campo con una función pura y
 * delega en el mismo `editarOportunidad` que usa el panel completo. `RN-29`,
 * `INV-06` y quién puede reasignar siguen decidiéndose ahí.
 */
export async function editarCampoAccion(
  opportunityId: string,
  campo: string,
  valor: string,
): Promise<ResultadoAccion> {
  const cambio = cambioDeCampo(campo, valor);
  if (!cambio.ok) return cambio;

  const { session, detalle, umbrales } = await cargar(opportunityId);
  if (!detalle || !umbrales) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await editarOportunidad(session, detalle, cambio.datos, umbrales);
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${opportunityId}`);
  revalidatePath("/oportunidades");
  return ok(null);
}

const HORA = /^\d{2}:\d{2}$/;

const esquemaActividad = z.object({
  opportunityId: z.string().min(1),
  /** Presente cuando se edita una que ya existe. */
  activityId: z.string().optional(),
  typeId: z.string().min(1, "Elige el tipo de actividad."),
  subject: z.string().trim().min(3, "Escribe de qué se trata la actividad."),
  notas: z.string().trim().optional(),
  outcome: z.string().trim().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pon la fecha."),
  inicio: z.string().regex(HORA, "Pon la hora de inicio."),
  fin: z.string().regex(HORA, "Pon la hora de fin."),
  userId: z.string().min(1, "Elige al responsable."),
  /** La casilla del pie. Ausente es «por hacer»: agendar es lo normal. */
  hecha: z.coerce.boolean().optional(),
  siguienteTypeId: z.string().optional(),
  siguienteSubject: z.string().trim().optional(),
  siguienteStartsAt: z.string().optional(),
  sinSeguimiento: z.coerce.boolean().optional(),
});

type ResultadoDeActividad = ResultadoAccion<{
  id: string;
  siguienteEn: Date | null;
  calendario: "AGENDADA" | "SIN_CALENDARIO" | "FALLO" | "NO_APLICA";
}>;

/**
 * Guarda una actividad: nueva, o la edición de una si viene `activityId`.
 *
 * Las horas llegan como hora de pared y se convierten en la **zona del país
 * de la oportunidad** (`Country.timezone`). Es la única zona que el sistema
 * conoce con certeza, y la que el calendario de Microsoft 365 necesita para
 * poner la reunión a la hora correcta en cada calendario.
 */
export async function guardarActividadAccion(
  _previo: ResultadoDeActividad | null,
  form: FormData,
): Promise<ResultadoDeActividad> {
  const datos = esquemaActividad.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle } = await cargar(d.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const { timezone: zona } = await getCountry(detalle.countryCode);

  // El siguiente paso es todo o nada: con asunto y fecha, o no hay siguiente.
  // Medio paso agendado es una actividad que nadie sabe cuándo ocurre.
  const siguiente =
    d.siguienteTypeId && d.siguienteSubject && d.siguienteStartsAt
      ? {
          typeId: d.siguienteTypeId,
          subject: d.siguienteSubject,
          startsAt: instanteEn(d.siguienteStartsAt, d.inicio, zona),
        }
      : undefined;

  const comunes = {
    typeId: d.typeId,
    subject: d.subject,
    notes: d.notas,
    outcome: d.outcome,
    cuando: instanteEn(d.fecha, d.inicio, zona),
    // El dominio rechaza un fin antes del inicio con su campo; aquí solo se mide.
    durationMin: duracionEnMinutos(d.inicio, d.fin),
    hecha: d.hecha === true,
    userId: d.userId,
    zona,
    siguiente,
    sinSeguimiento: d.sinSeguimiento,
  };

  const r = d.activityId
    ? await editarActividad(session, detalle, d.activityId, comunes)
    : await registrarActividad(session, detalle, comunes);
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${d.opportunityId}`);
  revalidatePath("/actividades");
  revalidatePath("/oportunidades");
  return ok(r.datos);
}

// ═══════════════════════════════════════════════════ Marcar ganada o perdida

const esquemaCierre = z.object({ opportunityId: z.string().min(1) });

/**
 * Ganar · decisiones §25. Las condiciones viven en `requisitosParaGanar`, en
 * el dominio (INV-07); aquí solo se carga el detalle por alcance y se delega.
 */
export async function marcarGanadaAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquemaCierre.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const { session, detalle } = await cargar(datos.data.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await marcarGanada(session, detalle);
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${detalle.id}`);
  revalidatePath("/oportunidades");
  return ok(null);
}

const esquemaPerdida = z.object({
  opportunityId: z.string().min(1),
  lossReasonId: z.string().optional().default(""),
  lossCompetitor: z.string().trim().optional(),
});

/** Perder · AC-20. El motivo, y el competidor cuando el motivo lo exige, los valida el dominio. */
export async function marcarPerdidaAccion(
  _previo: ResultadoAccion | null,
  form: FormData,
): Promise<ResultadoAccion> {
  const datos = esquemaPerdida.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle } = await cargar(d.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await marcarPerdida(session, detalle, {
    lossReasonId: d.lossReasonId,
    lossCompetitor: d.lossCompetitor,
  });
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${detalle.id}`);
  revalidatePath("/oportunidades");
  return ok(null);
}
