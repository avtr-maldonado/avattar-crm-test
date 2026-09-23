"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import {
  abrirCotizacion,
  guardarCambiosDeCotizacion,
  guardarLinea,
  quitarLinea,
  type CambioPorLinea,
  type CambiosDeLinea,
} from "@/lib/domain/quoteService";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";

/**
 * Las mutaciones de la pestaña Cotización · E2, decisiones §21.
 *
 * El piso de margen por línea se lee aquí y se pasa al dominio: `lib/domain` no
 * importa `lib/policy` (AC-31).
 */
const NO_ALCANZA = "No encontramos esa cotización, o no está a tu alcance.";

export type ResultadoDeCotizacion = ResultadoAccion<{ id: string; cambios?: number } | null>;

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
  // Cada cambio espeja `amount` y `grossMargin` en la oportunidad, y con ellos
  // las cifras del tablero y las banderas de riesgo.
  revalidatePath("/oportunidades");
}

// ═════════════════════════════════════════════════════ Abrir la cotización

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
  const r = await abrirCotizacion(session, detalle, pais.taxRate);
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

/** Llega como porcentaje —«15»— y se guarda como fracción (INV-03). */
const porcentaje = z
  .string()
  .trim()
  .transform((v) => (v === "" ? "0" : v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "El descuento va de 0 a 100."))
  .refine((v) => Number(v) <= 100, "El descuento no puede pasar de 100 %.");

const aFraccion = (pct: string) => (Number(pct) / 100).toFixed(4);

const esquemaLinea = z.object({
  quoteId: z.string().min(1),
  productId: z.string().optional(),
  description: z.string().trim().optional(),
  unit: z.string().trim().optional(),
  unitPrice: z.string().trim().optional(),
  unitCost: z.string().trim().optional(),
  quantity: decimal("La cantidad tiene que ser un número."),
  discountPct: porcentaje,
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
      productId: d.productId || undefined,
      description: d.description,
      unit: d.unit,
      // Vacío es «el de la lista»; con valor, es la referencia corregida.
      unitPrice: d.unitPrice || undefined,
      unitCost: d.unitCost || undefined,
      quantity: d.quantity,
      discountRate: aFraccion(d.discountPct),
    },
    umbrales,
  );
  if (!r.ok) return r;

  revalidar(cotizacion.opportunity.id);
  return ok(null);
}

const CAMPO_DE_CELDA = /^linea\.([^.]+)\.(quantity|unitPrice|discountPct|unitCost)$/;

type CampoDeCelda = "quantity" | "unitPrice" | "discountPct" | "unitCost";

/**
 * El «Guardar» de la pestaña: todas las celdas en un viaje.
 *
 * El formulario manda cada celda como `linea.<id>.<campo>`, con lo que tenga,
 * haya cambiado o no. El dominio compara contra lo guardado y aplica solo lo
 * que de verdad cambió de valor; si nada cambió, no escribe nada. Devuelve
 * cuántos cambios hubo, para que el aviso lo diga.
 */
export async function guardarCotizacionAccion(
  _previo: ResultadoDeCotizacion | null,
  form: FormData,
): Promise<ResultadoDeCotizacion> {
  const quoteId = String(form.get("quoteId") ?? "");
  if (!quoteId) return falla("VALIDACION", "Falta la cotización.");

  const porLinea = new Map<string, CambiosDeLinea>();
  for (const [nombre, valor] of form.entries()) {
    const m = CAMPO_DE_CELDA.exec(nombre);
    if (!m || typeof valor !== "string") continue;
    const [, lineId, campo] = m as unknown as [string, string, CampoDeCelda];

    const cambio = cambiosDe(campo, valor);
    if (!cambio.ok) return cambio;
    porLinea.set(lineId, { ...(porLinea.get(lineId) ?? {}), ...cambio.datos });
  }
  const cambios: CambioPorLinea[] = [...porLinea].map(([lineId, campos]) => ({ lineId, campos }));

  const { session, cotizacion, umbrales } = await cargarCotizacion(quoteId);
  if (!cotizacion || !umbrales) return falla("AUTORIZACION", NO_ALCANZA);

  const r = await guardarCambiosDeCotizacion(session, cotizacion, cambios, umbrales);
  if (!r.ok) return r;

  if (r.datos.cambios > 0) revalidar(cotizacion.opportunity.id);
  return ok({ id: cotizacion.id, cambios: r.datos.cambios });
}

function cambiosDe(campo: CampoDeCelda, valor: string): ResultadoAccion<CambiosDeLinea> {
  if (campo === "discountPct") {
    const pct = porcentaje.safeParse(valor);
    return pct.success
      ? ok({ discountRate: aFraccion(pct.data) })
      : falla("VALIDACION", {
          campo: "discountPct",
          mensaje: pct.error.issues[0]?.message ?? "Descuento inválido.",
        });
  }
  const num = decimal("Escribe un número, sin símbolo.").safeParse(valor);
  if (!num.success) {
    return falla("VALIDACION", { campo, mensaje: num.error.issues[0]?.message ?? "Valor inválido." });
  }
  return ok({ [campo]: num.data });
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
