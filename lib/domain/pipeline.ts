import { sum, type Money } from "@/lib/money";

/**
 * El ponderado · RN-01.
 *
 * `amount × stage.probability`. Nada más.
 *
 * La probabilidad la fija la etapa, no el usuario, y **MEDDIC no altera esta
 * fórmula**: se evaluó que el puntaje moviera la probabilidad y se decidió que
 * no (§2.1). MEDDIC gatea el avance y el cierre; el pronóstico lo mueve la
 * etapa. Dos mecanismos empujando el mismo número hacen imposible explicar un
 * pronóstico en el comité comercial.
 *
 * La firma toma exactamente dos argumentos a propósito: no hay por dónde colar
 * el puntaje sin cambiarla, y cambiarla se ve en el diff.
 */
export function weightedAmount(amount: Money, probability: Money): Money {
  return amount.times(probability);
}

/**
 * Suma ponderada de un conjunto, para los indicadores de encabezado de P-01.
 *
 * Recibe las oportunidades ya acotadas por `lib/scope`: para un Vendedor esto
 * suma **solo su conjunto**, nunca el total de la oficina (§2.3).
 */
export function weightedTotal(
  oportunidades: { amount: Money; stage: { probability: Money } }[],
): Money {
  return sum(oportunidades.map((o) => weightedAmount(o.amount, o.stage.probability)));
}

/** Valor abierto: la suma sin ponderar. El otro indicador de P-01. */
export function openTotal(oportunidades: { amount: Money }[]): Money {
  return sum(oportunidades.map((o) => o.amount));
}

/**
 * Lo ganado en un periodo, para el indicador «Ganado» de P-01.
 *
 * Se mide con `actualCloseDate`, nunca con el estimado: el avance es lo que ya
 * pasó (§10.2). Una `GANADA` sin fecha de cierre real es un dato roto y no
 * cuenta, en vez de colarse como si hubiera cerrado hoy. Recibe el conjunto ya
 * acotado por `lib/scope` y por los filtros: para un vendedor suma solo lo suyo.
 */
export function wonInPeriod<T extends { status: string; actualCloseDate: Date | null }>(
  oportunidades: readonly T[],
  periodo: { from: Date | null; to: Date },
): T[] {
  return oportunidades.filter(
    (o) =>
      o.status === "GANADA" &&
      o.actualCloseDate !== null &&
      (periodo.from === null || o.actualCloseDate >= periodo.from) &&
      o.actualCloseDate <= periodo.to,
  );
}

const RANGO_DE_ESTATUS: Record<string, number> = { ABIERTA: 0, GANADA: 1, PERDIDA: 2 };

/**
 * Abiertas, después ganadas, después perdidas · decisiones §25.
 *
 * Es el orden de lectura de un tablero cuando el filtro de estatus deja ver
 * cerradas: lo que todavía se trabaja arriba, lo que ya se decidió debajo. Es
 * estable: dentro de cada grupo se conserva el orden con que llegó (por
 * importe, desde la consulta). No muta la lista.
 */
export function ordenarPorEstatus<T extends { status: string }>(lista: readonly T[]): T[] {
  return [...lista].sort(
    (a, b) => (RANGO_DE_ESTATUS[a.status] ?? 3) - (RANGO_DE_ESTATUS[b.status] ?? 3),
  );
}
