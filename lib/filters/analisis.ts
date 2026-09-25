import type { BusinessType, CountryCode, ForecastCategory } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";

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

export type FiltrosDeAnalisis = {
  pestana: PestanaDeAnalisis;
  pais: CountryCode | null;
  vendedor: string | null;
  /** Año fiscal. */
  anio: number;
  producto: string | null;
  tipo: BusinessType | null;
  /** Reporte 1 · avance contra objetivo. */
  g1: DimensionDeVenta;
  /** Reporte 2 · histórico de venta. */
  g2: AgrupacionHistorica;
  /** Reporte 3 · rentabilidad. */
  g3: DimensionDeRentabilidad;
  /** Reporte 4 · embudo: la segunda agrupación, dentro del trimestre. */
  g4: SegundaAgrupacionDeEmbudo;
  /** Reporte 4 · probabilidad mínima de etapa, en por ciento. */
  prob: number | null;
  /** Reporte 4 · categorías de pronóstico; vacío = todas. */
  pron: ForecastCategory[];
};

const PESTANAS = ["ventas", "forecast", "actividad"] as const;
const PAISES = ["MX", "CO", "CL"] as const;
const TIPOS = ["NUEVO", "EXPANSION", "RENOVACION"] as const;
const CATEGORIAS = ["PIPELINE", "MEJOR_CASO", "COMPROMISO", "OMITIDA"] as const;
const DIMENSIONES_DE_VENTA = ["trimestre", "cliente", "producto", "tipo"] as const;
const AGRUPACIONES_HISTORICAS = ["anio", "trimestre"] as const;
const DIMENSIONES_DE_RENTABILIDAD = ["producto", "tipo", "cliente"] as const;
const SEGUNDAS_DE_EMBUDO = ["cliente", "vendedor"] as const;

function unEnum<T extends string>(valor: string | null, permitidos: readonly T[]): T | null {
  return valor !== null && (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;
}

function unEntero(valor: string | null, min: number, max: number): number | null {
  if (valor === null || !/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

export function parseFiltrosDeAnalisis(
  sp: URLSearchParams,
  session: Session,
  opciones: { anioActual: number },
): FiltrosDeAnalisis {
  const pais = unEnum(sp.get("pais"), PAISES);
  return {
    pestana: unEnum(sp.get("p"), PESTANAS) ?? "ventas",
    // Solo un país donde la sesión opera: lo demás sería ampliar el alcance.
    pais: pais !== null && session.countryCodes.includes(pais) ? pais : null,
    vendedor: sp.get("vendedor")?.trim() || null,
    anio: unEntero(sp.get("anio"), 2000, 2100) ?? opciones.anioActual,
    producto: sp.get("producto")?.trim() || null,
    tipo: unEnum(sp.get("tipo"), TIPOS),
    g1: unEnum(sp.get("g1"), DIMENSIONES_DE_VENTA) ?? "trimestre",
    g2: unEnum(sp.get("g2"), AGRUPACIONES_HISTORICAS) ?? "trimestre",
    g3: unEnum(sp.get("g3"), DIMENSIONES_DE_RENTABILIDAD) ?? "producto",
    g4: unEnum(sp.get("g4"), SEGUNDAS_DE_EMBUDO) ?? "cliente",
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
