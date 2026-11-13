/**
 * Lo que cuesta un análisis con IA, dicho antes de pedirlo · decisiones §65. Puro.
 *
 * Es una estimación para informar a quien pulsa, no un umbral de negocio
 * (INV-05): ninguna regla decide con este número. Sale de una llamada típica
 * de Claude Opus 5.5 con el expediente y la ficha; si cambia el precio o el
 * tamaño del expediente, se corrige aquí y en ningún otro lugar.
 */
export const COSTO_APROXIMADO_USD = "0.08";

export function leyendaDeCosto(): string {
  return `El análisis se procesará con IA y generará un costo aproximado de $${COSTO_APROXIMADO_USD} USD a la organización.`;
}
