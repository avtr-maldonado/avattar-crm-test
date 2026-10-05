import { formatPercent, formatUSD, money } from "@/lib/money";

import type { ActividadDeVendedor, ActividadHecha, MesDeActividad, OportunidadAbierta, SaludPorEtapa } from "@/lib/domain/analisis";
import { fechaDeItem, itemDeAbierta, itemDeActividad, porId, resolver } from "./items";
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
 *
 * Cada punto lleva sus ítems (§43): las actividades o las abiertas que lo
 * suman, resueltas por id contra las listas acotadas que llegaron de `lib/scope`.
 */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function cuenta(etiqueta: string, n: number, alerta = false): DetalleDePunto {
  return { etiqueta, texto: String(n), ...(alerta && n > 0 ? { tono: "peligro" as const } : {}) };
}

// ─────────────────────────────────────────────── 8 · Actividad por vendedor

export function actividadPorTipo(
  a: {
    tipos: readonly string[];
    porVendedor: readonly ActividadDeVendedor[];
  },
  actividades: readonly ActividadHecha[],
): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  const indice = porId(actividades);
  return {
    series: a.tipos.map((t) => ({ clave: t, etiqueta: t })),
    filas: a.porVendedor.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      valores: Object.fromEntries(a.tipos.map((t) => [t, v.porTipo[t] ?? 0])),
      // «Hechas» es el total de las series: va en el tooltip, no como barra.
      detalle: [...a.tipos.map((t) => cuenta(t, v.porTipo[t] ?? 0)), cuenta("Hechas", v.hechas)],
      itemsPorSerie: Object.fromEntries(a.tipos.map((t) => [t, resolver(v.ids.porTipo[t] ?? [], indice, itemDeActividad)])),
    })),
  };
}

/**
 * Los meses del lapso, del que contiene `from` al que contiene `to`, aunque
 * alguno quede vacío (§45): doce en un año fiscal, tres en un trimestre, uno
 * en un mes.
 */
export function actividadPorMes(
  porMes: readonly MesDeActividad[],
  rango: { from: Date; to: Date },
  actividades: readonly ActividadHecha[],
): PuntoDeBarra[] {
  const indice = porId(actividades);
  const mesPorClave = new Map(porMes.map((m) => [m.clave, m]));
  const { from, to } = rango;
  const meses = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1;
  return Array.from({ length: Math.max(1, meses) }, (_, i) => {
    const fecha = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const y = fecha.getUTCFullYear();
    const m = fecha.getUTCMonth();
    const clave = `${y}-${String(m + 1).padStart(2, "0")}`;
    const mes = mesPorClave.get(clave);
    const hechas = mes?.hechas ?? 0;
    return {
      clave,
      etiqueta: `${MES_CORTO[m]} ${y}`,
      etiquetaCorta: MES_CORTO[m]!,
      valor: hechas,
      ...(hechas === 0 ? { tenue: true } : {}),
      detalle: [{ etiqueta: "Actividades hechas", texto: String(hechas) }],
      items: resolver(mes?.ids ?? [], indice, itemDeActividad),
    };
  });
}

/** Una abierta sin siguiente paso (RN-10): qué le falta, en la nota. */
function itemSinPaso(o: OportunidadAbierta) {
  const agenda = o.nextActivityAt === null ? "sin actividad agendada" : `agendada ${fechaDeItem(o.nextActivityAt)}, ya vencida`;
  return itemDeAbierta(o, { nota: `${o.stage.name} · ${agenda}`, tono: "peligro" });
}

export function abiertasYSinPaso(
  porVendedor: readonly ActividadDeVendedor[],
  abiertas: readonly OportunidadAbierta[],
): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  const indice = porId(abiertas);
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
      itemsPorSerie: {
        abiertas: resolver(v.ids.abiertas, indice, (o) => itemDeAbierta(o)),
        sinSiguientePaso: resolver(v.ids.sinSiguientePaso, indice, itemSinPaso),
      },
    })),
  };
}

// ────────────────────────────────────────────────────── 9 · Salud MEDDIC

export function saludPorEtapaGrafica(
  porEtapa: readonly SaludPorEtapa[],
  minimo: number,
  abiertas: readonly OportunidadAbierta[],
): { filas: FilaHorizontal[]; referencia: ReferenciaDeGrafica } {
  const indice = porId(abiertas);
  // La cifra de cada abierta es su MEDDIC, con el mismo semáforo que la barra.
  const itemDeSalud = (o: OportunidadAbierta) =>
    itemDeAbierta(o, {
      cifra: o.meddicScore === null ? "Sin calificar" : String(o.meddicScore),
      tono: o.meddicScore === null ? "tenue" : o.meddicScore < minimo ? "peligro" : "exito",
      nota: formatUSD(o.amount),
    });
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
        items: resolver(e.ids, indice, itemDeSalud),
      };
    }),
  };
}
