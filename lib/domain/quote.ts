import { formatUSD, money, type Money } from "@/lib/money";

/**
 * Las fórmulas de cotización · `RN-07`, `RN-08` y `RN-05`.
 *
 * **Todo aquí es puro**: sin base, sin sesión, sin umbrales propios. Los pisos
 * entran por parámetro porque la prueba de `AC-31` verifica que ningún archivo
 * de `lib/domain` importe `lib/policy` — y porque una función que lee su propio
 * umbral no se puede probar contra el escenario que Dirección aprobó.
 *
 * Se opera con `Decimal` de punta a punta (`INV-03`). Nada de `number`: una
 * cotización de tres millones con IVA pierde centavos en punto flotante, y esos
 * centavos son los que no cuadran contra la factura.
 */

export type LineaParaCalcular = {
  quantity: Money;
  unitPrice: Money;
  /** Fracción: 0.15 = 15 %. */
  discountRate: Money;
  unitCost: Money;
};

export type CalculoDeLinea = {
  /** `precio × (1 − descuento)`. */
  neto: Money;
  /** `neto × cantidad`. */
  importe: Money;
  /** `importe − (costo × cantidad)`. */
  utilidad: Money;
  /** `utilidad ÷ importe`. Fracción. */
  margen: Money;
};

/** `RN-07` · el precio después del descuento de línea. */
export function precioNeto(unitPrice: Money, discountRate: Money): Money {
  return unitPrice.times(money(1).minus(discountRate));
}

/**
 * El cálculo de una línea.
 *
 * `RN-07` es explícito en el borde: **el margen de un importe cero es cero, no
 * una división por cero**. Una cantidad en blanco es un renglón que alguien
 * está capturando, no un error que deba tumbar la pantalla.
 */
export function calcularLinea(linea: LineaParaCalcular): CalculoDeLinea {
  const neto = precioNeto(linea.unitPrice, linea.discountRate);
  const importe = neto.times(linea.quantity);
  const utilidad = importe.minus(linea.unitCost.times(linea.quantity));
  const margen = importe.isZero() ? money(0) : utilidad.div(importe);

  return { neto, importe, utilidad, margen };
}

export type TotalesDeCotizacion = {
  /** Antes de descuentos: `Σ precio × cantidad`. */
  grossSubtotal: Money;
  /** Después de descuentos: `Σ importe`. */
  netSubtotal: Money;
  /** Lo que se dejó de cobrar, en importe. */
  descuento: Money;
  /** El descuento global como fracción del bruto. */
  discountRate: Money;
  taxAmount: Money;
  total: Money;
  totalCost: Money;
  grossProfit: Money;
  grossMargin: Money;
};

/**
 * Los totales de la cotización.
 *
 * El descuento global **se deriva de las líneas**, no se captura aparte: es
 * `(bruto − neto) ÷ bruto`. Capturarlo por separado permitiría que la suma de
 * las líneas dijera una cosa y el encabezado otra, y entonces ninguna de las
 * dos serviría para autorizar nada.
 *
 * `taxRate` llega por parámetro y en la práctica sale de la propia cotización,
 * no del país: `RN-24` la congela al crear para que cambiar `Country.taxRate`
 * mañana no altere cotizaciones históricas (`AC-11`).
 */
export function calcularTotales(
  lineas: readonly LineaParaCalcular[],
  taxRate: Money,
): TotalesDeCotizacion {
  let grossSubtotal = money(0);
  let netSubtotal = money(0);
  let totalCost = money(0);

  for (const linea of lineas) {
    grossSubtotal = grossSubtotal.plus(linea.unitPrice.times(linea.quantity));
    netSubtotal = netSubtotal.plus(calcularLinea(linea).importe);
    totalCost = totalCost.plus(linea.unitCost.times(linea.quantity));
  }

  const descuento = grossSubtotal.minus(netSubtotal);
  const grossProfit = netSubtotal.minus(totalCost);
  const taxAmount = netSubtotal.times(taxRate);

  return {
    grossSubtotal,
    netSubtotal,
    descuento,
    // Una cotización vacía no tiene descuento del 100 %: no tiene descuento.
    discountRate: grossSubtotal.isZero() ? money(0) : descuento.div(grossSubtotal),
    taxAmount,
    total: netSubtotal.plus(taxAmount),
    totalCost,
    grossProfit,
    grossMargin: netSubtotal.isZero() ? money(0) : grossProfit.div(netSubtotal),
  };
}

/**
 * `RN-08` · el piso duro de la lista de precio.
 *
 * «Un descuento que deje el precio bajo `minPrice` no se guarda y el error dice
 * el piso aplicable.» Decir solo «descuento no permitido» obliga a adivinar
 * cuánto sí: el mensaje nombra las dos cifras.
 *
 * Devuelve `null` si la línea cumple. Un concepto libre (`Q-07`) no viene de la
 * lista y no tiene piso que hacer cumplir.
 */
export function validarPisoDePrecio(linea: {
  descripcion: string;
  unitPrice: Money;
  discountRate: Money;
  minPrice: Money | null;
}): string | null {
  if (!linea.minPrice) return null;

  const neto = precioNeto(linea.unitPrice, linea.discountRate);
  // Justo en el piso pasa: es el límite, no el borde prohibido.
  if (neto.gte(linea.minPrice)) return null;

  return (
    `«${linea.descripcion}» queda en ${formatUSD(neto)} y su piso es ` +
    `${formatUSD(linea.minPrice)}. Baja el descuento o pide autorización.`
  );
}

export type LineaBajoElPiso = { descripcion: string; margen: Money };

/**
 * `RN-05` · las líneas cuyo margen queda bajo `lineMarginFloor`.
 *
 * «Una línea bajo el piso se señala **aunque el total cumpla**.» Es el caso del
 * escenario aprobado: el margen global da 22.9 %, sobre el piso de 20 %, y aun
 * así la licencia con 6 % tiene que verse. Un promedio sano puede esconder una
 * línea que se está vendiendo a pérdida.
 *
 * **Señala, no bloquea.** La otra mitad de RN-05 —«exige autorización»— vive en
 * `lib/domain/approval.ts`, que queda fuera de este alcance por decisión del
 * negocio del 9-sep-2026.
 */
export function lineasBajoElPiso(
  lineas: readonly (LineaParaCalcular & { descripcion: string })[],
  lineMarginFloor: Money,
): LineaBajoElPiso[] {
  if (lineMarginFloor.lte(0)) return [];

  const bajas: LineaBajoElPiso[] = [];
  for (const linea of lineas) {
    const { margen, importe } = calcularLinea(linea);
    // Un renglón en cero no está bajo el piso: está sin capturar.
    if (importe.isZero()) continue;
    if (margen.lt(lineMarginFloor)) bajas.push({ descripcion: linea.descripcion, margen });
  }
  return bajas;
}
