import { formatUSD, money, sum, type Money } from "@/lib/money";

/**
 * El cuadre de hitos de facturación · `RN-06`, `HF-01` y `HF-04`.
 *
 * ## Se guarda monto, nunca porcentaje
 *
 * §4 lo fija: «la captura permite alternar `%` y monto, pero lo almacenado
 * siempre es monto». La razón no es de comodidad: si la cotización cambia y los
 * hitos fueran porcentajes, se reajustarían solos y nadie se enteraría. Guardados
 * como monto, el sistema **avisa que el calendario dejó de cuadrar**, que es lo
 * que alguien tiene que ir a decidir. Un calendario de cobro que se recalcula
 * solo es un calendario en el que nadie confía.
 */

export type ResultadoDeCuadre = {
  cuadra: boolean;
  /** Neto menos la suma. Positivo: falta por asignar. Negativo: sobra. */
  diferencia: Money;
  asignado: Money;
  /** `null` cuando cuadra. Con la cifra concreta cuando no. */
  mensaje: string | null;
};

/**
 * Compara la suma de los hitos contra el neto de la cotización congelada.
 *
 * `AC-18` es explícito sobre el mensaje: **«faltan $200,000 por asignar»**, no
 * «los hitos no cuadran». Decir que no cuadra obliga a quien lee a sacar la
 * calculadora para saber cuánto le falta, y es justo el dato que ya se tiene.
 */
export function cuadreDeHitos(montos: readonly Money[], neto: Money | null): ResultadoDeCuadre {
  const asignado = sum([...montos]);

  if (neto === null) {
    // Sin cotización congelada no hay total contra el cual repartir. Eso es
    // distinto de «cuadra en cero»: confundirlos dejaría pasar una oportunidad
    // sin calendario de cobro.
    return {
      cuadra: false,
      diferencia: money(0),
      asignado,
      mensaje: "Todavía no hay cotización congelada contra la cual cuadrar los hitos.",
    };
  }

  const diferencia = neto.minus(asignado);
  if (diferencia.isZero()) {
    return { cuadra: true, diferencia, asignado, mensaje: null };
  }

  const mensaje = diferencia.gt(0)
    ? `Faltan ${formatUSD(diferencia)} por asignar en hitos.`
    : // Repartir de más no es «casi bien»: son hitos que nadie va a poder
      // facturar contra ese contrato.
      `Sobran ${formatUSD(diferencia.abs())} repartidos de más en los hitos.`;

  return { cuadra: false, diferencia, asignado, mensaje };
}

/** El conmutador `%` → monto de la captura (`F-302`). Lo que se guarda es esto. */
export function montoDesdePorcentaje(porcentaje: Money, neto: Money): Money {
  return neto.times(porcentaje).div(100);
}

/** Y de vuelta, solo para mostrar. Un neto en cero no es una división por cero. */
export function porcentajeDelNeto(monto: Money, neto: Money): Money {
  return neto.isZero() ? money(0) : monto.div(neto).times(100);
}
