import type { Money } from "@/lib/money";

/**
 * Las banderas de riesgo · RN-13, INV-11.
 *
 * **Se calculan, no se capturan.** No existe un campo editable «en riesgo»: la
 * bandera se deriva de actividad, etapa y margen cada vez que se pregunta. Un
 * campo capturado se desactualiza en cuanto alguien mueve la oportunidad y se
 * olvida de destildarlo, y entonces el panel de riesgo deja de ser confiable.
 *
 * Función pura. Todo umbral entra por parámetro (INV-05): los días de
 * estancamiento vienen de la etapa y el piso de margen, de la política del país.
 */
export type RiskFlag = "SIN_ACTIVIDAD" | "ESTANCADA" | "MARGEN_BAJO";

export type RiskInputs = {
  /** Nulo mientras no hay cotización: sin margen no se acusa margen bajo. */
  grossMargin: Money | null;
  /** RN-03 · se sella en cada transición, no en cada actividad. */
  stageEnteredAt: Date;
  nextActivityAt: Date | null;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function computeRiskFlags(
  oportunidad: RiskInputs,
  etapa: { staleAfterDays: number },
  politica: { marginFloor: Money },
  ahora: Date,
): RiskFlag[] {
  const banderas: RiskFlag[] = [];

  // RN-10 · toda oportunidad abierta debe tener una actividad futura. Sin ella,
  // el negocio depende de que alguien se acuerde.
  const sinProxima =
    oportunidad.nextActivityAt === null || oportunidad.nextActivityAt <= ahora;
  if (sinProxima) banderas.push("SIN_ACTIVIDAD");

  // RN-03 · el contador mira la ETAPA. Registrar una llamada no lo reinicia:
  // una oportunidad puede tener mucha actividad y no avanzar, y eso es
  // exactamente lo que esta bandera existe para mostrar.
  const diasEnEtapa = (ahora.getTime() - oportunidad.stageEnteredAt.getTime()) / MS_POR_DIA;
  if (diasEnEtapa > etapa.staleAfterDays) banderas.push("ESTANCADA");

  // RN-05 · «verde en o sobre el piso, coral debajo» (§13.1). El piso cumple.
  if (oportunidad.grossMargin !== null && oportunidad.grossMargin.lt(politica.marginFloor)) {
    banderas.push("MARGEN_BAJO");
  }

  return banderas;
}
