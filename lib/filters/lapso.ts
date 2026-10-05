import { etiquetaDeRango, MES_CORTO } from "@/lib/tiempo";
import { rangoDeAnioFiscal, rangoDeTrimestre, trimestreDe } from "./dates";

/**
 * El lapso de Análisis · P-09, decisiones §45.
 *
 * Hasta el 5-oct-2026 Análisis solo recortaba por año fiscal. El lapso lo
 * generaliza: un **año fiscal**, un **trimestre fiscal** (Q1–Q4 del calendario
 * del país), un **mes calendario** o un **rango** de fechas. Vive en la URL
 * (INV-10) con un parámetro por modo —`anio=2026`, `q=2026-Q3`, `mes=2026-09`,
 * `desde=…&hasta=…`— y el más específico manda si llegan varios. Lo inválido
 * cae al año fiscal en curso: la URL es entrada del usuario.
 *
 * El lapso recorta lo que **pasó**: ventas por cierre real, cierres del ciclo,
 * actividades hechas. Lo abierto y MEDDIC se miden hoy, como siempre. La cuota
 * existe por trimestre, así que solo se compara con un año o un trimestre
 * fiscal completos (`trimestresDelLapso`).
 */
export type Lapso =
  | { tipo: "anio"; fiscalYear: number }
  | { tipo: "trimestre"; fiscalYear: number; quarter: 1 | 2 | 3 | 4 }
  | { tipo: "mes"; anio: number; mes: number }
  | { tipo: "rango"; desde: string; hasta: string };

export type TipoDeLapso = Lapso["tipo"];

export const TIPOS_DE_LAPSO: readonly { valor: TipoDeLapso; etiqueta: string }[] = [
  { valor: "anio", etiqueta: "Año" },
  { valor: "trimestre", etiqueta: "Trimestre" },
  { valor: "mes", etiqueta: "Mes" },
  { valor: "rango", etiqueta: "Rango" },
];

const ANIO = /^\d{4}$/;
const TRIMESTRE = /^(\d{4})-Q([1-4])$/;
const MES = /^(\d{4})-(\d{2})$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` que además existe: `2026-02-30` cumple el patrón y no es una fecha. */
export function esFechaDePared(valor: string | null): valor is string {
  if (valor === null || !FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function anioValido(valor: string | null): number | null {
  if (valor === null || !ANIO.test(valor)) return null;
  const n = Number(valor);
  return n >= 2000 && n <= 2100 ? n : null;
}

export function parseLapso(sp: URLSearchParams, anioActual: number): Lapso {
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (esFechaDePared(desde) && esFechaDePared(hasta) && desde <= hasta) return { tipo: "rango", desde, hasta };

  const mes = sp.get("mes")?.match(MES);
  if (mes) {
    const anio = anioValido(mes[1]!);
    const m = Number(mes[2]);
    if (anio !== null && m >= 1 && m <= 12) return { tipo: "mes", anio, mes: m };
  }

  const q = sp.get("q")?.match(TRIMESTRE);
  if (q) {
    const fiscalYear = anioValido(q[1]!);
    if (fiscalYear !== null) return { tipo: "trimestre", fiscalYear, quarter: Number(q[2]) as 1 | 2 | 3 | 4 };
  }

  return { tipo: "anio", fiscalYear: anioValido(sp.get("anio")) ?? anioActual };
}

/** Lo que el lapso escribe en la URL: su parámetro con valor y los otros tres anulados, para no mezclar modos. */
export function parametrosDeLapso(l: Lapso): Record<"anio" | "q" | "mes" | "desde" | "hasta", string | null> {
  const vacio = { anio: null, q: null, mes: null, desde: null, hasta: null };
  switch (l.tipo) {
    case "anio":
      return { ...vacio, anio: String(l.fiscalYear) };
    case "trimestre":
      return { ...vacio, q: `${l.fiscalYear}-Q${l.quarter}` };
    case "mes":
      return { ...vacio, mes: `${l.anio}-${String(l.mes).padStart(2, "0")}` };
    case "rango":
      return { ...vacio, desde: l.desde, hasta: l.hasta };
  }
}

/** Primer y último día del lapso, como días UTC (las fechas de negocio son `@db.Date`). */
export function rangoDeLapso(l: Lapso, fiscalYearStartMonth: number): { from: Date; to: Date } {
  switch (l.tipo) {
    case "anio":
      return rangoDeAnioFiscal(l.fiscalYear, fiscalYearStartMonth);
    case "trimestre":
      return rangoDeTrimestre(l.fiscalYear, l.quarter, fiscalYearStartMonth);
    case "mes":
      return { from: new Date(Date.UTC(l.anio, l.mes - 1, 1)), to: new Date(Date.UTC(l.anio, l.mes, 0)) };
    case "rango":
      return { from: new Date(`${l.desde}T00:00:00Z`), to: new Date(`${l.hasta}T00:00:00Z`) };
  }
}

/** «Año fiscal 2026», «Q3 2026», «sep 2026», «1 jul – 30 sep 2026». */
export function etiquetaDeLapso(l: Lapso): string {
  switch (l.tipo) {
    case "anio":
      return `Año fiscal ${l.fiscalYear}`;
    case "trimestre":
      return `Q${l.quarter} ${l.fiscalYear}`;
    case "mes":
      return `${MES_CORTO[l.mes - 1]} ${l.anio}`;
    case "rango":
      return etiquetaDeRango(l.desde, l.hasta);
  }
}

/** El lapso en prosa, para los vacíos y los pies: «en el Q3 2026», «del 1 jul al 30 sep 2026». */
export function enElLapso(l: Lapso): string {
  switch (l.tipo) {
    case "anio":
      return `en el año fiscal ${l.fiscalYear}`;
    case "trimestre":
      return `en el Q${l.quarter} ${l.fiscalYear}`;
    case "mes":
      return `en ${etiquetaDeLapso(l)}`;
    case "rango": {
      const [a1, m1, d1] = l.desde.split("-").map(Number) as [number, number, number];
      const [a2, m2, d2] = l.hasta.split("-").map(Number) as [number, number, number];
      const ini = a1 === a2 ? `${d1} ${MES_CORTO[m1 - 1]}` : `${d1} ${MES_CORTO[m1 - 1]} ${a1}`;
      return `del ${ini} al ${d2} ${MES_CORTO[m2 - 1]} ${a2}`;
    }
  }
}

/** El año fiscal al que pertenece el inicio del lapso: el de la cuota que se compara. */
export function anioFiscalDeLapso(l: Lapso, fiscalYearStartMonth: number): number {
  if (l.tipo === "anio" || l.tipo === "trimestre") return l.fiscalYear;
  return trimestreDe(rangoDeLapso(l, fiscalYearStartMonth).from, fiscalYearStartMonth).fiscalYear;
}

/**
 * Las claves de trimestre que la gráfica de avance dibuja y compara con la
 * cuota: los cuatro de un año, el único de un trimestre. Un mes o un rango no
 * tienen cuota comparable: nulo, y la gráfica dibuja solo lo que hubo.
 */
export function trimestresDelLapso(l: Lapso): string[] | null {
  if (l.tipo === "anio") return [1, 2, 3, 4].map((q) => `${l.fiscalYear}-Q${q}`);
  if (l.tipo === "trimestre") return [`${l.fiscalYear}-Q${l.quarter}`];
  return null;
}
