"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { guardarCuotasDelEquipo } from "@/lib/domain/objetivo";

/**
 * Server Actions de P-08 · Objetivos.
 *
 * El contrato de siempre: valida con Zod, autoriza dentro del servicio de
 * dominio, y **nunca lanza**. Devuelve `ResultadoAccion`.
 *
 * El dinero llega como cadena y se queda como cadena hasta `money()` en el
 * dominio (INV-03): convertirlo a `number` aquí para «validar que es número»
 * perdería precisión antes de llegar a la base.
 */
const CIFRA = /^\d+(\.\d{1,4})?$/;

const esquemaCambios = z.object({
  filas: z.array(
    z.object({
      userId: z.string().min(1),
      cuotas: z
        .array(z.string().trim().regex(CIFRA, "Escribe la cuota como número, sin signo ni comas: 450000 o 450000.50."))
        .length(4),
    }),
  ),
  eliminar: z.array(z.string().min(1)),
});

const esquema = z.object({
  countryCode: z.enum(["MX", "CO", "CL"]),
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  metrica: z.enum(["VENTA", "UTILIDAD"]),
  cambios: z.string().min(1),
});

/**
 * Guarda la cuadrícula por vendedor y trimestre · decisiones §34.
 *
 * Las filas viajan como JSON en un campo oculto —veinte celdas de dinero no
 * caben cómodamente como campos sueltos— y se validan aquí una por una.
 */
export async function guardarCuotasAccion(
  _previo: ResultadoAccion<{ cambios: number }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ cambios: number }>> {
  const datos = esquema.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);

  let crudo: unknown;
  try {
    crudo = JSON.parse(datos.data.cambios);
  } catch {
    return falla("VALIDACION", { campo: "cambios", mensaje: "No se pudieron leer los cambios. Vuelve a intentar." });
  }
  const cambios = esquemaCambios.safeParse(crudo);
  if (!cambios.success) return deZod(cambios.error);

  const session = await requireSession();
  const resultado = await guardarCuotasDelEquipo(session, {
    countryCode: datos.data.countryCode,
    fiscalYear: datos.data.fiscalYear,
    metrica: datos.data.metrica,
    filas: cambios.data.filas,
    eliminar: cambios.data.eliminar,
  });

  if (resultado.ok) revalidatePath("/objetivos");
  return resultado;
}
