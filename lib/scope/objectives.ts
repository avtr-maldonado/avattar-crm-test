import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * El alcance de objetivos · §2.3, AC-29.
 *
 * Un Vendedor lee **solo su renglón**. No ve la cuota ni el avance de sus
 * compañeros, y §10.3 es explícito sobre la consecuencia: el total del equipo
 * se calcula sumando las filas visibles, nunca con una consulta aparte que
 * ignore el alcance.
 *
 * Sin `deletedAt`: los objetivos no se borran lógicamente, se reemplazan por
 * periodo. La unicidad es (usuario, año fiscal, tipo de periodo, trimestre).
 */
export function objectiveScope(session: Session): Prisma.ObjectiveWhereInput {
  switch (session.role) {
    case "VENDEDOR":
    case "PREVENTA":
      return { userId: session.userId };
    case "GERENTE_PAIS":
      return { countryCode: { in: session.countryCodes } };
    case "DIRECCION":
    case "ADMINISTRADOR":
      return {};
  }
}

export function withObjectiveScope(
  session: Session,
  where?: Prisma.ObjectiveWhereInput,
): Prisma.ObjectiveWhereInput {
  return where ? { AND: [objectiveScope(session), where] } : objectiveScope(session);
}

export async function listObjectives(
  session: Session,
  periodo: { fiscalYear: number; periodType: "ANUAL" | "TRIMESTRAL"; quarter?: number },
) {
  return prisma.objective.findMany({
    where: withObjectiveScope(session, {
      fiscalYear: periodo.fiscalYear,
      periodType: periodo.periodType,
      quarter: periodo.periodType === "TRIMESTRAL" ? periodo.quarter : null,
    }),
    select: {
      id: true,
      fiscalYear: true,
      periodType: true,
      quarter: true,
      revenueQuota: true,
      grossProfitQuota: true,
      currency: true,
      countryCode: true,
      user: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { revenueQuota: "desc" },
  });
}
