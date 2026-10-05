import type { DetalleDePunto, FilaDeGrupos, ItemDePunto, SerieDeGrupos } from "./tipos";

/**
 * Lo que se pulsó en una gráfica y abre el popup (decisiones §43): el nombre
 * del punto, los renglones del tooltip y los ítems que lo suman. Puro: lo
 * arman las gráficas al recibir el clic y lo pinta `PanelDeDetalle`.
 */
export type UnidadDeItems = { singular: string; plural: string };

export const OPORTUNIDADES: UnidadDeItems = { singular: "oportunidad", plural: "oportunidades" };
export const ACTIVIDADES: UnidadDeItems = { singular: "actividad", plural: "actividades" };

export type SeleccionDeGrafica = {
  titulo: string;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
  unidad: UnidadDeItems;
};

type PuntoConItems = { etiqueta: string; detalle: DetalleDePunto[]; items: ItemDePunto[] };

/** Un punto sencillo: una barra, un segmento de la apilada, un punto de la línea o de la dispersión. */
export function seleccionDe(punto: PuntoConItems, unidad: UnidadDeItems = OPORTUNIDADES): SeleccionDeGrafica {
  return { titulo: punto.etiqueta, detalle: punto.detalle, items: punto.items, unidad };
}

/** Una barra de un grupo: la serie pulsada manda, y el título lo dice. */
export function seleccionDeSerie(fila: FilaDeGrupos, serie: SerieDeGrupos, unidad: UnidadDeItems = OPORTUNIDADES): SeleccionDeGrafica {
  return {
    titulo: `${fila.etiqueta} · ${serie.etiqueta}`,
    detalle: fila.detalle,
    items: fila.itemsPorSerie[serie.clave] ?? [],
    unidad,
  };
}

/** «3 oportunidades», «1 actividad». */
export function cuentaDeItems(n: number, unidad: UnidadDeItems): string {
  return `${n} ${n === 1 ? unidad.singular : unidad.plural}`;
}

/**
 * El índice de la categoría pulsada en un clic sobre toda la gráfica: lo que
 * usan la línea y la histórica, donde el punto es pequeño y la columna entera
 * debe responder. Recharts lo da como número, como texto o nulo.
 */
export function indiceActivo(e: { activeTooltipIndex?: number | string | null | undefined } | undefined): number | null {
  const i = Number(e?.activeTooltipIndex);
  return Number.isInteger(i) && i >= 0 ? i : null;
}
