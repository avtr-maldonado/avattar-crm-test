"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { guardarComponenteMeddic } from "@/lib/domain/meddicService";
import { guardarHito, marcarHito, quitarHito } from "@/lib/domain/milestoneService";
import { quitarDocumento, subirDocumento, urlDeDescarga } from "@/lib/domain/document";
import { PESOS_POR_OMISION, type MeddicWeights } from "@/lib/domain/meddic";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { pesosMeddicDe } from "@/lib/scope/pipelines";
import { getRutaDeDocumento } from "@/lib/scope/documentos";

/**
 * Las mutaciones de las pestañas MEDDIC, Hitos y Documentos.
 *
 * Todas cargan el detalle por `lib/scope` antes de delegar: si el lector no lo
 * devuelve, la sesión no alcanza la oportunidad (INV-01).
 */
const NO_ALCANZA = "No encontramos esa oportunidad, o no está a tu alcance.";

export type ResultadoDePestana = ResultadoAccion<{ puntaje?: number; url?: string } | null>;

async function cargar(opportunityId: string) {
  const session = await requireSession();
  const detalle = await getOpportunityDetail(session, opportunityId);
  return { session, detalle };
}

function revalidar(opportunityId: string) {
  revalidatePath(`/oportunidades/${opportunityId}`);
  // El puntaje MEDDIC se muestra en la tarjeta del kanban (§7.4).
  revalidatePath("/oportunidades");
}

/**
 * Los pesos del pipeline, que suman 100 · `INV-05` y `Q-08`.
 *
 * Se leen de la base porque «si el negocio decide que el decisor económico pesa
 * más, se cambia sin desplegar código». Si el pipeline no los tiene
 * configurados, se usan los de omisión en vez de fallar: un puntaje con los
 * pesos por omisión es más útil que una pantalla rota.
 */
async function pesosDelPipeline(pipelineId: string): Promise<MeddicWeights> {
  const filas = await pesosMeddicDe(pipelineId);
  if (filas.length === 0) return PESOS_POR_OMISION;
  return Object.fromEntries(filas.map((f) => [f.component, f.weight])) as MeddicWeights;
}

// ═══════════════════════════════════════════════════════════════ MEDDIC

const esquemaMeddic = z.object({
  opportunityId: z.string().min(1),
  component: z.enum([
    "METRICAS",
    "DECISOR_ECONOMICO",
    "CRITERIOS_DECISION",
    "PROCESO_DECISION",
    "DOLOR_IDENTIFICADO",
    "CAMPEON",
  ]),
  status: z.enum(["NO_EVALUADO", "AUSENTE", "PARCIAL", "CONFIRMADO"]),
  evidence: z.string().trim().optional(),
  personId: z.string().trim().optional(),
});

export async function guardarMeddicAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const datos = esquemaMeddic.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle } = await cargar(d.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await guardarComponenteMeddic(
    session,
    detalle,
    {
      component: d.component,
      status: d.status,
      evidence: d.evidence || null,
      personId: d.personId || null,
    },
    await pesosDelPipeline(detalle.pipeline.id),
  );
  if (!r.ok) return r;

  revalidar(d.opportunityId);
  return ok({ puntaje: r.datos.puntaje });
}

// ════════════════════════════════════════════════════════════════ Hitos

/** `INV-03` · el monto viaja como cadena. Se aceptan comas de miles. */
const importe = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, "Escribe el monto sin símbolo."));

const esquemaHito = z.object({
  opportunityId: z.string().min(1),
  milestoneId: z.string().optional(),
  description: z.string().trim().min(3, "Di qué se factura en este hito."),
  dueDate: z.string().min(1, "Pon la fecha de facturación."),
  amount: importe,
  // El conmutador de la captura. La conversión a monto es del dominio (INV-03).
  modo: z.enum(["monto", "porcentaje"]).default("monto"),
});

export async function guardarHitoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const datos = esquemaHito.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, detalle } = await cargar(d.opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await guardarHito(session, detalle, {
    milestoneId: d.milestoneId || undefined,
    description: d.description,
    dueDate: new Date(`${d.dueDate}T12:00:00`),
    amount: d.amount,
    modo: d.modo,
  });
  if (!r.ok) return r;

  revalidar(d.opportunityId);
  return ok(null);
}

export async function quitarHitoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  const milestoneId = String(form.get("milestoneId") ?? "");

  const { session, detalle } = await cargar(opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await quitarHito(session, detalle, milestoneId);
  if (!r.ok) return r;

  revalidar(opportunityId);
  return ok(null);
}

export async function marcarHitoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  const milestoneId = String(form.get("milestoneId") ?? "");
  const cumplido = form.get("cumplido") === "true";

  const { session, detalle } = await cargar(opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await marcarHito(session, detalle, milestoneId, cumplido);
  if (!r.ok) return r;

  revalidar(opportunityId);
  return ok(null);
}

// ═══════════════════════════════════════════════════════════ Documentos

export async function subirDocumentoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  const typeId = String(form.get("typeId") ?? "");
  const archivo = form.get("archivo");

  if (!(archivo instanceof File)) {
    return falla("VALIDACION", { campo: "archivo", mensaje: "Elige un archivo." });
  }
  if (!typeId) {
    return falla("VALIDACION", { campo: "typeId", mensaje: "Elige el tipo de documento." });
  }

  const { session, detalle } = await cargar(opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await subirDocumento(session, detalle, { typeId, archivo });
  if (!r.ok) return r;

  revalidar(opportunityId);
  return ok(null);
}

/**
 * Devuelve una URL firmada para abrir el documento.
 *
 * El alcance se comprueba aquí y no en el navegador: la firma se emite solo si
 * la sesión alcanza la oportunidad a la que el documento pertenece.
 */
export async function descargarDocumentoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  const documentId = String(form.get("documentId") ?? "");

  const { session, detalle } = await cargar(opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const documento = await getRutaDeDocumento(session, detalle.id, documentId);
  if (!documento) return falla("AUTORIZACION", "Ese documento no está en esta oportunidad.");

  const r = await urlDeDescarga(documento.storageKey);
  if (!r.ok) return r;
  return ok({ url: r.datos.url });
}

export async function quitarDocumentoAccion(
  _previo: ResultadoDePestana | null,
  form: FormData,
): Promise<ResultadoDePestana> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  const documentId = String(form.get("documentId") ?? "");

  const { session, detalle } = await cargar(opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await quitarDocumento(session, detalle, documentId);
  if (!r.ok) return r;

  revalidar(opportunityId);
  return ok(null);
}
