import type { CountryCode, Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * El alcance de actividades · §5.3.
 *
 * Propias, más las ligadas a oportunidades u organizaciones visibles. La
 * segunda parte importa: una actividad que preventa registró sobre una
 * oportunidad del vendedor debe aparecer en la bitácora de esa oportunidad, o
 * la ficha miente sobre lo que ha pasado con la cuenta.
 */
export function activityScope(session: Session): Prisma.ActivityWhereInput {
  const base: Prisma.ActivityWhereInput = { deletedAt: null };

  switch (session.role) {
    case "VENDEDOR":
      return {
        ...base,
        OR: [
          { userId: session.userId },
          { opportunity: { ownerId: session.userId, deletedAt: null } },
          { organization: { ownerId: session.userId, deletedAt: null } },
        ],
      };
    case "PREVENTA":
      return {
        ...base,
        OR: [
          { userId: session.userId },
          {
            opportunity: {
              supportUsers: { some: { userId: session.userId } },
              deletedAt: null,
            },
          },
        ],
      };
    case "GERENTE_PAIS":
      return {
        ...base,
        OR: [
          { userId: session.userId },
          { opportunity: { countryCode: { in: session.countryCodes }, deletedAt: null } },
          { organization: { countryCode: { in: session.countryCodes }, deletedAt: null } },
        ],
      };
    case "DIRECCION":
    case "ADMINISTRADOR":
      return base;
  }
}

export function withActivityScope(
  session: Session,
  where?: Prisma.ActivityWhereInput,
): Prisma.ActivityWhereInput {
  return where ? { AND: [activityScope(session), where] } : activityScope(session);
}

export async function listActivities(
  session: Session,
  options: { where?: Prisma.ActivityWhereInput; take?: number } = {},
) {
  return prisma.activity.findMany({
    where: withActivityScope(session, options.where),
    select: {
      id: true,
      subject: true,
      notes: true,
      startsAt: true,
      durationMin: true,
      completedAt: true,
      outcome: true,
      type: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, initials: true } },
      opportunity: { select: { id: true, folio: true, name: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { startsAt: "desc" },
    take: options.take,
  });
}

/**
 * Las actividades de una oficina. La oficina se lee de la oportunidad o de la
 * cuenta a la que pertenece la actividad; una actividad suelta —sin ninguna de
 * las dos— es del usuario y aparece en cualquier oficina. Va DESPUÉS del
 * alcance, con AND: recorta, nunca amplía (AC-25).
 */
export function actividadEnOficina(pais: CountryCode): Prisma.ActivityWhereInput {
  return {
    OR: [
      { opportunity: { countryCode: pais } },
      { organization: { countryCode: pais } },
      { opportunity: null, organization: null },
    ],
  };
}
