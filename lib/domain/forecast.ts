import { Prisma, type ForecastCategory } from "@prisma/client";
import { trimestreDe } from "@/lib/filters/dates";
import type { Money } from "@/lib/money";
import { weightedAmount } from "./pipeline";

/**
 * El forecast de P-01 · un tablero de columnas por mes o por trimestre fiscal,
 * con cada oportunidad abierta en la columna de su cierre estimado.
 *
 * ## Dos lentes, a propósito distintas
 *
 *   - **La categoría** es el juicio del vendedor (`RN-15`): compromiso, mejor
 *     caso, pipeline u omitida. Con el límite de `RN-29`: comprometer pide un
 *     MEDDIC mínimo, y eso lo valida quien guarda la categoría, no esto.
 *   - **El ponderado** es la etapa (`RN-01`): importe × probabilidad. MEDDIC
 *     no lo altera.
 *
 * Cada columna trae las dos, y las oportunidades mismas, para que la pantalla
 * pinte sus tarjetas.
 *
 * ## Lo vencido va aparte, y el pasado no existe
 *
 * Una oportunidad abierta con cierre estimado antes de hoy no pertenece a
 * ningún periodo del forecast: es una fecha que hay que corregir. Va en su
 * propia columna, al principio. Por eso la ventana **no mira hacia atrás**: lo
 * que tendría un periodo pasado ya está en «vencidas».
 *
 * ## La ventana es fija y se desplaza
 *
 * Seis meses o cuatro trimestres, a partir del periodo en curso más el
 * desplazamiento. Es un tablero de columnas, y siete columnas es lo que cabe en
 * una laptop con las tarjetas legibles; estirarlo hasta la oportunidad más
 * lejana haría veinte columnas por un negocio que cierra en 2028. Lo que queda
 * fuera **se cuenta, no se pierde**: `fueraDeVentana` dice cuántas hay antes y
 * después, para que la pantalla lo diga junto a las flechas.
 *
 * Función pura. El mes de arranque del año fiscal es dato (`INV-05`); los
 * tamaños de ventana son de presentación, no umbrales de negocio.
 */
export type Agrupacion = "mes" | "trimestre";

export type PeriodoDeForecast =
  | { tipo: "vencidas" }
  | { tipo: "mes"; anio: number; mes: number }
  | { tipo: "trimestre"; fiscalYear: number; quarter: number };

export type OportunidadParaForecast = {
  amount: Money;
  expectedCloseDate: Date;
  forecastCategory: ForecastCategory;
  stage: { probability: Money };
  /**
   * Si viene, solo `ABIERTA` suma (RN-12): las cerradas se acomodan en su
   * columna para verlas, pero no son dinero por cerrar. Sin estatus, todo
   * cuenta, como cuando el forecast solo recibía abiertas.
   */
  status?: string;
};

export type ColumnaDeForecast<T extends OportunidadParaForecast> = {
  clave: string;
  periodo: PeriodoDeForecast;
  oportunidades: T[];
  /** Todo lo abierto de la columna, omitidas incluidas. Cuadra con «Valor abierto». */
  total: Money;
  ponderado: Money;
  porCategoria: Record<ForecastCategory, Money>;
  /** El periodo en curso. Nunca la columna de vencidas. */
  esActual: boolean;
};

export type ResultadoDeForecast<T extends OportunidadParaForecast> = {
  columnas: ColumnaDeForecast<T>[];
  /** Cuántas abiertas cayeron antes de la primera columna y después de la última. */
  fueraDeVentana: { antes: number; despues: number };
  /** Hasta dónde se puede seguir avanzando: hay algo después. */
  desplazamiento: number;
};

export const VENTANA_DE_FORECAST: Record<Agrupacion, number> = { mes: 6, trimestre: 4 };

const CERO = new Prisma.Decimal(0);
const CATEGORIAS: ForecastCategory[] = ["COMPROMISO", "MEJOR_CASO", "PIPELINE", "OMITIDA"];

export function buildForecast<T extends OportunidadParaForecast>(
  abiertas: readonly T[],
  opciones: {
    agrupar: Agrupacion;
    fiscalYearStartMonth: number;
    ahora: Date;
    /** Periodos hacia adelante desde el actual. Nunca negativo. */
    desplazamiento?: number;
  },
): ResultadoDeForecast<T> {
  const { agrupar, fiscalYearStartMonth, ahora } = opciones;
  const desplazamiento = Math.max(0, Math.trunc(opciones.desplazamiento ?? 0));
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());

  // Cada periodo se reduce a un entero consecutivo para recorrerlos y
  // compararlos: mes → año × 12 + mes; trimestre → año fiscal × 4 + trimestre.
  const indiceDe = (fecha: Date): number => {
    if (agrupar === "mes") return fecha.getUTCFullYear() * 12 + fecha.getUTCMonth();
    const t = trimestreDe(fecha, fiscalYearStartMonth);
    return t.fiscalYear * 4 + (t.quarter - 1);
  };
  const periodoDe = (indice: number): PeriodoDeForecast =>
    agrupar === "mes"
      ? { tipo: "mes", anio: Math.floor(indice / 12), mes: (indice % 12) + 1 }
      : { tipo: "trimestre", fiscalYear: Math.floor(indice / 4), quarter: (indice % 4) + 1 };
  const claveDe = (p: PeriodoDeForecast): string =>
    p.tipo === "vencidas"
      ? "vencidas"
      : p.tipo === "mes"
        ? `${p.anio}-${String(p.mes).padStart(2, "0")}`
        : `${p.fiscalYear}-T${p.quarter}`;

  const actual = indiceDe(ahora);
  const primero = actual + desplazamiento;
  const ultimo = primero + VENTANA_DE_FORECAST[agrupar] - 1;

  // Un solo recorrido reparte todo: vencidas, columnas y lo que queda fuera.
  const vencidas: T[] = [];
  const porIndice = new Map<number, T[]>();
  let antes = 0;
  let despues = 0;
  for (const o of abiertas) {
    if (o.expectedCloseDate.getTime() < hoy) {
      // Con la ventana desplazada la columna de vencidas no se muestra, así que
      // lo vencido cuenta como lo que quedó atrás.
      if (desplazamiento > 0) antes += 1;
      else vencidas.push(o);
      continue;
    }
    const i = indiceDe(o.expectedCloseDate);
    if (i < primero) {
      antes += 1;
    } else if (i > ultimo) {
      despues += 1;
    } else {
      const lista = porIndice.get(i);
      if (lista) lista.push(o);
      else porIndice.set(i, [o]);
    }
  }

  const columnas: ColumnaDeForecast<T>[] = [];
  if (vencidas.length > 0) {
    columnas.push(columna({ tipo: "vencidas" }, "vencidas", vencidas, false));
  }
  for (let i = primero; i <= ultimo; i++) {
    const periodo = periodoDe(i);
    columnas.push(columna(periodo, claveDe(periodo), porIndice.get(i) ?? [], i === actual));
  }

  return { columnas, fueraDeVentana: { antes, despues }, desplazamiento };
}

function columna<T extends OportunidadParaForecast>(
  periodo: PeriodoDeForecast,
  clave: string,
  oportunidades: T[],
  esActual: boolean,
): ColumnaDeForecast<T> {
  let total = CERO;
  let ponderado = CERO;
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, CERO])) as Record<
    ForecastCategory,
    Money
  >;

  for (const o of oportunidades) {
    // RN-12 · una ganada o perdida se ve en la columna, pero no suma.
    if (o.status !== undefined && o.status !== "ABIERTA") continue;
    total = total.plus(o.amount);
    ponderado = ponderado.plus(weightedAmount(o.amount, o.stage.probability));
    porCategoria[o.forecastCategory] = porCategoria[o.forecastCategory].plus(o.amount);
  }

  return { clave, periodo, oportunidades, total, ponderado, porCategoria, esActual };
}
