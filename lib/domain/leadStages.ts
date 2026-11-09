import type { LeadStage } from "@prisma/client";

/**
 * El pipeline de prospectos · decisiones §58.
 *
 * Nueve etapas con comportamiento propio, por eso son valores fijos y no una
 * tabla como las etapas de oportunidad (INV-13, excepción razonada en §58):
 * Asignado exige vendedor, Aceptado y Rechazado los decide ventas, Convertido
 * y Descartado son terminales y solo llegan por sus servicios.
 */
export const ETAPAS_DE_PROSPECTO: readonly LeadStage[] = [
  "NUEVO",
  "EN_VALIDACION",
  "CONTACTADO",
  "CALIFICADO",
  "ASIGNADO",
  "ACEPTADO",
  "RECHAZADO",
  "CONVERTIDO",
  "DESCARTADO",
];

/** Las columnas del kanban: lo que se está trabajando. */
export const ETAPAS_ABIERTAS: readonly LeadStage[] = ["NUEVO", "EN_VALIDACION", "CONTACTADO", "CALIFICADO", "ASIGNADO", "ACEPTADO"];

export const ETIQUETA_DE_ETAPA: Record<LeadStage, string> = {
  NUEVO: "Nuevo",
  EN_VALIDACION: "En validación",
  CONTACTADO: "Contactado",
  CALIFICADO: "Calificado",
  ASIGNADO: "Asignado",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  CONVERTIDO: "Convertido",
  DESCARTADO: "Descartado",
};

/** El color de la pastilla: azul lo que avanza, verde lo que ventas tomó o convirtió, coral lo que salió. */
export const TONO_DE_ETAPA: Record<LeadStage, "neutro" | "acento" | "exito" | "alerta" | "peligro"> = {
  NUEVO: "neutro",
  EN_VALIDACION: "acento",
  CONTACTADO: "acento",
  CALIFICADO: "acento",
  ASIGNADO: "alerta",
  ACEPTADO: "exito",
  RECHAZADO: "peligro",
  CONVERTIDO: "exito",
  DESCARTADO: "neutro",
};

export function esTerminal(e: LeadStage): boolean {
  return e === "CONVERTIDO" || e === "DESCARTADO";
}

/** Quién intenta mover: si gestiona prospectos (Marketing, Gerencia…) y si es el vendedor asignado. */
export type Actor = { gestiona: boolean; esAsignado: boolean };

const DE_MARKETING: readonly LeadStage[] = ["NUEVO", "EN_VALIDACION", "CONTACTADO", "CALIFICADO"];

/**
 * ¿Se puede pasar de una etapa a otra, por mano? Convertido y Descartado no
 * entran aquí: llegan por `convertirProspecto` y `descartarProspecto`, que
 * exigen lo suyo (la oportunidad, el motivo). El mensaje dice qué falta.
 */
export function puedeTransitar(de: LeadStage, a: LeadStage, actor: Actor, tieneVendedor: boolean): { ok: true } | { ok: false; mensaje: string } {
  if (de === a) return { ok: false, mensaje: `Ya está en ${ETIQUETA_DE_ETAPA[a]}.` };
  if (esTerminal(de)) return { ok: false, mensaje: `Un prospecto ${ETIQUETA_DE_ETAPA[de].toLowerCase()} ya no se mueve.` };
  if (a === "CONVERTIDO") return { ok: false, mensaje: "Para convertirlo usa «Convertir a oportunidad»." };
  if (a === "DESCARTADO") return { ok: false, mensaje: "Para descartarlo usa «Descartar», con su motivo." };

  if (DE_MARKETING.includes(de) && DE_MARKETING.includes(a)) {
    return actor.gestiona ? { ok: true } : { ok: false, mensaje: "Validar y calificar es de Marketing o Gerencia." };
  }

  if (a === "ASIGNADO") {
    if (!tieneVendedor) return { ok: false, mensaje: "Para pasar a Asignado elige al vendedor." };
    if (de === "ACEPTADO") {
      return actor.esAsignado || actor.gestiona ? { ok: true } : { ok: false, mensaje: "Solo el asignado o Gerencia lo regresan a Asignado." };
    }
    return actor.gestiona ? { ok: true } : { ok: false, mensaje: "Asignar es de Marketing o Gerencia." };
  }

  if (de === "ASIGNADO" && (a === "ACEPTADO" || a === "RECHAZADO")) {
    return actor.esAsignado || actor.gestiona ? { ok: true } : { ok: false, mensaje: "Aceptar o rechazar es del vendedor asignado o de Gerencia." };
  }

  if (de === "ASIGNADO" && DE_MARKETING.includes(a)) {
    return actor.gestiona ? { ok: true } : { ok: false, mensaje: "Devolverlo a Marketing es de quien gestiona." };
  }

  return { ok: false, mensaje: `De ${ETIQUETA_DE_ETAPA[de]} no se pasa a ${ETIQUETA_DE_ETAPA[a]}.` };
}
