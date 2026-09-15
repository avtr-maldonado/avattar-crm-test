import { Prisma } from "@prisma/client";
import type { Money } from "@/lib/money";

/**
 * El avance contra objetivos · §10.2 y la regla acumulativa.
 *
 * ## Qué cambia respecto del spec
 *
 * §10.2 medía cada periodo por separado: cuota del trimestre contra lo ganado
 * en el trimestre. El negocio pidió otra cosa el 14 de septiembre de 2026:
 *
 *   «Si se establece un objetivo de 100 por trimestre y en el T1 no se vendió,
 *   pero en el T2 se vendió 200, eso cuenta para los 100 del T1 y los 100 del
 *   T2.»
 *
 * Es decir, **acumulado contra acumulado**. Un trimestre flojo no se perdona:
 * se arrastra. Uno bueno lo paga. La consecuencia práctica es que el número
 * que importa en pantalla no es «cumplí el T2», sino «voy a la par del año».
 * Queda anotada en `decisiones-pendientes.md` §17 como regla que no está en el
 * spec.
 *
 * ## Por qué esto es puro
 *
 * Todo entra por parámetro y nada consulta la base: la aritmética de una cuota
 * es lo que un vendedor va a discutir con su gerente, y tiene que poder
 * probarse renglón por renglón sin datos de por medio.
 *
 * `Decimal` en todas las sumas (INV-03). El cumplimiento sí sale como `number`
 * porque es una razón para pintar una barra, no dinero: nada se decide con sus
 * decimales.
 */
const CERO = new Prisma.Decimal(0);

export type AvanceDeTrimestre = {
  /** 1 a 4. */
  quarter: number;
  /** Cuota fijada para este trimestre solo. */
  cuotaDelTrimestre: Money;
  /** Ganado dentro de este trimestre solo. */
  logradoDelTrimestre: Money;
  /** Suma de las cuotas del T1 a este. Es contra lo que se mide. */
  cuota: Money;
  /** Suma de lo ganado del T1 a este. */
  logrado: Money;
  /**
   * `logrado ÷ cuota`. **Nulo cuando la cuota acumulada es cero**: sin cuota
   * fijada, «cumplió 0 %» es una acusación falsa y dividir entre cero pinta un
   * NaN. Nulo dice la verdad, que es «no hay con qué medirlo».
   */
  cumplimiento: number | null;
  /**
   * Con cuánto se entra al trimestre: negativo es deuda del pasado, positivo es
   * adelanto. Es la cifra que explica por qué el acumulado no cuadra con lo que
   * se vendió este trimestre.
   */
  arrastre: Money;
  /** Lo que falta para ir a la par. Nunca negativo. */
  faltante: Money;
  /** Lo que sobra sobre la par. Nunca negativo. */
  excedente: Money;
};

/**
 * La pista acumulada de los cuatro trimestres, para una métrica.
 *
 * Se llama dos veces por pantalla —una para venta, otra para utilidad— en vez
 * de recibir las dos juntas: son la misma aritmética sobre números distintos, y
 * separarlas evita el objeto con seis campos que nadie recuerda en qué orden
 * van.
 */
export function computeCumulativeTrack(
  cuotaPorTrimestre: readonly Money[],
  logradoPorTrimestre: readonly Money[],
): AvanceDeTrimestre[] {
  const pista: AvanceDeTrimestre[] = [];
  let cuota = CERO;
  let logrado = CERO;

  for (let i = 0; i < 4; i++) {
    const cuotaDelTrimestre = cuotaPorTrimestre[i] ?? CERO;
    const logradoDelTrimestre = logradoPorTrimestre[i] ?? CERO;

    // El arrastre se lee ANTES de sumar este trimestre: es con lo que se entra.
    const arrastre = logrado.minus(cuota);

    cuota = cuota.plus(cuotaDelTrimestre);
    logrado = logrado.plus(logradoDelTrimestre);

    const { cumplimiento, faltante, excedente } = computePeriodProgress(cuota, logrado);

    pista.push({
      quarter: i + 1,
      cuotaDelTrimestre,
      logradoDelTrimestre,
      cuota,
      logrado,
      cumplimiento,
      arrastre,
      faltante,
      excedente,
    });
  }

  return pista;
}

export type AvanceDePeriodo = {
  cumplimiento: number | null;
  faltante: Money;
  excedente: Money;
};

/**
 * El avance de un periodo suelto. Es lo que la vista anual usa, donde no hay
 * nada que acumular porque el año **es** el periodo.
 */
export function computePeriodProgress(cuota: Money, logrado: Money): AvanceDePeriodo {
  const diferencia = logrado.minus(cuota);
  return {
    cumplimiento: cuota.isZero() ? null : logrado.div(cuota).toNumber(),
    faltante: diferencia.isNegative() ? diferencia.negated() : CERO,
    excedente: diferencia.isPositive() ? diferencia : CERO,
  };
}

/**
 * Cobertura · §10.2: pipeline abierto que cierra en el periodo ÷ brecha.
 *
 * **La brecha se mide con `actualCloseDate` y la cobertura con
 * `expectedCloseDate`.** Mezclarlas produce coberturas absurdas al cierre del
 * trimestre, y es el error que §10.2 señala por nombre.
 *
 * Con la cuota ya cubierta devuelve `null`, no infinito: la cobertura deja de
 * ser una pregunta interesante, y pintar «∞ ×» es ruido donde debería decirse
 * «cubierta».
 */
export function computeCoverage(brecha: Money, pipelineDelPeriodo: Money): number | null {
  if (brecha.lte(0)) return null;
  return pipelineDelPeriodo.div(brecha).toNumber();
}
