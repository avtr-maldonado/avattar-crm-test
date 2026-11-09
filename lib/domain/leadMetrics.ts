import type { LeadStage } from "@prisma/client";
import { estadoDeSla } from "./leadSla";
import { esTerminal } from "./leadStages";

/**
 * Los cinco indicadores de la pantalla de prospectos · decisiones §58, sobre la
 * lista **ya acotada** por el alcance y la oficina (§10.3 para oportunidades,
 * misma regla aquí): nunca una consulta aparte.
 */
export type ProspectoMedible = {
  stage: LeadStage;
  assignedToId: string | null;
  nextActivityAt: Date | null;
  createdAt: Date;
  firstContactDueAt: Date;
  contactedAt: Date | null;
};

export type IndicadoresDeProspectos = {
  abiertos: number;
  sinAsignar: number;
  /** Abiertos sin próxima actividad agendada. */
  sinSeguimiento: number;
  slaVencido: number;
  /** Convertidos entre cerrados (convertidos, descartados y rechazados). `null` sin cerrados. */
  tasaDeConversion: number | null;
};

function estaAbierto(stage: LeadStage): boolean {
  return !esTerminal(stage) && stage !== "RECHAZADO";
}

export function indicadoresDeProspectos(lista: readonly ProspectoMedible[], ahora: Date): IndicadoresDeProspectos {
  let abiertos = 0;
  let sinAsignar = 0;
  let sinSeguimiento = 0;
  let slaVencido = 0;
  let convertidos = 0;
  let cerrados = 0;
  for (const p of lista) {
    if (estaAbierto(p.stage)) {
      abiertos += 1;
      if (!p.assignedToId) sinAsignar += 1;
      if (!p.nextActivityAt) sinSeguimiento += 1;
      if (estadoDeSla(p, ahora) === "vencido") slaVencido += 1;
    } else {
      cerrados += 1;
      if (p.stage === "CONVERTIDO") convertidos += 1;
    }
  }
  return { abiertos, sinAsignar, sinSeguimiento, slaVencido, tasaDeConversion: cerrados === 0 ? null : convertidos / cerrados };
}
