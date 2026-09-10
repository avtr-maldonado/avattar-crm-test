"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { registrarActividad } from "@/lib/domain/activity";
import { cambiarEtapa, editarOportunidad } from "@/lib/domain/opportunity";
import { getCommercialPolicy } from "@/lib/policy";
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

  const politica = await getCommercialPolicy(detalle.organization.countryCode);
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

const esquemaActividad = z.object({
  opportunityId: z.string().min(1),
  typeId: z.string().min(1, "Elige el tipo de actividad."),
  subject: z.string().trim().min(3, "Escribe de qué se trató la actividad."),
  outcome: z.string().trim().optional(),
  ocurrioEn: z.string().optional(),
  siguienteTypeId: z.string().optional(),
  siguienteSubject: z.string().trim().optional(),
  siguienteStartsAt: z.string().optional(),
  sinSeguimiento: z.coerce.boolean().optional(),
});

export async function registrarActividadAccion(
  _previo: ResultadoAccion<{ siguienteEn: Date | null }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ siguienteEn: Date | null }>> {
  const datos = esquemaActividad.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle } = await cargar(d.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  // El siguiente paso es todo o nada: con asunto y fecha, o no hay siguiente.
  // Medio paso agendado es una actividad que nadie sabe cuándo ocurre.
  const siguiente =
    d.siguienteTypeId && d.siguienteSubject && d.siguienteStartsAt
      ? {
          typeId: d.siguienteTypeId,
          subject: d.siguienteSubject,
          startsAt: new Date(`${d.siguienteStartsAt}T12:00:00`),
        }
      : undefined;

  const r = await registrarActividad(session, detalle, {
    typeId: d.typeId,
    subject: d.subject,
    outcome: d.outcome,
    ocurrioEn: d.ocurrioEn ? new Date(`${d.ocurrioEn}T12:00:00`) : undefined,
    siguiente,
    sinSeguimiento: d.sinSeguimiento,
  });
  if (!r.ok) return r;

  revalidatePath(`/oportunidades/${d.opportunityId}`);
  revalidatePath("/actividades");
  revalidatePath("/oportunidades");
  return ok(r.datos);
}
