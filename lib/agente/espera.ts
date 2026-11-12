/**
 * Tiempos del agente de análisis · decisiones §63. Puro.
 *
 * Un solo plazo operativo, no de negocio (INV-05): cuánto dura el bloqueo
 * «analizando» de una oportunidad, para que dos pulsaciones no lancen dos
 * llamadas y para que una llamada que murió sin soltar el bloqueo no deje la
 * oportunidad atorada.
 */
export const BLOQUEO_MINUTOS = 10;

/** ¿Hay un análisis en curso? Un inicio más viejo que el plazo se considera abandonado. */
export function enCurso(startedAt: Date | null, ahora: Date): boolean {
  if (!startedAt) return false;
  return ahora.getTime() - startedAt.getTime() <= BLOQUEO_MINUTOS * 60_000;
}
