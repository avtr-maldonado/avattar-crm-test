"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { crearProducto, editarProducto } from "@/lib/domain/product";
import { getCommercialPolicy } from "@/lib/policy";
import { getProducto } from "@/lib/scope/productos";

/**
 * Las mutaciones de P-06.
 *
 * El piso de margen por línea se lee aquí y se pasa al dominio: `lib/domain` no
 * importa `lib/policy` (AC-31). La lista es única en USD para los tres países y
 * el piso es por país; **se usa el de México**, como hace el seed. Si el negocio
 * prefiere el más estricto de los tres, este es el único lugar que cambia.
 */
async function umbrales() {
  const politica = await getCommercialPolicy("MX");
  return { lineMarginFloor: politica.lineMarginFloor.toString() };
}

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
    await umbrales(),
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
    await umbrales(),
  );
  if (!r.ok) return r;

  revalidatePath("/productos");
  return ok(null);
}
