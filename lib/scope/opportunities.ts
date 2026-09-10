import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { opportunityCardSelect, opportunityDetailSelect } from "./selectors";

/**
 * El alcance de oportunidades · INV-01, RN-31.
 *
 * Esta función es el punto donde se decide qué puede ver cada quien. Es pura y
 * no toca la base, para poder probarla en microsegundos y para que se lea
 * completa de un vistazo: es demasiado importante como para estar repartida.
 *
 * **La visibilidad del vendedor sigue a `ownerId`, no a `createdById`.** El
 * Director dijo «las que crean»; tomado literal, un gerente no podría dar de
 * alta una oportunidad y asignarla, y una reasignación dejaría al vendedor
 * nuevo sin acceso. Pendiente de confirmar (Q-01); el cambio sería esta línea.
 */
export function opportunityScope(session: Session): Prisma.OpportunityWhereInput {
  const base: Prisma.OpportunityWhereInput = { deletedAt: null };

  switch (session.role) {
    case "VENDEDOR":
      return { ...base, ownerId: session.userId };
    case "GERENTE_PAIS":
      return { ...base, countryCode: { in: session.countryCodes } };
    case "DIRECCION":
    case "ADMINISTRADOR":
      return base;
    case "PREVENTA":
      return { ...base, supportUsers: { some: { userId: session.userId } } };
  }
}

/**
 * Combina el alcance del rol con un filtro del usuario.
 *
 * El orden no es negociable: **primero el alcance, después el filtro**. Un
 * filtro no puede ampliar lo que el rol permite ver, y con `AND` no hay forma
 * de que lo haga (AC-25).
 */
export function withScope(
  session: Session,
  where?: Prisma.OpportunityWhereInput,
): Prisma.OpportunityWhereInput {
  return where ? { AND: [opportunityScope(session), where] } : opportunityScope(session);
}

/**
 * Lista oportunidades para el kanban y la tabla.
 *
 * Es lo que `app/**` recibe: una función que ya trae el alcance aplicado, no un
 * cliente con el que pueda consultar por su cuenta.
 */
export async function listOpportunities(
  session: Session,
  options: {
    where?: Prisma.OpportunityWhereInput;
    orderBy?: Prisma.OpportunityOrderByWithRelationInput[];
    take?: number;
    skip?: number;
  } = {},
) {
  return prisma.opportunity.findMany({
    where: withScope(session, options.where),
    select: opportunityCardSelect(session),
    orderBy: options.orderBy ?? [{ expectedCloseDate: "asc" }],
    take: options.take,
    skip: options.skip,
  });
}

/**
 * Una oportunidad por id, o `null` si el usuario no la alcanza.
 *
 * Devuelve `null` en vez de lanzar «no autorizado»: distinguir «no existe» de
 * «existe pero no es tuya» le confirmaría a un vendedor que la oportunidad de
 * su compañero existe. La pantalla responde 404 en ambos casos.
 */
export async function getOpportunity(session: Session, id: string) {
  return prisma.opportunity.findFirst({
    where: { AND: [opportunityScope(session), { id }] },
    select: opportunityDetailSelect(session),
  });
}

/** Cuenta con el alcance aplicado. Para los indicadores de encabezado. */
export async function countOpportunities(
  session: Session,
  where?: Prisma.OpportunityWhereInput,
): Promise<number> {
  return prisma.opportunity.count({ where: withScope(session, where) });
}

/**
 * Agrega importes con el alcance aplicado.
 *
 * §2.3: para un Vendedor los indicadores de encabezado se calculan **solo sobre
 * su propio conjunto**. Nunca ve el total de la oficina, ni por agregación —
 * que es precisamente lo que esta función evita al pasar por `withScope`.
 */
export async function sumOpportunityAmounts(
  session: Session,
  where?: Prisma.OpportunityWhereInput,
) {
  const r = await prisma.opportunity.aggregate({
    where: withScope(session, where),
    _sum: { amount: true },
    _count: true,
  });
  return { total: r._sum.amount, count: r._count };
}
