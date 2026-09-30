import { formatPercent, money } from "@/lib/money";
import { rangoDeAnioFiscal } from "@/lib/filters/dates";
import type { ActividadDeVendedor, SaludPorEtapa } from "@/lib/domain/analisis";
import type { DetalleDePunto, FilaDeGrupos, FilaHorizontal, PuntoDeBarra, ReferenciaDeGrafica, SerieDeGrupos } from "./tipos";

/**
 * De `actividadPorVendedor` y `saludMeddic` a los puntos de la pestaña
 * Actividad y MEDDIC (decisiones §38). Corre en el servidor; las gráficas no
 * calculan nada.
 *
 * - Los tipos de actividad son datos: una serie por cada uno que exista.
 * - Los doce meses del año fiscal aparecen aunque no haya nada; el cero se
 *   atenúa, no se inventa.
 * - El porcentaje sin siguiente paso no divide entre cero.
 * - «Sin datos» de MEDDIC nunca se dibuja como cero: barra gris mínima y texto.
 */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function cuenta(etiqueta: string, n: number, alerta = false): DetalleDePunto {
  return { etiqueta, texto: String(n), ...(alerta && n > 0 ? { tono: "peligro" as const } : {}) };
}

// ─────────────────────────────────────────────── 8 · Actividad por vendedor

export function actividadPorTipo(a: {
  tipos: readonly string[];
  porVendedor: readonly ActividadDeVendedor[];
}): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  return {
    series: a.tipos.map((t) => ({ clave: t, etiqueta: t })),
    filas: a.porVendedor.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      valores: Object.fromEntries(a.tipos.map((t) => [t, v.porTipo[t] ?? 0])),
      // «Hechas» es el total de las series: va en el tooltip, no como barra.
      detalle: [...a.tipos.map((t) => cuenta(t, v.porTipo[t] ?? 0)), cuenta("Hechas", v.hechas)],
    })),
  };
}

export function actividadPorMesFiscal(
  porMes: readonly { clave: string; etiqueta: string; hechas: number }[],
  anio: number,
  fiscalYearStartMonth: number,
): PuntoDeBarra[] {
  const hechasPorMes = new Map(porMes.map((m) => [m.clave, m.hechas]));
  const { from } = rangoDeAnioFiscal(anio, fiscalYearStartMonth);
  return Array.from({ length: 12 }, (_, i) => {
    const fecha = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const y = fecha.getUTCFullYear();
    const m = fecha.getUTCMonth();
    const clave = `${y}-${String(m + 1).padStart(2, "0")}`;
    const hechas = hechasPorMes.get(clave) ?? 0;
    return {
      clave,
      etiqueta: `${MES_CORTO[m]} ${y}`,
      etiquetaCorta: MES_CORTO[m]!,
      valor: hechas,
      ...(hechas === 0 ? { tenue: true } : {}),
      detalle: [{ etiqueta: "Actividades hechas", texto: String(hechas) }],
    };
  });
}

export function abiertasYSinPaso(porVendedor: readonly ActividadDeVendedor[]): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  return {
    series: [
      { clave: "abiertas", etiqueta: "Abiertas" },
      { clave: "sinSiguientePaso", etiqueta: "Sin siguiente paso" },
    ],
    filas: porVendedor.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      valores: { abiertas: v.abiertas, sinSiguientePaso: v.sinSiguientePaso },
      detalle: [
        cuenta("Abiertas", v.abiertas),
        cuenta("Sin siguiente paso", v.sinSiguientePaso, true),
        v.abiertas === 0
          ? { etiqueta: "Sin siguiente paso sobre abiertas", texto: "—", tono: "tenue" }
          : { etiqueta: "Sin siguiente paso sobre abiertas", texto: formatPercent(money(v.sinSiguientePaso).div(v.abiertas)) },
      ],
    })),
  };
}

// ────────────────────────────────────────────────────── 9 · Salud MEDDIC

export function saludPorEtapaGrafica(
  porEtapa: readonly SaludPorEtapa[],
  minimo: number,
): { filas: FilaHorizontal[]; referencia: ReferenciaDeGrafica } {
  return {
    referencia: { valor: minimo, etiqueta: `Mínimo: ${minimo}` },
    filas: porEtapa.map((e) => {
      const tono = e.promedio === null ? "tenue" : e.promedio < minimo ? "peligro" : "exito";
      const promedio: DetalleDePunto =
        e.promedio === null
          ? { etiqueta: "MEDDIC promedio", texto: "Sin datos", tono: "tenue" }
          : { etiqueta: "MEDDIC promedio", texto: String(e.promedio), tono };
      return {
        clave: e.clave,
        etiqueta: e.etiqueta,
        valor: e.promedio ?? 0,
        etiquetaDeValor: e.promedio === null ? "Sin datos" : String(e.promedio),
        tono,
        detalle: [cuenta("Abiertas", e.cuantas), promedio, cuenta("Bajo el mínimo", e.bajoMinimo, true), cuenta("Sin calificar", e.sinCalificar)],
      };
    }),
  };
}
