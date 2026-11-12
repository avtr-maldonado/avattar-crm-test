import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { opportunityScope } from "./opportunities";

/**
 * Las recomendaciones que un cliente de IA guardó sobre una oportunidad
 * (decisiones §61), de la más reciente a la más antigua.
 *
 * Se leen con el alcance de la **oportunidad**: quien la ve, ve lo que se
 * recomendó sobre ella. Fuera del alcance devuelve vacío, no un error, por la
 * misma razón que `getOpportunity` devuelve `null`: confirmar que existe ya
 * sería decir algo.
 */
export async function listInsights(session: Session, opportunityId: string) {
  return prisma.opportunityInsight.findMany({
    where: { opportunityId, opportunity: opportunityScope(session) },
    select: {
      id: true,
      payload: true,
      sourceActivityIds: true,
      model: true,
      origin: true,
      inputTokens: true,
      outputTokens: true,
      generatedAt: true,
      generatedBy: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { generatedAt: "desc" },
  });
}

export type Recomendacion = Awaited<ReturnType<typeof listInsights>>[number];
