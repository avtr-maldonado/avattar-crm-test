import type { Prisma } from "@prisma/client";
import { BLOQUEO_MINUTOS } from "@/lib/agente/espera";
import { prisma } from "@/lib/db";

/**
 * Lectores del agente de análisis · decisiones §62 y §63.
 *
 * El agente no tiene sesión: la autorización la hizo la acción que lo lanzó.
 * Por eso estos lectores no reciben `Session` y por eso el `select` es
 * explícito y **nunca trae costo, utilidad ni margen** (INV-02): lo que entra
 * aquí sale al modelo y vuelve a la ficha que lee el vendedor.
 */

/** Cuántas actividades lee el modelo; las más recientes. */
export const ACTIVIDADES_DEL_EXPEDIENTE = 30;

const expedienteSelect = {
  id: true,
  folio: true,
  name: true,
  status: true,
  amount: true,
  estimatedAmount: true,
  forecastCategory: true,
  businessType: true,
  expectedCloseDate: true,
  stageEnteredAt: true,
  lastActivityAt: true,
  nextActivityAt: true,
  createdAt: true,
  meddicScore: true,
  organization: { select: { name: true, industry: true, city: true } },
  primaryPerson: { select: { name: true, jobTitle: true, committeeRole: { select: { name: true } } } },
  stage: { select: { name: true, probability: true, staleAfterDays: true, isClosing: true } },
  country: { select: { name: true, timezone: true } },
  owner: { select: { name: true } },
  supportUsers: { select: { user: { select: { name: true } } } },
  meddic: {
    select: { component: true, status: true, evidence: true, person: { select: { name: true } } },
    orderBy: { component: "asc" },
  },
  milestones: {
    select: { position: true, description: true, dueDate: true, amount: true, status: true },
    orderBy: { position: "asc" },
  },
  quotes: {
    // INV-02 · sin totalCost, grossProfit, grossMargin ni unitCost.
    select: {
      netSubtotal: true,
      lines: {
        select: { description: true, quantity: true, unitPrice: true, discountRate: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { version: "desc" },
    take: 1,
  },
  activities: {
    where: { deletedAt: null },
    select: {
      id: true,
      subject: true,
      startsAt: true,
      completedAt: true,
      notes: true,
      outcome: true,
      transcript: true,
      type: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: ACTIVIDADES_DEL_EXPEDIENTE,
  },
  insights: {
    select: { generatedAt: true, payload: true },
    orderBy: { generatedAt: "desc" },
    take: 1,
  },
} satisfies Prisma.OpportunitySelect;

export type FilasDeExpediente = Prisma.OpportunityGetPayload<{ select: typeof expedienteSelect }>;

export async function expedienteDeOportunidad(id: string): Promise<FilasDeExpediente | null> {
  return prisma.opportunity.findFirst({ where: { id, deletedAt: null }, select: expedienteSelect });
}

/**
 * Lo que la pestaña y la acción necesitan además de las fichas: cuándo cambió
 * por última vez, si hay un análisis en curso, cuándo fue la última ficha y
 * por qué falló la última vez.
 */
export async function estadoDeAnalisis(id: string) {
  const fila = await prisma.opportunity.findFirst({
    where: { id, deletedAt: null },
    select: {
      lastChangedAt: true,
      analysisStartedAt: true,
      analysisError: true,
      insights: { select: { generatedAt: true }, orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });
  if (!fila) return null;
  return {
    lastChangedAt: fila.lastChangedAt,
    analysisStartedAt: fila.analysisStartedAt,
    analysisError: fila.analysisError,
    ultimaFichaEn: fila.insights[0]?.generatedAt ?? null,
  };
}

export type EstadoDeAnalisis = NonNullable<Awaited<ReturnType<typeof estadoDeAnalisis>>>;

/**
 * Toma el bloqueo «analizando» de una oportunidad abierta: un `updateMany`
 * condicionado, así que si otra pulsación se adelantó el conteo es cero y la
 * segunda no lanza nada. Un bloqueo más viejo que el plazo se considera
 * abandonado y se vuelve a tomar.
 */
export async function tomarParaAnalizar(id: string, ahora: Date): Promise<boolean> {
  const r = await prisma.opportunity.updateMany({
    where: {
      id,
      status: "ABIERTA",
      deletedAt: null,
      OR: [{ analysisStartedAt: null }, { analysisStartedAt: { lt: new Date(ahora.getTime() - BLOQUEO_MINUTOS * 60_000) } }],
    },
    data: { analysisStartedAt: ahora },
  });
  return r.count === 1;
}

/** La etiqueta del último análisis, para la tarjeta y la tabla. */
export const ultimoAnalisisSelect = {
  insights: { select: { payload: true }, orderBy: { generatedAt: "desc" }, take: 1 },
} satisfies Prisma.OpportunitySelect;
