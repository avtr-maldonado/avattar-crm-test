import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * El alcance de organizaciones · §5.3.
 *
 * Un Vendedor ve una cuenta si es su propietario **o** si tiene al menos una
 * oportunidad propia en ella. Solo lo primero dejaría a un vendedor con una
 * oportunidad en cuenta ajena sin poder abrir la ficha de esa cuenta.
 *
 * Consecuencia que §5.3 subraya: los indicadores de la ficha —pipeline abierto,
 * ganado 12 meses— se calculan solo sobre las oportunidades que ese usuario
 * puede ver. Si se calcularan sobre el total de la cuenta, un vendedor
 * deduciría el pipeline de su compañero restando.
 */
export function organizationScope(session: Session): Prisma.OrganizationWhereInput {
  const base: Prisma.OrganizationWhereInput = { deletedAt: null };

  switch (session.role) {
    case "VENDEDOR":
    case "PREVENTA":
      return {
        ...base,
        OR: [
          { ownerId: session.userId },
          { opportunities: { some: { ownerId: session.userId, deletedAt: null } } },
        ],
      };
    case "GERENTE_PAIS":
      return { ...base, countryCode: { in: session.countryCodes } };
    case "DIRECCION":
    case "ADMINISTRADOR":
      return base;
  }
}

export function withOrganizationScope(
  session: Session,
  where?: Prisma.OrganizationWhereInput,
): Prisma.OrganizationWhereInput {
  return where ? { AND: [organizationScope(session), where] } : organizationScope(session);
}

export async function listOrganizations(
  session: Session,
  options: { where?: Prisma.OrganizationWhereInput; take?: number; skip?: number } = {},
) {
  return prisma.organization.findMany({
    where: withOrganizationScope(session, options.where),
    select: {
      id: true,
      name: true,
      type: true,
      industry: true,
      city: true,
      countryCode: true,
      isStrategic: true,
      owner: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { name: "asc" },
    take: options.take,
    skip: options.skip,
  });
}

export async function getOrganization(session: Session, id: string) {
  return prisma.organization.findFirst({
    where: { AND: [organizationScope(session), { id }] },
    select: {
      id: true,
      name: true,
      legalName: true,
      taxId: true,
      type: true,
      industry: true,
      city: true,
      countryCode: true,
      employees: true,
      creditDays: true,
      isStrategic: true,
      owner: { select: { id: true, name: true, initials: true } },
      people: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          initials: true,
          jobTitle: true,
          email: true,
          phone: true,
          committeeRole: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
}

/**
 * Sugerencias de organización para el alta de una oportunidad.
 *
 * ## Esta función salta el alcance por rol, a propósito
 *
 * `organizationScope` no se aplica aquí. Es la **única** excepción a INV-01 en
 * todo el sistema, decidida con el negocio el 2 de septiembre de 2026, y vive
 * en una función con nombre propio para que se vea en vez de esconderse dentro
 * de una consulta.
 *
 * **Por qué.** Si un vendedor no ve que «Hidrosistemas del Valle» ya existe
 * porque la ficha es de otro, va a dar de alta «Hidrosistemas del Valle SA», y
 * a partir de ese momento el histórico de esa cuenta queda partido en dos para
 * siempre. Los duplicados de organización no se limpian nunca.
 *
 * **Qué se expone y qué no.** Solo nombre, tipo y ciudad. **Nunca el
 * propietario, nunca cifras, nunca conteos.** Un vendedor descubre qué empresas
 * son clientes de Avattar; no descubre de quién son ni cuánto valen. La fuga
 * queda acotada a exactamente lo que el negocio autorizó.
 *
 * El país sí acota: nadie ve la cartera de otro país (AC-05).
 */
export async function buscarOrganizacionesParaAlta(session: Session, texto: string) {
  const termino = texto.trim();
  if (termino.length < 2) return [];

  return prisma.organization.findMany({
    where: {
      deletedAt: null,
      countryCode: { in: session.countryCodes },
      name: { contains: termino, mode: "insensitive" },
    },
    select: { id: true, name: true, type: true, city: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

/**
 * Las personas de una organización, para el campo de persona principal.
 *
 * Aquí **sí** aplica el alcance: elegida la organización, sus contactos son
 * dato de la cuenta y `getOrganization` ya decide quién la alcanza. Si la
 * sesión no llega a esa organización, no hay personas que ofrecer.
 */
export async function buscarPersonasDeOrganizacion(session: Session, organizationId: string) {
  const organizacion = await getOrganization(session, organizationId);
  if (!organizacion) return [];

  return organizacion.people.map((p) => ({
    id: p.id,
    name: p.name,
    jobTitle: p.jobTitle,
    committeeRole: p.committeeRole,
  }));
}

/** La ficha completa de una cuenta, como la devuelve `getOrganization`. */
export type OrganizacionConGente = NonNullable<Awaited<ReturnType<typeof getOrganization>>>;
