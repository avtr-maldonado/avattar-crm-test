import type { MotivoDeFalla, ResultadoAccion } from "@/lib/acciones";

/**
 * Lo que una herramienta le devuelve al agente · decisiones §61.
 *
 * El servicio de dominio habla `ResultadoAccion`, como toda mutación del CRM.
 * Aquí se traduce al resultado de una herramienta MCP: lo bueno va como
 * contenido estructurado (y como texto, para clientes que no lo leen), y lo
 * malo va con `isError` y un texto que primero dice qué falló y al final qué
 * hacer distinto, porque quien lo lee va a reintentar.
 */
const ENCABEZADO: Record<MotivoDeFalla, string> = {
  VALIDACION: "Datos rechazados por el CRM:",
  AUTORIZACION: "Sin acceso:",
  COMPUERTA: "Requisitos no cumplidos:",
  CONFIRMACION: "Hace falta confirmación:",
  CONFLICTO: "Conflicto con el estado actual:",
};

const QUE_HACER: Record<MotivoDeFalla, string> = {
  VALIDACION: "Corrige lo indicado y vuelve a llamar a la herramienta.",
  AUTORIZACION:
    "No insistas con los mismos datos: usa solo ids que te hayan devuelto buscar_oportunidades o listar_actividades, o pide a Gerencia el acceso.",
  COMPUERTA: "Cumple los requisitos indicados antes de volver a intentar.",
  CONFIRMACION: "Pregunta al usuario y vuelve a llamar con la confirmación.",
  CONFLICTO: "Vuelve a leer la oportunidad con obtener_oportunidad y decide con el estado actual.",
};

/** El texto de una falla. Con un resultado bueno no hay nada que decir: cadena vacía. */
export function textoDeFalla(r: ResultadoAccion<unknown>): string {
  if (r.ok) return "";
  const lineas = r.problemas.map((p) => (p.campo ? `- ${p.campo}: ${p.mensaje}` : `- ${p.mensaje}`));
  return [ENCABEZADO[r.motivo], ...lineas, QUE_HACER[r.motivo]].join("\n");
}

export type RespuestaDeHerramienta = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

export function respuestaDeHerramienta<T extends Record<string, unknown>>(r: ResultadoAccion<T>): RespuestaDeHerramienta {
  if (r.ok) {
    return { content: [{ type: "text", text: JSON.stringify(r.datos) }], structuredContent: r.datos };
  }
  return { content: [{ type: "text", text: textoDeFalla(r) }], isError: true };
}
