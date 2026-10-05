import type { CountryCode, ForecastCategory } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { anioFiscalDeLapso, parseLapso, type Lapso } from "./lapso";

/**
 * Los filtros de P-09 · Análisis, leídos de la URL (INV-10).
 *
 * Un reporte que no se puede pegar en un correo y abrir igual no sirve para un
 * comité. Por eso todo —la pestaña, los recortes y hasta la agrupación de cada
 * reporte— viaja en `searchParams`. Lo inválido cae al valor por omisión, sin
 * reventar: la URL es entrada del usuario.
 *
 * **Un filtro nunca amplía el alcance** (AC-25): el país solo cuenta si la
 * sesión opera en él; Dirección elige entre los tres, un gerente entre los
 * suyos. El alcance por rol lo pone `lib/scope`, no este parser.
 */

export type PestanaDeAnalisis = "ventas" | "forecast" | "actividad";
export type DimensionDeVenta = "trimestre" | "cliente" | "producto" | "tipo";
export type AgrupacionHistorica = "anio" | "trimestre";
export type DimensionDeRentabilidad = "producto" | "tipo" | "cliente";
export type SegundaAgrupacionDeEmbudo = "cliente" | "vendedor";
export type VistaDeCiclo = "vendedor" | "trimestre";

export type FiltrosDeAnalisis = {
  pestana: PestanaDeAnalisis;
  /** Vacío = todos los del alcance. Solo los que la sesión opera (AC-25). */
  pais: CountryCode[];
  /** Vacío = todos. Uno o varios ids. */
  vendedor: string[];
  /** El lapso que recorta lo que pasó: año fiscal, trimestre fiscal, mes o rango (decisiones §45). */
  lapso: Lapso;
  /** El año fiscal del inicio del lapso: el de la cuota que se compara. Producto y tipo dejaron de ser filtros (§36). */
  anio: number;
  /** Reporte 1 · avance contra objetivo. */
  g1: DimensionDeVenta;
  /** Reporte 2 · histórico de venta. */
  g2: AgrupacionHistorica;
  /** Reporte 3 · rentabilidad. */
  g3: DimensionDeRentabilidad;
  /** Reporte 4 · embudo: la segunda agrupación, dentro del trimestre. */
  g4: SegundaAgrupacionDeEmbudo;
  /** Reporte 5 · el ciclo de venta por vendedor (barras) o por trimestre (línea). */
  g5: VistaDeCiclo;
  /** Reporte 4 · probabilidad mínima de etapa, en por ciento. */
  prob: number | null;
  /** Reporte 4 · categorías de pronóstico; vacío = todas. */
  pron: ForecastCategory[];
};

const PESTANAS = ["ventas", "forecast", "actividad"] as const;
const PAISES = ["MX", "CO", "CL"] as const;
const CATEGORIAS = ["PIPELINE", "MEJOR_CASO", "COMPROMISO", "OMITIDA"] as const;
const DIMENSIONES_DE_VENTA = ["trimestre", "cliente", "producto", "tipo"] as const;
const AGRUPACIONES_HISTORICAS = ["anio", "trimestre"] as const;
const DIMENSIONES_DE_RENTABILIDAD = ["producto", "tipo", "cliente"] as const;
const SEGUNDAS_DE_EMBUDO = ["cliente", "vendedor"] as const;
const VISTAS_DE_CICLO = ["vendedor", "trimestre"] as const;

function unEnum<T extends string>(valor: string | null, permitidos: readonly T[]): T | null {
  return valor !== null && (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;
}

/** Varios valores del mismo parámetro, sin repetidos ni blancos. */
function varios(sp: URLSearchParams, clave: string): string[] {
  const vistos = new Set<string>();
  for (const v of sp.getAll(clave)) {
    const limpio = v.trim();
    if (limpio !== "") vistos.add(limpio);
  }
  return [...vistos];
}

function variosDeEnum<T extends string>(sp: URLSearchParams, clave: string, permitidos: readonly T[]): T[] {
  return varios(sp, clave).flatMap((v) => {
    const uno = unEnum(v, permitidos);
    return uno === null ? [] : [uno];
  });
}

function unEntero(valor: string | null, min: number, max: number): number | null {
  if (valor === null || !/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

export function parseFiltrosDeAnalisis(
  sp: URLSearchParams,
  session: Session,
  opciones: { anioActual: number; fiscalYearStartMonth: number },
): FiltrosDeAnalisis {
  const operados = new Set<string>(session.countryCodes);
  const lapso = parseLapso(sp, opciones.anioActual);
  return {
    pestana: unEnum(sp.get("p"), PESTANAS) ?? "ventas",
    // Solo países donde la sesión opera: lo demás sería ampliar el alcance.
    pais: variosDeEnum(sp, "pais", PAISES).filter((c) => operados.has(c)),
    vendedor: varios(sp, "vendedor"),
    lapso,
    anio: anioFiscalDeLapso(lapso, opciones.fiscalYearStartMonth),
    g1: unEnum(sp.get("g1"), DIMENSIONES_DE_VENTA) ?? "trimestre",
    g2: unEnum(sp.get("g2"), AGRUPACIONES_HISTORICAS) ?? "trimestre",
    g3: unEnum(sp.get("g3"), DIMENSIONES_DE_RENTABILIDAD) ?? "producto",
    g4: unEnum(sp.get("g4"), SEGUNDAS_DE_EMBUDO) ?? "cliente",
    g5: unEnum(sp.get("g5"), VISTAS_DE_CICLO) ?? "vendedor",
    prob: unEntero(sp.get("prob"), 0, 100),
    pron: sp
      .getAll("pron")
      .map((v) => unEnum(v, CATEGORIAS))
      .filter((v): v is ForecastCategory => v !== null),
  };
}

/**
 * La URL de la misma pantalla con parámetros distintos: para los conmutadores
 * de agrupación y los filtros del embudo. Una lista escribe el parámetro una
 * vez por valor (`pron`); vacía o nula, lo quita.
 */
export function hrefDeAnalisis(
  sp: URLSearchParams,
  cambios: Record<string, string | readonly string[] | null>,
): string {
  const p = new URLSearchParams(sp);
  for (const [clave, valor] of Object.entries(cambios)) {
    p.delete(clave);
    if (valor === null) continue;
    if (typeof valor === "string") p.set(clave, valor);
    else for (const v of valor) p.append(clave, v);
  }
  const qs = p.toString();
  return qs ? `/analisis?${qs}` : "/analisis";
}
