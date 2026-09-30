import { formatPercent, formatUSD, type Money } from "@/lib/money";
import type {
  AntiguedadPorVendedor,
  DetalleDeAntiguedad,
  PromedioDeCiclo,
  SubgrupoDeEmbudo,
  TrimestreDeEmbudo,
} from "@/lib/domain/analisis";
import { formatoCompacto } from "./formato";
import type {
  DetalleDePunto,
  EstadoDeEtapa,
  FilaDeGrupos,
  FilaHorizontal,
  PuntoDeAntiguedad,
  PuntoDeEmbudo,
  PuntoDeLinea,
  ReferenciaDeGrafica,
  SerieDeGrupos,
} from "./tipos";

/**
 * De las agregaciones del forecast (`embudoDeForecast`, `cicloDeVenta`,
 * `antiguedadYEstancamiento`) a los puntos de las gráficas de la pestaña
 * Forecast (decisiones §37). Corre en el servidor: recibe `Decimal` y entrega
 * números para la geometría y textos formateados para el tooltip. Las gráficas
 * no calculan nada.
 */
const numero = (m: Money): number => m.toNumber();

export function dias(n: number | null): string {
  return n === null ? "—" : `${n} ${n === 1 ? "día" : "días"}`;
}

// ───────────────────────────────────────────────── Estado de etapa (§37)

/**
 * A partir de qué fracción del límite de la etapa una abierta se pinta «en
 * riesgo». Es una banda de presentación, no una regla de dominio: el límite
 * sigue viniendo de la etapa (INV-05) y la bandera de estancada de RN-03.
 */
export const BANDA_DE_RIESGO = 0.75;

export function estadoDeEtapa(diasEnEtapa: number, limite: number): EstadoDeEtapa {
  if (limite <= 0) return "en_tiempo";
  const fraccion = diasEnEtapa / limite;
  if (fraccion > 1) return "estancada";
  return fraccion >= BANDA_DE_RIESGO ? "en_riesgo" : "en_tiempo";
}

export const ETIQUETA_DE_ESTADO: Record<EstadoDeEtapa, string> = {
  en_tiempo: "En tiempo",
  en_riesgo: "En riesgo",
  estancada: "Fuera del límite de etapa",
};

function estadoDetalle(estado: EstadoDeEtapa): DetalleDePunto {
  return { etiqueta: "Estado", texto: ETIQUETA_DE_ESTADO[estado], ...(estado === "estancada" ? { tono: "peligro" as const } : {}) };
}

function peso(parte: Money, total: Money): string {
  return formatPercent(total.isZero() ? "0" : parte.div(total));
}

// ─────────────────────────────────────────────── 4 · Embudo por trimestre

export function puntosDeEmbudo(e: { trimestres: readonly TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo }): PuntoDeEmbudo[] {
  if (e.total.cuantas === 0) return [];
  return e.trimestres.map((t) => ({
    clave: t.clave,
    etiqueta: t.etiqueta,
    importe: numero(t.total),
    ponderado: numero(t.ponderado),
    // La barra apilada: el ponderado abajo y lo que falta encima suman el importe.
    resto: numero(t.total.minus(t.ponderado)),
    detalle: [
      { etiqueta: "Oportunidades", texto: String(t.cuantas) },
      { etiqueta: "Importe", texto: formatUSD(t.total) },
      { etiqueta: "Ponderado", texto: formatUSD(t.ponderado) },
      { etiqueta: "Peso en el pipeline", texto: peso(t.total, e.total.total) },
    ],
  }));
}

/** Lo abierto por cliente o por vendedor, sumando los subgrupos de todos los trimestres. */
export function distribucionDelPipeline(e: { trimestres: readonly TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo }): FilaHorizontal[] {
  const mapa = new Map<string, SubgrupoDeEmbudo>();
  for (const t of e.trimestres) {
    for (const s of t.subgrupos) {
      const previo = mapa.get(s.clave);
      mapa.set(
        s.clave,
        previo
          ? { ...previo, total: previo.total.plus(s.total), ponderado: previo.ponderado.plus(s.ponderado), cuantas: previo.cuantas + s.cuantas }
          : { ...s },
      );
    }
  }
  return [...mapa.values()]
    .sort((a, b) => b.total.minus(a.total).toNumber())
    .map((s) => ({
      clave: s.clave,
      etiqueta: s.etiqueta,
      valor: numero(s.total),
      etiquetaDeValor: `${formatoCompacto(numero(s.total))} · ${peso(s.total, e.total.total)}`,
      detalle: [
        { etiqueta: "Importe", texto: formatUSD(s.total) },
        { etiqueta: "Ponderado", texto: formatUSD(s.ponderado) },
        { etiqueta: "Oportunidades", texto: String(s.cuantas) },
        { etiqueta: "Peso en el pipeline", texto: peso(s.total, e.total.total) },
      ],
    }));
}

// ───────────────────────────────────────────────────── 5 · Ciclo de venta

type Ciclo = {
  promedioDias: number | null;
  medianaDias: number | null;
  cuantas: number;
  porVendedor: readonly PromedioDeCiclo[];
  porTrimestre: readonly PromedioDeCiclo[];
};

export function barrasDeCiclo(c: Ciclo): { filas: FilaHorizontal[]; referencia: ReferenciaDeGrafica | null } {
  return {
    filas: c.porVendedor.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      valor: v.promedioDias,
      etiquetaDeValor: dias(v.promedioDias),
      detalle: [
        { etiqueta: "Cierres", texto: String(v.cuantas) },
        { etiqueta: "Días promedio", texto: dias(v.promedioDias) },
        { etiqueta: "Mediana", texto: dias(c.medianaDias) },
      ],
    })),
    referencia: c.medianaDias === null ? null : { valor: c.medianaDias, etiqueta: `Mediana: ${dias(c.medianaDias)}` },
  };
}

export function serieDeCiclo(c: Ciclo): PuntoDeLinea[] {
  return c.porTrimestre.map((t) => ({
    clave: t.clave,
    etiqueta: t.etiqueta,
    valor: t.promedioDias,
    detalle: [
      { etiqueta: "Cierres", texto: String(t.cuantas) },
      { etiqueta: "Días promedio", texto: dias(t.promedioDias) },
    ],
  }));
}

// ────────────────────────────────────── 6 · Antigüedad y estancamiento

type Antiguedad = {
  resumen: { edadPromedioDias: number | null };
  porVendedor: readonly AntiguedadPorVendedor[];
  detalle: readonly DetalleDeAntiguedad[];
};

function cuenta(etiqueta: string, n: number): DetalleDePunto {
  return { etiqueta, texto: String(n), ...(n > 0 && etiqueta !== "Abiertas" ? { tono: "peligro" as const } : {}) };
}

export function estadoPorVendedor(a: Antiguedad): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  return {
    series: [
      { clave: "abiertas", etiqueta: "Abiertas" },
      { clave: "estancadas", etiqueta: "Estancadas" },
      { clave: "sinActividad", etiqueta: "Sin actividad" },
      { clave: "vencidas", etiqueta: "Vencidas" },
    ],
    filas: a.porVendedor.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      valores: { abiertas: v.cuantas, estancadas: v.estancadas, sinActividad: v.sinActividad, vencidas: v.vencidas },
      detalle: [
        cuenta("Abiertas", v.cuantas),
        cuenta("Estancadas", v.estancadas),
        cuenta("Sin actividad", v.sinActividad),
        cuenta("Vencidas", v.vencidas),
        { etiqueta: "Edad promedio", texto: dias(v.edadPromedioDias) },
      ],
    })),
  };
}

export function puntosDeAntiguedad(a: Antiguedad): { puntos: PuntoDeAntiguedad[]; edadPromedio: number | null } {
  return {
    edadPromedio: a.resumen.edadPromedioDias,
    puntos: a.detalle.map((d) => {
      const estado = estadoDeEtapa(d.diasEnEtapa, d.limite);
      return {
        clave: d.id,
        etiqueta: `${d.folio} · ${d.nombre}`,
        edad: d.edadDias,
        importe: numero(d.importe),
        estado,
        detalle: [
          { etiqueta: "Folio", texto: d.folio },
          { etiqueta: "Oportunidad", texto: d.nombre },
          { etiqueta: "Cliente", texto: d.cliente },
          { etiqueta: "Etapa", texto: d.etapa },
          { etiqueta: "Edad", texto: dias(d.edadDias) },
          { etiqueta: "Días en etapa", texto: dias(d.diasEnEtapa) },
          { etiqueta: "Límite de etapa", texto: dias(d.limite) },
          { etiqueta: "Importe", texto: formatUSD(d.importe) },
          { etiqueta: "Vendedor", texto: d.vendedor },
          estadoDetalle(estado),
        ],
      };
    }),
  };
}
