/**
 * Lo que cruza del servidor a las gráficas: números para la geometría y textos
 * ya formateados para el tooltip. Sin `Decimal` (no se serializa a un componente
 * de cliente) y sin importar nada: lo comparten `datos.ts` (servidor) y las
 * gráficas (cliente).
 */
export type Tono = "exito" | "peligro" | "tenue";

/** Un renglón del tooltip: «Ganado · $328,835.00». */
export type DetalleDePunto = { etiqueta: string; texto: string; tono?: Tono };

/**
 * Un ítem detrás de un punto: lo que se lista al pulsar la barra (decisiones
 * §43). Dos líneas a la izquierda (título y subtítulo) y dos a la derecha
 * (cifra y nota), ya formateadas en el servidor. `href` lleva a la ficha
 * cuando el ítem es una oportunidad.
 */
export type ItemDePunto = {
  clave: string;
  href?: string;
  titulo: string;
  subtitulo?: string;
  cifra: string;
  nota?: string;
  tono?: Tono;
};

/** Una barra del avance. `cuota` solo existe cuando hay cuota consolidada. */
export type PuntoDeBarra = {
  clave: string;
  etiqueta: string;
  /** Lo que va en el eje cuando la etiqueta completa no cabe («sep» por «sep 2026»). */
  etiquetaCorta?: string;
  valor: number;
  cuota?: number;
  /** Un trimestre que no ha empezado o lo ganado sin cotización: se pinta más claro. */
  tenue?: boolean;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

export type SerieDeAvance = {
  puntos: PuntoDeBarra[];
  conCuota: boolean;
  /** Una aclaración bajo la gráfica, si la agrupación la necesita. */
  nota: string | null;
};

/** Un periodo del histórico. `utilidad` es nula sin costo (INV-02) o sin cotización. */
export type PuntoHistorico = {
  clave: string;
  etiqueta: string;
  ganado: number;
  utilidad: number | null;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

/** Una barra apilada de rentabilidad: costo + utilidad = venta. */
export type FilaApilada = {
  clave: string;
  etiqueta: string;
  costo: number;
  /** Nunca negativa en la barra: una pérdida se lee en el tooltip. */
  utilidad: number;
  venta: number;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

export type FilaDeMargen = {
  clave: string;
  etiqueta: string;
  /** Fracción 0..1 para la barra; un margen negativo se dibuja en cero. */
  margen: number;
  margenTexto: string;
  negativo: boolean;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

// ───────────────────────────────────────────────────────── Forecast (§37)

/** Una barra del embudo: la altura es el importe; `ponderado` + `resto` la apilan. */
export type PuntoDeEmbudo = {
  clave: string;
  etiqueta: string;
  importe: number;
  ponderado: number;
  resto: number;
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

/** Una barra horizontal de una sola serie, con la cifra ya escrita al final. */
export type FilaHorizontal = {
  clave: string;
  etiqueta: string;
  valor: number;
  etiquetaDeValor: string;
  /** Pinta la barra por estado: verde, coral o gris; sin tono, el color de la gráfica. */
  tono?: "exito" | "peligro" | "tenue";
  detalle: DetalleDePunto[];
  items: ItemDePunto[];
};

/** Una línea de referencia: la mediana, la edad promedio. */
export type ReferenciaDeGrafica = { valor: number; etiqueta: string };

export type PuntoDeLinea = { clave: string; etiqueta: string; valor: number | null; detalle: DetalleDePunto[]; items: ItemDePunto[] };

/** Una serie de barras agrupadas; el color lo pone la tarjeta. */
export type SerieDeGrupos = { clave: string; etiqueta: string };
export type SerieConColor = SerieDeGrupos & { color: string };

/**
 * Un grupo de barras agrupadas (nunca apiladas: los conteos se traslapan): un
 * valor por serie. La barra que se pulsa es **una serie**, así que los ítems
 * van por serie.
 */
export type FilaDeGrupos = {
  clave: string;
  etiqueta: string;
  valores: Record<string, number>;
  detalle: DetalleDePunto[];
  itemsPorSerie: Record<string, ItemDePunto[]>;
};

/** Días en la etapa contra su límite: < 75 % en tiempo, hasta el límite en riesgo, pasado el límite estancada (§37). */
export type EstadoDeEtapa = "en_tiempo" | "en_riesgo" | "estancada";

export type PuntoDeAntiguedad = {
  clave: string;
  etiqueta: string;
  edad: number;
  importe: number;
  estado: EstadoDeEtapa;
  detalle: DetalleDePunto[];
  /** El punto es una oportunidad: un solo ítem, con su enlace. */
  items: ItemDePunto[];
};

export const AGRUPACIONES_DE_EMBUDO = [
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "vendedor", etiqueta: "Vendedor" },
] as const;

export const VISTAS_DE_CICLO = [
  { valor: "vendedor", etiqueta: "Vendedor" },
  { valor: "trimestre", etiqueta: "Trimestre" },
] as const;

export type AgrupacionDeEmbudo = (typeof AGRUPACIONES_DE_EMBUDO)[number]["valor"];
export type VistaDeCiclo = (typeof VISTAS_DE_CICLO)[number]["valor"];

export const DIMENSIONES_DE_AVANCE = [
  { valor: "trimestre", etiqueta: "Trimestre" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "producto", etiqueta: "Producto" },
  { valor: "tipo", etiqueta: "Tipo de negocio" },
] as const;

export const AGRUPACIONES_HISTORICAS = [
  { valor: "anio", etiqueta: "Año" },
  { valor: "trimestre", etiqueta: "Trimestre" },
] as const;

export const DIMENSIONES_DE_RENTABILIDAD = [
  { valor: "producto", etiqueta: "Producto" },
  { valor: "tipo", etiqueta: "Tipo de negocio" },
  { valor: "cliente", etiqueta: "Cliente" },
] as const;

export type DimensionDeAvance = (typeof DIMENSIONES_DE_AVANCE)[number]["valor"];
export type AgrupacionHistorica = (typeof AGRUPACIONES_HISTORICAS)[number]["valor"];
export type DimensionDeRentabilidad = (typeof DIMENSIONES_DE_RENTABILIDAD)[number]["valor"];
