"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import {
  borradorDeCotizacion,
  congelarCotizacion,
  guardarLinea,
  nuevaVersion,
  quitarLinea,
} from "@/lib/domain/quoteService";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";

/**
 * Las mutaciones de la pestaña Cotización · E2.
 *
 * El piso de margen por línea se lee aquí y se pasa al dominio: `lib/domain` no
 * importa `lib/policy` (AC-31).
 */
const NO_ALCANZA = "No encontramos esa cotización, o no está a tu alcance.";

export type ResultadoDeCotizacion = ResultadoAccion<{ id: string; version: number } | null>;

async function cargarCotizacion(quoteId: string) {
  const session = await requireSession();
  const cotizacion = await getCotizacion(session, quoteId);
  if (!cotizacion) return { session, cotizacion: null, umbrales: null };

  const politica = await getCommercialPolicy(cotizacion.opportunity.countryCode);
  return {
    session,
    cotizacion,
    umbrales: { lineMarginFloor: politica.lineMarginFloor.toString() },
  };
}

function revalidar(opportunityId: string) {
  revalidatePath(`/oportunidades/${opportunityId}`);
  // Congelar cambia `amount` y `grossMargin` de la oportunidad, y con ellos las
  // cifras del tablero y las banderas de riesgo.
  revalidatePath("/oportunidades");
}

// ═══════════════════════════════════════════════════ Abrir el borrador

export async function abrirCotizacionAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const opportunityId = String(form.get("opportunityId") ?? "");
  if (!opportunityId) return falla("VALIDACION", "Falta la oportunidad.");

  const session = await requireSession();
  const detalle = await getOpportunityDetail(session, opportunityId);
  if (!detalle) return falla("AUTORIZACION", NO_ALCANZA);

  // La tasa de impuesto es la del país de la oportunidad (el del pipeline), no
  // la de la sede de la cuenta (decisiones §18).
  const pais = await getCountry(detalle.countryCode);
  const r = await borradorDeCotizacion(session, detalle, pais.taxRate);
  if (!r.ok) return r;

  revalidar(opportunityId);
  return ok(r.datos);
}

// ═══════════════════════════════════════════════════════════════ Líneas

/** `INV-03` · cantidades e importes viajan como cadena. */
const decimal = (mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, mensaje));

const esquemaLinea = z.object({
  quoteId: z.string().min(1),
  lineId: z.string().optional(),
  productId: z.string().optional(),
  description: z.string().trim().optional(),
  unit: z.string().trim().optional(),
  unitPrice: z.string().trim().optional(),
  unitCost: z.string().trim().optional(),
  quantity: decimal("La cantidad tiene que ser un número."),
  /** Llega como porcentaje —«15»— y se guarda como fracción (INV-03). */
  discountPct: z
    .string()
    .trim()
    .transform((v) => (v === "" ? "0" : v))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "El descuento va de 0 a 100."))
    .refine((v) => Number(v) <= 100, "El descuento no puede pasar de 100 %."),
});

export async function guardarLineaAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const datos = esquemaLinea.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const { session, cotizacion, umbrales } = await cargarCotizacion(d.quoteId);
  if (!cotizacion || !umbrales) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await guardarLinea(
    session,
    cotizacion,
    {
      lineId: d.lineId || undefined,
      productId: d.productId || undefined,
      description: d.description,
      unit: d.unit,
      unitPrice: d.unitPrice || undefined,
      unitCost: d.unitCost || undefined,
      quantity: d.quantity,
      // De porcentaje a fracción: 15 → 0.15.
      discountRate: (Number(d.discountPct) / 100).toFixed(4),
    },
    umbrales,
  );
  if (!r.ok) return r;

  revalidar(cotizacion.opportunity.id);
  return ok(null);
}

export async function quitarLineaAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const quoteId = String(form.get("quoteId") ?? "");
  const lineId = String(form.get("lineId") ?? "");
  if (!quoteId || !lineId) return falla("VALIDACION", "Falta la línea.");

  const { session, cotizacion } = await cargarCotizacion(quoteId);
  if (!cotizacion) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await quitarLinea(session, cotizacion, lineId);
  if (!r.ok) return r;

  revalidar(cotizacion.opportunity.id);
  return ok(null);
}

// ═══════════════════════════════════════════════════ Congelar y versionar

export async function congelarAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const quoteId = String(form.get("quoteId") ?? "");
  const { session, cotizacion } = await cargarCotizacion(quoteId);
  if (!cotizacion) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await congelarCotizacion(session, cotizacion);
  if (!r.ok) return r;

  revalidar(cotizacion.opportunity.id);
  return ok(null);
}

export async function nuevaVersionAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const quoteId = String(form.get("quoteId") ?? "");
  const { session, cotizacion } = await cargarCotizacion(quoteId);
  if (!cotizacion) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await nuevaVersion(session, cotizacion);
  if (!r.ok) return r;

  revalidar(cotizacion.opportunity.id);
  return ok(r.datos);
}
