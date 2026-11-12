import { ETIQUETAS_DE_ESTADO } from "@/lib/mcp/esquemas";

/**
 * Cómo se ve el estado de una ficha de análisis · decisiones §62. Puro y sin
 * dependencias de servidor: lo importan la tarjeta, la tabla y la pestaña.
 */
export type EtiquetaDeEstado = (typeof ETIQUETAS_DE_ESTADO)[number];

export const TEXTO_DE_ESTADO: Record<EtiquetaDeEstado, string> = {
  SALUDABLE: "Saludable",
  EN_RIESGO: "En riesgo",
  CRITICA: "Crítica",
  SIN_INFORMACION: "Sin información",
};

/** Verde avanza, lima pide atención, coral está en duda, gris no sabe. */
export const TONO_DE_ESTADO: Record<EtiquetaDeEstado, "exito" | "alerta" | "peligro" | "neutro"> = {
  SALUDABLE: "exito",
  EN_RIESGO: "alerta",
  CRITICA: "peligro",
  SIN_INFORMACION: "neutro",
};

/** La etiqueta de un payload guardado, o `null` si no la trae o no es de las cuatro. */
export function etiquetaDe(payload: unknown): EtiquetaDeEstado | null {
  if (!payload || typeof payload !== "object") return null;
  const estado = (payload as { estado?: { etiqueta?: unknown } }).estado;
  const etiqueta = estado?.etiqueta;
  return typeof etiqueta === "string" && (ETIQUETAS_DE_ESTADO as readonly string[]).includes(etiqueta)
    ? (etiqueta as EtiquetaDeEstado)
    : null;
}

/** La etiqueta del último análisis de una fila que trae `insights` del más reciente al más antiguo. */
export function ultimaEtiqueta(insights: readonly { payload: unknown }[] | undefined): EtiquetaDeEstado | null {
  return insights?.[0] ? etiquetaDe(insights[0].payload) : null;
}
