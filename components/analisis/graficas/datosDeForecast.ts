import { formatPercent, formatUSD, type Money } from "@/lib/money";
import type {
  AntiguedadPorVendedor,
  CierreDeCiclo,
  DetalleDeAntiguedad,
  OportunidadAbierta,
  PromedioDeCiclo,
  SubgrupoDeEmbudo,
  TrimestreDeEmbudo,
  VentaGanada,
} from "@/lib/domain/analisis";
import { formatoCompacto } from "./formato";
import { fechaDeItem, itemDeAbierta, itemDeVenta, porId, resolver } from "./items";
import type {
  DetalleDePunto,
  EstadoDeEtapa,
  FilaDeGrupos,
  FilaHorizontal,
  ItemDePunto,
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
 *
 * Cada punto lleva sus ítems (§43): las abiertas o las ganadas que lo suman,
 * resueltas por id contra la lista acotada que llegó de `lib/scope`.
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

/** Una abierta en el embudo: importe, etapa con su probabilidad y lo que pondera (RN-01). */
function itemDeEmbudo(o: OportunidadAbierta): ItemDePunto {
  return itemDeAbierta(o, {
    nota: `${o.stage.name} · ${formatPercent(o.stage.probability, 0)} · ponderado ${formatUSD(o.amount.times(o.stage.probability))}`,
  });
}

export function puntosDeEmbudo(
  e: { trimestres: readonly TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo },
  abiertas: readonly OportunidadAbierta[],
): PuntoDeEmbudo[] {
  if (e.total.cuantas === 0) return [];
  const indice = porId(abiertas);
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
    items: resolver(t.ids, indice, itemDeEmbudo),
  }));
}

/** Lo abierto por cliente o por vendedor, sumando los subgrupos de todos los trimestres. */
export function distribucionDelPipeline(
  e: { trimestres: readonly TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo },
  abiertas: readonly OportunidadAbierta[],
): FilaHorizontal[] {
  const indice = porId(abiertas);
  const mapa = new Map<string, SubgrupoDeEmbudo>();
  for (const t of e.trimestres) {
    for (const s of t.subgrupos) {
      const previo = mapa.get(s.clave);
      mapa.set(
        s.clave,
        previo
          ? {
              ...previo,
              total: previo.total.plus(s.total),
              ponderado: previo.ponderado.plus(s.ponderado),
              cuantas: previo.cuantas + s.cuantas,
              ids: [...previo.ids, ...s.ids],
            }
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
      items: resolver(s.ids, indice, itemDeEmbudo),
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

/** Cada cierre que entra al promedio: sus días, y la venta con su fecha. */
function itemsDeCierres(cierres: readonly CierreDeCiclo[], indice: ReadonlyMap<string, VentaGanada>): ItemDePunto[] {
  return cierres.flatMap((c) => {
    const v = indice.get(c.id);
    return v ? [itemDeVenta(v, dias(c.dias), { nota: `${formatUSD(v.amount)} · cerrada ${fechaDeItem(v.actualCloseDate)}` })] : [];
  });
}

export function barrasDeCiclo(c: Ciclo, ventas: readonly VentaGanada[]): { filas: FilaHorizontal[]; referencia: ReferenciaDeGrafica | null } {
  const indice = porId(ventas);
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
      items: itemsDeCierres(v.cierres, indice),
    })),
    referencia: c.medianaDias === null ? null : { valor: c.medianaDias, etiqueta: `Mediana: ${dias(c.medianaDias)}` },
  };
}

export function serieDeCiclo(c: Ciclo, ventas: readonly VentaGanada[]): PuntoDeLinea[] {
  const indice = porId(ventas);
  return c.porTrimestre.map((t) => ({
    clave: t.clave,
    etiqueta: t.etiqueta,
    valor: t.promedioDias,
    detalle: [
      { etiqueta: "Cierres", texto: String(t.cuantas) },
      { etiqueta: "Días promedio", texto: dias(t.promedioDias) },
    ],
    items: itemsDeCierres(t.cierres, indice),
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

/** Cada serie de la gráfica de estado dice lo que le importa de la oportunidad. */
const ITEM_DE_ESTADO: Record<keyof AntiguedadPorVendedor["ids"], (o: OportunidadAbierta) => ItemDePunto> = {
  abiertas: (o) => itemDeAbierta(o),
  estancadas: (o) => itemDeAbierta(o, { nota: `${o.stage.name} · en etapa desde ${fechaDeItem(o.stageEnteredAt)}` }),
  sinActividad: (o) =>
    itemDeAbierta(o, { nota: o.lastActivityAt ? `Última actividad ${fechaDeItem(o.lastActivityAt)}` : "Sin actividad registrada" }),
  vencidas: (o) => itemDeAbierta(o, { nota: `Cierre estimado ${fechaDeItem(o.expectedCloseDate)}`, tono: "peligro" }),
};

export function estadoPorVendedor(a: Antiguedad, abiertas: readonly OportunidadAbierta[]): { series: SerieDeGrupos[]; filas: FilaDeGrupos[] } {
  const indice = porId(abiertas);
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
      itemsPorSerie: Object.fromEntries(
        (Object.keys(ITEM_DE_ESTADO) as (keyof typeof ITEM_DE_ESTADO)[]).map((serie) => [serie, resolver(v.ids[serie], indice, ITEM_DE_ESTADO[serie])]),
      ),
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
        // El punto es una oportunidad: el popup es su ficha, con el enlace.
        items: [
          {
            clave: d.id,
            href: `/oportunidades/${d.id}`,
            titulo: `${d.folio} · ${d.nombre}`,
            subtitulo: `${d.cliente} · ${d.vendedor}`,
            cifra: formatUSD(d.importe),
            nota: `${d.etapa} · ${d.diasEnEtapa} / ${d.limite} días en etapa`,
            ...(estado === "estancada" ? { tono: "peligro" as const } : {}),
          },
        ],
      };
    }),
  };
}
