"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import {
  crearOrganizacion,
  crearPersona,
  editarOrganizacion,
  editarPersona,
} from "@/lib/domain/contact";
import { getOrganization } from "@/lib/scope/organizations";
import { getPersona } from "@/lib/scope/people";

/**
 * Las mutaciones de contactos · P-03 y P-04.
 *
 * Cada una carga por `lib/scope` antes de delegar: si el lector no la devuelve,
 * la sesión no la alcanza y no hay nada que decidir (INV-01).
 */
const NO_ALCANZA = "No encontramos ese contacto, o no está a tu alcance.";

/**
 * El mismo tipo para alta y edición de contacto.
 *
 * El alta devuelve el id de lo creado y la edición no devuelve nada, pero el
 * formulario es uno solo: con dos tipos distintos habría que duplicarlo, y dos
 * formularios casi iguales se separan con el tiempo.
 */
export type ResultadoDeContacto = ResultadoAccion<{ id: string } | null>;

/** Vacío significa «quitar», no «no tocar»: los formularios ofrecen «Sin especificar». */
const opcional = z.string().trim().optional();

/** Un entero opcional que llega como texto del formulario. */
const entero = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isInteger(v), "Tiene que ser un número entero.");

// ═══════════════════════════════════════════════════════════════ Personas

const esquemaPersona = z.object({
  personId: z.string().min(1),
  name: z.string().trim().min(3, "Escribe el nombre completo del contacto."),
  jobTitle: opcional,
  email: opcional,
  phone: opcional,
  committeeRoleId: opcional,
});

export async function editarPersonaAccion(
  _previo: ResultadoDeContacto | null,
  form: FormData,
): Promise<ResultadoDeContacto> {
  const datos = esquemaPersona.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const persona = await getPersona(session, d.personId);
  if (!persona) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await editarPersona(session, persona, {
    name: d.name,
    jobTitle: d.jobTitle ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    committeeRoleId: d.committeeRoleId || null,
  });
  if (!r.ok) return r;

  revalidatePath("/contactos");
  revalidatePath(`/contactos/organizaciones/${persona.organization.id}`);
  // El detalle de oportunidad muestra el comité: si cambió un cargo, ahí se ve.
  revalidatePath("/oportunidades", "layout");
  return ok(null);
}

const esquemaAlta = esquemaPersona.omit({ personId: true }).extend({
  // Desde P-03 la empresa se elige en el formulario; desde la ficha o el
  // detalle ya viene fija. El mensaje es para el primer caso.
  organizationId: z.string().min(1, "Elige la empresa a la que pertenece."),
});

export async function crearPersonaAccion(
  _previo: ResultadoDeContacto | null,
  form: FormData,
): Promise<ResultadoDeContacto> {
  const datos = esquemaAlta.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const organizacion = await getOrganization(session, d.organizationId);
  if (!organizacion) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await crearPersona(session, organizacion, {
    name: d.name,
    jobTitle: d.jobTitle ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    committeeRoleId: d.committeeRoleId || null,
  });
  if (!r.ok) return r;

  revalidatePath("/contactos");
  revalidatePath(`/contactos/organizaciones/${d.organizationId}`);
  revalidatePath("/oportunidades", "layout");
  return ok(r.datos);
}

// ══════════════════════════════════════════════════════════ Organizaciones

const esquemaOrganizacion = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2, "La cuenta necesita un nombre."),
  legalName: opcional,
  taxId: opcional,
  type: z.enum(["CLIENTE", "PROSPECTO", "PARTNER", "FABRICANTE", "PROVEEDOR"]),
  industry: opcional,
  city: opcional,
  employees: entero,
  creditDays: entero,
  isStrategic: z.coerce.boolean().optional(),
  ownerId: opcional,
});

export async function editarOrganizacionAccion(
  _previo: ResultadoDeContacto | null,
  form: FormData,
): Promise<ResultadoDeContacto> {
  const datos = esquemaOrganizacion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const organizacion = await getOrganization(session, d.organizationId);
  if (!organizacion) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await editarOrganizacion(session, organizacion, {
    name: d.name,
    legalName: d.legalName ?? null,
    taxId: d.taxId ?? null,
    type: d.type,
    industry: d.industry ?? null,
    city: d.city ?? null,
    employees: d.employees,
    creditDays: d.creditDays,
    // Una casilla que no se marca no viaja en el FormData: su ausencia ES el
    // valor `false`, no «no tocar».
    isStrategic: d.isStrategic ?? false,
    ownerId: d.ownerId || undefined,
  });
  if (!r.ok) return r;

  revalidatePath("/contactos");
  revalidatePath(`/contactos/organizaciones/${d.organizationId}`);
  return ok(null);
}

const esquemaAltaDeOrganizacion = esquemaOrganizacion
  .omit({ organizationId: true, ownerId: true })
  .extend({
    // Solo viaja cuando la sesión opera en más de un país; con uno, se deduce.
    countryCode: z.enum(["MX", "CO", "CL"]).optional(),
  });

/**
 * Da de alta una cuenta desde P-03.
 *
 * El país no lo decide el formulario: con un solo país se toma el de la sesión,
 * y con varios el formulario ofrece únicamente los suyos. Aun así el servicio
 * vuelve a comprobar que la sesión opere ahí (AC-05). El propietario es quien
 * crea, siempre; reasignar es de Gerencia y se hace desde la ficha.
 */
export async function crearOrganizacionAccion(
  _previo: ResultadoDeContacto | null,
  form: FormData,
): Promise<ResultadoDeContacto> {
  const datos = esquemaAltaDeOrganizacion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const countryCode =
    d.countryCode ?? (session.countryCodes.length === 1 ? session.countryCodes[0] : undefined);
  if (!countryCode) {
    return falla("VALIDACION", { campo: "countryCode", mensaje: "Elige el país de la cuenta." });
  }

  const r = await crearOrganizacion(session, {
    name: d.name,
    legalName: d.legalName ?? null,
    taxId: d.taxId ?? null,
    type: d.type,
    industry: d.industry ?? null,
    city: d.city ?? null,
    employees: d.employees,
    creditDays: d.creditDays,
    isStrategic: d.isStrategic ?? false,
    countryCode,
  });
  if (!r.ok) return r;

  revalidatePath("/contactos");
  return ok(r.datos);
}
