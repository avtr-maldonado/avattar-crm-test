import type { MeddicComponent, MeddicStatus } from "@prisma/client";

/**
 * MEDDIC · §7.
 *
 * Seis componentes con estado y evidencia. El puntaje **gatea, no pondera**: no
 * toca la fórmula del ponderado, que sigue siendo `amount × probabilidad de
 * etapa` (RN-01). Dos mecanismos moviendo el pronóstico al mismo tiempo hacen
 * imposible explicar un número en el comité comercial.
 *
 * Funciones puras. Los pesos y los mínimos entran por parámetro (INV-05).
 */

export type MeddicAssessment = {
  component: MeddicComponent;
  status: MeddicStatus;
  evidence?: string | null;
  personId?: string | null;
};

export type MeddicWeights = Record<MeddicComponent, number>;

/** §7.1 · puntos por estado. AUSENTE vale 0 igual que NO_EVALUADO, pero informa. */
const PUNTOS: Record<MeddicStatus, number> = {
  NO_EVALUADO: 0,
  AUSENTE: 0,
  PARCIAL: 1,
  CONFIRMADO: 2,
};

/** Q-08 · cinco a 17 y el dolor a 15, para que sumen exactamente 100. */
export const PESOS_POR_OMISION: MeddicWeights = {
  METRICAS: 17,
  DECISOR_ECONOMICO: 17,
  CRITERIOS_DECISION: 17,
  PROCESO_DECISION: 17,
  DOLOR_IDENTIFICADO: 15,
  CAMPEON: 17,
};

/** Nombres visibles. INV-14: la UI siempre en español. */
export const NOMBRE_COMPONENTE: Record<MeddicComponent, string> = {
  METRICAS: "Métricas",
  DECISOR_ECONOMICO: "Decisor económico",
  CRITERIOS_DECISION: "Criterios de decisión",
  PROCESO_DECISION: "Proceso de decisión",
  DOLOR_IDENTIFICADO: "Dolor identificado",
  CAMPEON: "Campeón",
};

/**
 * Qué es cada componente, en una línea y en el idioma del vendedor.
 *
 * Va debajo del nombre en la pestaña, para que nadie tenga que abrir el panel
 * de calificar para saber qué está calificando. Es la definición operativa,
 * no la del manual: dice qué hay que haber averiguado para poder marcarlo.
 */
export const DESCRIPCION_COMPONENTE: Record<MeddicComponent, string> = {
  METRICAS: "El beneficio medible que el cliente espera: ahorro, ingreso o tiempo, con cifra.",
  DECISOR_ECONOMICO: "Quien autoriza el presupuesto y puede decir sí sin pedir permiso a nadie.",
  CRITERIOS_DECISION: "Con qué van a comparar las propuestas: técnicos, económicos, de servicio.",
  PROCESO_DECISION: "Los pasos y fechas hasta la firma: quién revisa, quién aprueba y cuándo.",
  DOLOR_IDENTIFICADO: "El problema concreto que les duele hoy y lo que les cuesta no resolverlo.",
  CAMPEON: "La persona de adentro que quiere que ganemos y tiene influencia para empujarlo.",
};

export const NOMBRE_ESTADO: Record<MeddicStatus, string> = {
  NO_EVALUADO: "No evaluado",
  AUSENTE: "Ausente",
  PARCIAL: "Parcial",
  CONFIRMADO: "Confirmado",
};

/**
 * Los dos componentes que se anclan a una persona real de la organización
 * (§2.1), no a texto libre. Así el comité de compra de la ficha de cuenta y
 * MEDDIC son la misma información, no dos capturas.
 */
const ANCLADOS_A_PERSONA: MeddicComponent[] = ["DECISOR_ECONOMICO", "CAMPEON"];

/**
 * Los tres que RN-28 exige `CONFIRMADO` para ganar, sin importar el puntaje.
 * Se puede llegar a 80 puntos con buenas métricas y sin campeón, y eso no es
 * una venta cerrable.
 */
const OBLIGATORIOS_PARA_GANAR: MeddicComponent[] = [
  "DECISOR_ECONOMICO",
  "DOLOR_IDENTIFICADO",
  "CAMPEON",
];

/** §7.2 · puntaje de 0 a 100. Con los seis confirmados y pesos que suman 100, da 100. */
export function computeMeddicScore(
  assessments: Pick<MeddicAssessment, "component" | "status">[],
  weights: MeddicWeights,
): number {
  const total = assessments.reduce(
    (acc, a) => acc + PUNTOS[a.status] * (weights[a.component] ?? 0),
    0,
  );
  // 2 = puntos máximos por componente.
  return Math.round(total / 2);
}

export type ResultadoValidacion = { ok: true } | { ok: false; motivo: string };

/**
 * RN-30, enmendada el 23-sep (§24) y el 24-sep-2026 (§27) · `CONFIRMADO`
 * exige evidencia: confirmar es afirmar, y hay que decir en qué te basas. El
 * decisor económico y el campeón confirmados exigen además una persona ligada.
 * `PARCIAL` sigue sin exigir evidencia: se guarda y la tarjeta lo señala
 * (`faltaEvidencia`).
 *
 * La evidencia no es burocracia: sin ella el puntaje es una opinión, y por eso
 * se pide al confirmar y se ve dónde falta al calificar parcial.
 */
export function validarComponente(a: MeddicAssessment): ResultadoValidacion {
  if (a.status === "CONFIRMADO" && !a.evidence?.trim()) {
    return {
      ok: false,
      motivo: `${NOMBRE_COMPONENTE[a.component]} confirmado necesita evidencia: escribe en qué te basas.`,
    };
  }

  if (a.status === "CONFIRMADO" && ANCLADOS_A_PERSONA.includes(a.component) && !a.personId) {
    return {
      ok: false,
      motivo: `${NOMBRE_COMPONENTE[a.component]} confirmado necesita una persona del comité de compra ligada. Elige a quién te refieres.`,
    };
  }

  return { ok: true };
}

/**
 * Lo que la tarjeta señala en vez de bloquear (§24): un componente calificado
 * —parcial o confirmado— cuya evidencia está en blanco.
 */
export function faltaEvidencia(a: { status: string; evidence: string | null | undefined }): boolean {
  return (a.status === "PARCIAL" || a.status === "CONFIRMADO") && !a.evidence?.trim();
}

const COMPONENTES: readonly string[] = Object.keys(NOMBRE_COMPONENTE);
const ESTADOS: readonly string[] = Object.keys(NOMBRE_ESTADO);

/**
 * Si un estado se puede marcar **sin abrir el panel**: cuando lo que RN-30
 * exige para ese estado —evidencia al confirmar, y persona para el decisor y
 * el campeón— ya está en lo guardado. Si no, el botón abre el panel con el
 * estado elegido y el foco en lo que falta (§27).
 *
 * Recibe cadenas porque lo llama el cliente, que no conoce los enums de Prisma;
 * lo que no sea un componente o un estado conocido no se califica de ninguna
 * forma.
 */
export function puedeCalificarDirecto(a: {
  component: string;
  status: string;
  evidence: string | null;
  personId: string | null;
}): boolean {
  if (!COMPONENTES.includes(a.component) || !ESTADOS.includes(a.status)) return false;
  return validarComponente({
    component: a.component as MeddicComponent,
    status: a.status as MeddicStatus,
    evidence: a.evidence,
    personId: a.personId,
  }).ok;
}

/**
 * RN-28, AC-14 · qué falta para poder ganar.
 *
 * Devuelve mensajes que nombran el componente y el estado al que tiene que
 * llegar. Nunca un «no se puede» genérico: §7.4 lo pide explícitamente, y es la
 * diferencia entre una validación que enseña y una que frustra.
 */
export function componentesFaltantesParaGanar(
  assessments: Pick<MeddicAssessment, "component" | "status">[],
  meddicScore: number,
  minimos: { meddicMinToWin: number },
): string[] {
  const faltantes: string[] = [];

  if (meddicScore < minimos.meddicMinToWin) {
    faltantes.push(
      `El puntaje MEDDIC es ${meddicScore} y se necesitan ${minimos.meddicMinToWin} para marcar ganada.`,
    );
  }

  const porComponente = new Map(assessments.map((a) => [a.component, a.status]));
  for (const componente of OBLIGATORIOS_PARA_GANAR) {
    const estado = porComponente.get(componente) ?? "NO_EVALUADO";
    if (estado !== "CONFIRMADO") {
      faltantes.push(
        `${NOMBRE_COMPONENTE[componente]} está en ${NOMBRE_ESTADO[estado]} y debe estar Confirmado para poder ganar.`,
      );
    }
  }

  return faltantes;
}

/**
 * RN-29 · la categoría «Compromiso» exige el mínimo. Es el gate que más le
 * importa a Dirección: nadie mete un negocio al compromiso del trimestre sin
 * MEDDIC. Es la diferencia entre un pronóstico y un deseo.
 */
export function puedeSerCompromiso(
  meddicScore: number,
  minimos: { meddicMinToCommit: number },
): ResultadoValidacion {
  if (meddicScore < minimos.meddicMinToCommit) {
    return {
      ok: false,
      motivo: `El puntaje MEDDIC es ${meddicScore} y se necesitan ${minimos.meddicMinToCommit} para la categoría Compromiso.`,
    };
  }
  return { ok: true };
}
