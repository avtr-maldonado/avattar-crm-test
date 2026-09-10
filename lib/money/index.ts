import { Prisma } from "@prisma/client";

/**
 * El dinero del sistema · INV-03.
 *
 * Todo importe es `Decimal(18,4)` en la base y se opera con `Decimal` en el
 * servidor. Nunca con `number`: `0.1 + 0.2` no es `0.3`, y en un sistema que
 * dispara autorizaciones cuando el margen cae bajo un piso, un centavo mal
 * redondeado cambia una decisión de negocio.
 *
 * `Prisma.Decimal` es `decimal.js`. Se usa esa misma clase, y no otra copia,
 * para no convertir en la frontera con la base.
 *
 * Los porcentajes se guardan como **fracción**: `0.1500` es 15 %. El formateo
 * a «15 %» es de presentación y vive en `formatPercent`.
 */
export type Money = Prisma.Decimal;

/**
 * Construye un importe.
 *
 * Acepta enteros como `number` porque son cómodos en el seed y en las pruebas,
 * pero **rechaza un `number` con decimales**: para cuando llega aquí ya viene
 * corrompido, y aceptarlo propagaría el error en silencio. Los decimales se
 * pasan como cadena: `money("1234.56")`.
 */
export function money(v: string | number | Money): Money {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new TypeError(
      `INV-03: ${v} llega como number con decimales, y para este punto ya perdió precisión. ` +
        `Pásalo como cadena: money("${v}").`,
    );
  }
  return new Prisma.Decimal(v);
}

/**
 * Serialización hacia el cliente.
 *
 * Siempre string, nunca `number`: un `Decimal` no sobrevive a `JSON.stringify`
 * y un `number` pierde precisión. Los DTO tipan el dinero como `string`, así
 * que un componente no puede sumar importes sin un parseo explícito y visible
 * en el diff.
 */
export function toClient(v: Money): string {
  return v.toString();
}

/** Suma una lista de importes. Una lista vacía es cero, no un error. */
export function sum(values: Money[]): Money {
  return values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));
}

/**
 * `Intl.NumberFormat.format` acepta cadenas en tiempo de ejecución y preserva
 * la precisión; pasar por `number` la corrompe por encima de 2^53. Los tipos de
 * TypeScript, en cambio, solo admiten `StringNumericLiteral`, que son literales
 * y no cadenas calculadas.
 *
 * La conversión se encapsula aquí, una sola vez y con la razón escrita, en vez
 * de esparcir casts en cada punto de formateo. Verificado en `money.test.ts` con
 * un valor por encima de 2^53.
 */
function formatear(formato: Intl.NumberFormat, valor: string): string {
  return formato.format(valor as unknown as number);
}

const FORMATO_USD = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  // Sin esto, `es-MX` escribe «USD 324,000.00» en vez de «$324,000.00».
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea un importe: `"324000"` → `"$324,000.00"`. */
export function formatUSD(v: string | Money): string {
  return formatear(FORMATO_USD, typeof v === "string" ? v : v.toString());
}

/**
 * Formatea una fracción como porcentaje, con la convención en español: espacio
 * antes del signo. `"0.4136"` → `"41.4 %"` (RN-07).
 */
export function formatPercent(fraction: string | Money, decimals = 1): string {
  const valor = typeof fraction === "string" ? new Prisma.Decimal(fraction) : fraction;
  const puntos = valor.times(100).toFixed(decimals);
  // `Intl` con style:"percent" no permite el espacio antes del signo que usa
  // el español, así que el número se formatea aparte y el signo se une aquí.
  const conMiles = formatear(
    new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    puntos,
  );
  return `${conMiles} %`;
}
