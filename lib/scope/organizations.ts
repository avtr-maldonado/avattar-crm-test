import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { personScope } from "./people";

/**
 * El alcance de organizaciones · decisiones §29.
 *
 * **Todos ven todas las cuentas.** El negocio lo decidió el 25 de septiembre
 * de 2026: una empresa es de toda la operación, y esconderla por propietario
 * producía duplicados y cuentas que nadie encontraba. Lo que sí tiene
 * propietario y se recorta son las **personas** (`personScope`), y las
 * **oportunidades** siguen con su alcance por rol (`opportunityScope`).
 *
 * Consecuencia que §5.3 subraya y sigue valiendo: los indicadores de la ficha
 * —pipeline abierto, ganado 12 meses— se calculan solo sobre las oportunidades
 * que ese usuario puede ver. Si se calcularan sobre el total de la cuenta, un
 * vendedor deduciría el pipeline de su compañero restando.
 *
 * Se conserva la firma con sesión, aunque hoy no la use, porque es la que INV-01
 * fija para todo alcance: el día que vuelva a recortar, cambia esta función y
 * nada más.
 */
export function organizationScope(session: Session): Prisma.OrganizationWhereInput {
  // Un caso por rol, todos iguales, a propósito: se lee de un vistazo que
  // ningún rol recorta cuentas, y agregar un recorte es tocar un solo caso.
  switch (session.role) {
    case "VENDEDOR":
    case "PREVENTA":
    case "GERENTE_PAIS":
    case "DIRECCION":
    case "ADMINISTRADOR":
      return { deletedAt: null };
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
      // Las personas de la cuenta, solo las que la sesión alcanza (§29): ver la
      // cuenta ya no significa ver a toda su gente.
      people: {
        where: personScope(session),
        select: {
          id: true,
          name: true,
          initials: true,
          jobTitle: true,
          email: true,
          phone: true,
          ownerId: true,
          owner: { select: { id: true, name: true, initials: true, countryCodes: true } },
          shares: { select: { userId: true, sharedBy: { select: { name: true } } } },
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

  // Sin recorte por país: las cuentas no son de un país (decisiones §18), y
  // esconder una con sede en Chile a un vendedor de México produciría justo el
  // duplicado que esta búsqueda existe para evitar.
  return prisma.organization.findMany({
    where: {
      deletedAt: null,
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
 * Aquí **sí** aplica el alcance: `getOrganization` trae solo las personas que
 * la sesión alcanza (`personScope`, §29). Lo demás de la cuenta no se ofrece.
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
