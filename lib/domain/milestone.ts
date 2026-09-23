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
 * Compara la suma de los hitos contra el neto de la cotización (con líneas).
 *
 * `AC-18` es explícito sobre el mensaje: **«faltan $200,000 por asignar»**, no
 * «los hitos no cuadran». Decir que no cuadra obliga a quien lee a sacar la
 * calculadora para saber cuánto le falta, y es justo el dato que ya se tiene.
 */
export function cuadreDeHitos(montos: readonly Money[], neto: Money | null): ResultadoDeCuadre {
  const asignado = sum([...montos]);

  if (neto === null) {
    // Sin cotización con líneas no hay total contra el cual repartir. Eso es
    // distinto de «cuadra en cero»: confundirlos dejaría pasar una oportunidad
    // sin calendario de cobro.
    return {
      cuadra: false,
      diferencia: money(0),
      asignado,
      mensaje: "Todavía no hay cotización con líneas contra la cual cuadrar los hitos.",
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

export type ResultadoDeTope = {
  /** La suma con el hito nuevo (o corregido) incluido. */
  suma: Money;
  /** Lo que se puede asignar sin pasarse, sin contar el hito nuevo. `null` sin neto. */
  disponible: Money | null;
  excede: boolean;
  /** `null` cuando cabe. Con las tres cifras cuando no. */
  mensaje: string | null;
};

/**
 * La suma de hitos no supera el neto (regla del negocio del 22-sep-2026,
 * decisiones §22). El cuadre de `RN-06` ya sabía decir «sobran»; esto lo impide
 * antes de guardar.
 *
 * `otros` son los demás hitos: al editar, quien llama saca el que se corrige,
 * si no su monto anterior contaría dos veces. Sin neto no hay tope: no hay
 * contra qué comparar, y capturar en monto sigue permitido.
 */
export function topeDeHitos(
  otros: readonly Money[],
  nuevo: Money,
  neto: Money | null,
): ResultadoDeTope {
  const asignado = sum([...otros]);
  const suma = asignado.plus(nuevo);
  if (neto === null) return { suma, disponible: null, excede: false, mensaje: null };

  const disponible = neto.minus(asignado);
  if (suma.lte(neto)) return { suma, disponible, excede: false, mensaje: null };

  const exceso = suma.minus(neto);
  const cola = disponible.gt(0)
    ? `Quedan ${formatUSD(disponible)} por asignar.`
    : "Ya no queda nada por asignar.";
  return {
    suma,
    disponible,
    excede: true,
    mensaje: `Con este hito los hitos sumarían ${formatUSD(suma)}: ${formatUSD(exceso)} más que el neto de ${formatUSD(neto)}. ${cola}`,
  };
}
