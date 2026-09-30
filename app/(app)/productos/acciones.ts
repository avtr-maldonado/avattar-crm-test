"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { crearProducto, editarProducto } from "@/lib/domain/product";
import { getProducto } from "@/lib/scope/productos";

/**
 * Las mutaciones de P-06. Sin umbrales que pasar al dominio desde el 29-sep-2026
 * (decisiones §33): la lista es precio y costo, y nada más.
 */

/** Alta y edición comparten formulario, así que comparten tipo de resultado. */
export type ResultadoDeProducto = ResultadoAccion<{ id: string } | null>;

/**
 * `INV-03` · el importe viaja como cadena. Se aceptan comas de miles.
 *
 * Vacío —o ausente, si la sesión no ve el costo y el campo no se pintó— es
 * `null`: sin lista, precio y costo se fijan en cada cotización (decisiones §22).
 */
const importeOpcional = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().replace(/,/g, ""))
  .pipe(
    z.union([
      z.literal(""),
      z.string().regex(/^\d+(\.\d{1,4})?$/, "Escribe el importe en dólares, sin símbolo."),
    ]),
  )
  .transform((v) => (v === "" ? null : v));

const MODELOS = [
  "PRECIO_FIJO",
  "TIEMPO_Y_MATERIALES",
  "RECURRENTE",
  "RECURRENTE_ANUAL",
  "POR_CONSUMO",
] as const;

const camposComunes = {
  name: z.string().trim().min(3, "Ponle nombre al producto."),
  description: z.string().trim().optional(),
  familyId: z.string().min(1, "Elige la familia."),
  unit: z.string().trim().min(1, "Di en qué unidad se vende."),
  priceModel: z.enum(MODELOS),
  listPrice: importeOpcional,
  standardCost: importeOpcional,
};

const esquemaAlta = z.object({ sku: z.string().trim().min(3, "El SKU necesita al menos tres caracteres."), ...camposComunes });

export async function crearProductoAccion(
  _previo: ResultadoDeProducto | null,
  form: FormData,
): Promise<ResultadoDeProducto> {
  const datos = esquemaAlta.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  const session = await requireSession();
  const r = await crearProducto(
    session,
    { ...datos.data, description: datos.data.description || null },
  );
  if (!r.ok) return r;

  revalidatePath("/productos");
  return ok(r.datos);
}

const esquemaEdicion = z.object({
  productId: z.string().min(1),
  ...camposComunes,
  // Una casilla sin marcar no viaja en el FormData: su ausencia ES `false`.
  active: z.coerce.boolean().optional(),
});

export async function editarProductoAccion(
  _previo: ResultadoDeProducto | null,
  form: FormData,
): Promise<ResultadoDeProducto> {
  const datos = esquemaEdicion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const producto = await getProducto(session, d.productId);
  if (!producto) return falla("AUTORIZACION", "No encontramos ese producto.");

  const r = await editarProducto(
    session,
    producto,
    {
      name: d.name,
      description: d.description || null,
      familyId: d.familyId,
      unit: d.unit,
      priceModel: d.priceModel,
      active: d.active ?? false,
      // Vacíos = no se tocan. Quitar una lista existente no está previsto.
      listPrice: d.listPrice ?? undefined,
      standardCost: d.standardCost ?? undefined,
    },
  );
  if (!r.ok) return r;

  revalidatePath("/productos");
  return ok(null);
}
