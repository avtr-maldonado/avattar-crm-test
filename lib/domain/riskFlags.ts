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
  /**
   * Opcional porque no interviene en el veredicto: solo sirve para poder decir
   * «34 días sin contacto» en vez de «sin actividad». Las banderas se calculan
   * igual sin él.
   */
  lastActivityAt?: Date | null;
};

/**
 * La bandera con el número que la justifica.
 *
 * §13: «Los errores dicen qué falta con el dato concreto.» Una lista que dice
 * "Estancada" tres veces no ayuda a decidir cuál atender primero; una que dice
 * «Estancada 26 días en Negociación» y «Margen 9 % bajo el piso de 20 %»
 * ordena sola el trabajo del día.
 *
 * Devuelve datos, no frases: el texto visible se arma en `lib/etiquetas.ts`,
 * que es donde vive el español de la interfaz (INV-14). Así este módulo se
 * sigue probando sin nada de presentación.
 */
export type RiskEvidence =
  | { flag: "SIN_ACTIVIDAD"; diasSinContacto: number | null }
  | { flag: "ESTANCADA"; diasEnEtapa: number; limite: number }
  | { flag: "MARGEN_BAJO"; margen: Money; piso: Money };

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

export function explainRiskFlags(
  oportunidad: RiskInputs,
  etapa: { staleAfterDays: number },
  politica: { marginFloor: Money },
  ahora: Date,
): RiskEvidence[] {
  const evidencia: RiskEvidence[] = [];

  // RN-10 · toda oportunidad abierta debe tener una actividad futura. Sin ella,
  // el negocio depende de que alguien se acuerde.
  const sinProxima =
    oportunidad.nextActivityAt === null || oportunidad.nextActivityAt <= ahora;
  if (sinProxima) {
    evidencia.push({
      flag: "SIN_ACTIVIDAD",
      // Sin historia no se inventa un cero: una oportunidad recién creada no
      // lleva «0 días sin contacto», no ha habido ninguno.
      diasSinContacto: oportunidad.lastActivityAt
        ? diasEntre(oportunidad.lastActivityAt, ahora)
        : null,
    });
  }

  // RN-03 · el contador mira la ETAPA. Registrar una llamada no lo reinicia:
  // una oportunidad puede tener mucha actividad y no avanzar, y eso es
  // exactamente lo que esta bandera existe para mostrar.
  const diasEnEtapa = (ahora.getTime() - oportunidad.stageEnteredAt.getTime()) / MS_POR_DIA;
  if (diasEnEtapa > etapa.staleAfterDays) {
    evidencia.push({
      flag: "ESTANCADA",
      diasEnEtapa: Math.floor(diasEnEtapa),
      limite: etapa.staleAfterDays,
    });
  }

  // RN-05 · «verde en o sobre el piso, coral debajo» (§13.1). El piso cumple.
  if (oportunidad.grossMargin !== null && oportunidad.grossMargin.lt(politica.marginFloor)) {
    evidencia.push({
      flag: "MARGEN_BAJO",
      margen: oportunidad.grossMargin,
      piso: politica.marginFloor,
    });
  }

  return evidencia;
}

/**
 * Las banderas, sin la evidencia. Es lo que el kanban y la tarjeta necesitan.
 *
 * Se deriva de `explainRiskFlags` en vez de repetir las tres condiciones: dos
 * implementaciones de la misma regla divergen en cuanto alguien ajuste una.
 */
export function computeRiskFlags(
  oportunidad: RiskInputs,
  etapa: { staleAfterDays: number },
  politica: { marginFloor: Money },
  ahora: Date,
): RiskFlag[] {
  return explainRiskFlags(oportunidad, etapa, politica, ahora).map((e) => e.flag);
}
