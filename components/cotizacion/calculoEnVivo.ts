import Decimal from "decimal.js";
import type { TotalesFormateados } from "./TablaDeCotizacion";

/**
 * La vista previa de la cotización mientras se edita · `RN-07`, `RN-05`.
 *
 * ## Por qué hay aritmética de dinero en el cliente
 *
 * Lo que se **guarda** lo calcula el servidor con `Prisma.Decimal`
 * (`lib/domain/quote.ts`, INV-03). Pero editar una cotización mirando cifras
 * viejas es editar a ciegas: al teclear una cantidad, el importe, el margen y
 * los totales tienen que moverse. Este módulo repite las fórmulas de RN-07 con
 * `decimal.js` —la misma librería que Prisma empaqueta— para que la vista previa
 * diga, al centavo, lo que el servidor va a guardar. **No usa `number`**: la
 * señal más importante de la interfaz es verde o coral según el piso (§13.1), y
 * un flotante en el borde la pintaría del color equivocado.
 *
 * `lib/money` no puede correr aquí porque importa `@prisma/client`; por eso los
 * formateadores se repiten. La prueba de paridad (`calculoEnVivo.test.ts`)
 * compara este módulo contra el dominio, cadena por cadena.
 *
 * Sin `VER_COSTO` no llega el costo (INV-02) y no se calculan utilidad, margen
 * ni piso: se dejan `undefined` y la tabla dice que se recalculan al guardar.
 */

export type LineaEnVivoEntrada = {
  id: string;
  cantidad: string;
  precioUnitario: string;
  /** En por ciento, como se teclea: «10» es 10 %. */
  descuentoPct: string;
  /** Ausente sin VER_COSTO. */
  costoUnitario?: string;
};

export type ParametrosEnVivo = {
  /** Fracción: «0.16». La copiada en la cotización (RN-24). */
  taxRate: string;
  /** Fracción: «0.10». El piso de margen por línea (RN-05). */
  pisoDeLinea: string;
  verCosto: boolean;
  verMargen: boolean;
};

export type LineaEnVivo = {
  id: string;
  precioNeto: string;
  importe: string;
  utilidad?: string;
  margen?: string;
  bajoElPiso: boolean;
};

const CERO = new Decimal(0);
const UNO = new Decimal(1);
const CIEN = new Decimal(100);

/** Lo tecleado, como importe. Vacío o ilegible es cero: un renglón a medias (RN-07). */
function leer(texto: string | undefined): Decimal {
  const limpio = (texto ?? "").trim().replace(/,/g, "");
  if (limpio === "") return CERO;
  try {
    const d = new Decimal(limpio);
    return d.isFinite() ? d : CERO;
  } catch {
    return CERO;
  }
}

// Los mismos formatos que `lib/money`, que aquí no se puede importar.
const FORMATO_USD = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const FORMATO_PUNTOS = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `Intl` acepta cadenas y conserva la precisión; los tipos no lo saben. */
function usd(v: Decimal): string {
  return FORMATO_USD.format(v.toString() as unknown as number);
}

function porciento(fraccion: Decimal): string {
  const puntos = fraccion.times(CIEN).toFixed(1);
  return `${FORMATO_PUNTOS.format(puntos as unknown as number)} %`;
}

export function calcularEnVivo(
  lineas: readonly LineaEnVivoEntrada[],
  parametros: ParametrosEnVivo,
): { lineas: LineaEnVivo[]; totales: TotalesFormateados } {
  const { verCosto, verMargen } = parametros;
  const piso = leer(parametros.pisoDeLinea);
  const hayPiso = piso.gt(0);

  let grossSubtotal = CERO;
  let netSubtotal = CERO;
  let totalCost = CERO;

  const calculadas = lineas.map((l) => {
    const cantidad = leer(l.cantidad);
    const precio = leer(l.precioUnitario);
    const descuento = leer(l.descuentoPct).div(CIEN);
    const costo = leer(l.costoUnitario);

    // RN-07 · precio × (1 − descuento); el margen de un importe cero es cero.
    const neto = precio.times(UNO.minus(descuento));
    const importe = neto.times(cantidad);
    const utilidad = importe.minus(costo.times(cantidad));
    const margen = importe.isZero() ? CERO : utilidad.div(importe);

    grossSubtotal = grossSubtotal.plus(precio.times(cantidad));
    netSubtotal = netSubtotal.plus(importe);
    totalCost = totalCost.plus(costo.times(cantidad));

    return {
      id: l.id,
      precioNeto: usd(neto),
      importe: usd(importe),
      ...(verCosto ? { utilidad: usd(utilidad) } : {}),
      ...(verCosto && verMargen ? { margen: porciento(margen) } : {}),
      // RN-05 · un renglón en cero no está bajo el piso: está sin capturar.
      bajoElPiso: verCosto && hayPiso && !importe.isZero() && margen.lt(piso),
    };
  });

  const descuento = grossSubtotal.minus(netSubtotal);
  const grossProfit = netSubtotal.minus(totalCost);
  const taxAmount = netSubtotal.times(leer(parametros.taxRate));

  return {
    lineas: calculadas,
    totales: {
      grossSubtotal: usd(grossSubtotal),
      descuento: usd(descuento),
      descuentoPct: porciento(grossSubtotal.isZero() ? CERO : descuento.div(grossSubtotal)),
      netSubtotal: usd(netSubtotal),
      taxPct: `${leer(parametros.taxRate).times(CIEN).toFixed(0)} %`,
      taxAmount: usd(taxAmount),
      total: usd(netSubtotal.plus(taxAmount)),
      ...(verCosto ? { totalCost: usd(totalCost), grossProfit: usd(grossProfit) } : {}),
      ...(verCosto && verMargen
        ? { grossMargin: porciento(netSubtotal.isZero() ? CERO : grossProfit.div(netSubtotal)) }
        : {}),
    },
  };
}
