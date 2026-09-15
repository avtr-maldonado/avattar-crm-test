"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { fijarObjetivo } from "@/lib/domain/objetivo";

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

const esquema = z.object({
  userId: z.string().min(1, "Elige a quién se le fija la cuota."),
  countryCode: z.enum(["MX", "CO", "CL"]),
  fiscalYear: z.coerce.number().int().min(2000).max(2200),
  periodType: z.enum(["TRIMESTRAL", "ANUAL"]),
  quarter: z.coerce.number().int().min(1).max(4).nullable(),
  revenueQuota: z
    .string()
    .regex(CIFRA, "Escribe la cuota como número, sin signo ni comas: 450000 o 450000.50."),
  grossProfitQuota: z
    .string()
    .regex(CIFRA, "Escribe la cuota como número, sin signo ni comas: 135000 o 135000.50."),
});

export async function fijarObjetivoAccion(
  _previo: ResultadoAccion<{ id: string }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ id: string }>> {
  const session = await requireSession();

  const crudo = Object.fromEntries(form);
  const analisis = esquema.safeParse({
    ...crudo,
    // El control queda deshabilitado en ANUAL, así que el campo no viaja: el
    // esquema no debe exigir lo que el formulario decidió no mandar.
    quarter: crudo.periodType === "ANUAL" ? null : (crudo.quarter ?? null),
  });

  if (!analisis.success) return deZod(analisis.error);

  const resultado = await fijarObjetivo(session, analisis.data);

  // La pantalla se relee con la cuota nueva. El formulario se queda abierto
  // —cargar los cuatro trimestres de alguien seguidos es el caso normal—, así
  // que `router.refresh()` del cliente no bastaría por sí solo para invalidar
  // el caché del servidor.
  if (resultado.ok) revalidatePath("/objetivos");

  return resultado;
}
