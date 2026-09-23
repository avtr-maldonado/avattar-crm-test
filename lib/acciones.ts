import type { ZodError } from "zod";

/**
 * Lo que una Server Action le devuelve a la pantalla.
 *
 * **Las acciones no lanzan.** `evaluateGate` fue construido a propósito para
 * reunir *todos* los requisitos faltantes y no solo el primero, y §13.5 exige
 * que el error se vea dentro del formulario con el dato concreto: «faltan
 * $200,000 por asignar en hitos», no «datos inválidos». Un `throw` aplana esa
 * lista a un mensaje y manda al usuario a una pantalla de error.
 *
 * Las excepciones se reservan para lo que de verdad es excepcional: la base
 * caída, un `id` que no existe. Eso sube y lo atrapa `error.tsx`.
 */
export type Problema = {
  /** El campo del formulario, cuando el problema es de un campo. */
  campo?: string;
  /** En español y con el dato concreto (§13.5). */
  mensaje: string;
};

export type MotivoDeFalla =
  | "VALIDACION"
  | "AUTORIZACION"
  | "COMPUERTA"
  | "CONFIRMACION"
  | "CONFLICTO";

/** `T = null` y no `void`: `datos` siempre existe, aunque no lleve nada. */
export type ResultadoAccion<T = null> =
  | { ok: true; datos: T }
  | { ok: false; motivo: MotivoDeFalla; problemas: Problema[] };

export function ok(): ResultadoAccion<null>;
export function ok<T>(datos: T): ResultadoAccion<T>;
export function ok<T>(datos?: T): ResultadoAccion<T | null> {
  return { ok: true, datos: datos ?? null };
}

export function falla(
  motivo: MotivoDeFalla,
  ...problemas: (string | Problema)[]
): ResultadoAccion<never> {
  return {
    ok: false,
    motivo,
    problemas: problemas.map((p) => (typeof p === "string" ? { mensaje: p } : p)),
  };
}

/**
 * Traduce un `ZodError`. El camino completo va en `campo` para que un problema
 * de `siguiente.subject` se pinte junto a ese control y no al inicio del
 * formulario, donde el usuario no sabría cuál de los dos asuntos está mal.
 */
export function deZod(error: ZodError): ResultadoAccion<never> {
  return {
    ok: false,
    motivo: "VALIDACION",
    problemas: error.issues.map((i) => ({
      campo: i.path.length > 0 ? i.path.join(".") : undefined,
      mensaje: i.message,
    })),
  };
}

/**
 * El problema que corresponde a un campo, si el resultado trae uno.
 *
 * Vive aquí y no junto a los componentes porque no es un componente: es una
 * consulta sobre `ResultadoAccion`, y su lugar es donde ese tipo se define.
 */
export function problemaDe(
  resultado: ResultadoAccion<unknown> | null,
  campo: string,
): string | undefined {
  if (!resultado || resultado.ok) return undefined;
  return resultado.problemas.find((p) => p.campo === campo)?.mensaje;
}

/**
 * Qué campos corrigió el usuario **desde que llegó** un resultado.
 *
 * El problema de un campo se pinta hasta que se toca ese campo: seguir
 * mostrándolo mientras se corrige es regañar por algo que ya se está
 * atendiendo. Pero la corrección vale solo para *ese* resultado. Si se reenvía
 * y el servidor vuelve a rechazar el mismo campo, el rechazo es nuevo y tiene
 * que verse; de otro modo el usuario cree que ya pasó. Por eso las correcciones
 * llevan `de`: el resultado al que pertenecen. Otro resultado, otra cuenta.
 */
export type Correcciones = {
  de: ResultadoAccion<unknown> | null;
  campos: ReadonlySet<string>;
};

export const SIN_CORRECCIONES: Correcciones = { de: null, campos: new Set() };

export function corregir(
  actual: Correcciones,
  resultado: ResultadoAccion<unknown> | null,
  campo: string,
): Correcciones {
  const campos = new Set(actual.de === resultado ? actual.campos : []);
  campos.add(campo);
  return { de: resultado, campos };
}

/** Como `problemaDe`, salvo que el campo ya se haya corregido para ese resultado. */
export function problemaPendiente(
  resultado: ResultadoAccion<unknown> | null,
  correcciones: Correcciones,
  campo: string,
): string | undefined {
  if (correcciones.de === resultado && correcciones.campos.has(campo)) return undefined;
  return problemaDe(resultado, campo);
}
