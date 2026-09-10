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
