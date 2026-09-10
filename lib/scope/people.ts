import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { organizationScope } from "./organizations";

/**
 * El alcance de personas · derivado de §5.3.
 *
 * **Una persona se ve si se ve su organización.** El spec solo declara el
 * alcance de cuentas; esta es la única regla coherente con él. Si un vendedor
 * no alcanza «Hidrosistemas del Valle», tampoco tiene por qué conocer a su
 * director de sistemas: el contacto es dato de la cuenta, no un directorio
 * aparte.
 *
 * Se escribe delegando en `organizationScope` y no repitiendo sus condiciones:
 * el día que cambie quién ve qué cuenta —`Q-01` sigue abierta—, las personas
 * cambian con ellas sin que nadie tenga que acordarse.
 */
export function personScope(session: Session): Prisma.PersonWhereInput {
  return { deletedAt: null, organization: organizationScope(session) };
}

export function withPersonScope(
  session: Session,
  where?: Prisma.PersonWhereInput,
): Prisma.PersonWhereInput {
  return { AND: [personScope(session), ...(where ? [where] : [])] };
}

/**
 * Las personas que la sesión alcanza, con su empresa y su rol en el comité.
 *
 * Para la pestaña «Personas» de P-03. El rol de comité es la información que
 * convierte una lista de nombres en un mapa del comité de compra (§2.1).
 */
export async function listPersonas(session: Session, where?: Prisma.PersonWhereInput) {
  return prisma.person.findMany({
    where: withPersonScope(session, where),
    select: {
      id: true,
      name: true,
      initials: true,
      jobTitle: true,
      email: true,
      phone: true,
      committeeRole: { select: { id: true, name: true } },
      organization: {
        select: { id: true, name: true, type: true, city: true, countryCode: true },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });
}

export type PersonaDeLista = Awaited<ReturnType<typeof listPersonas>>[number];

/** Una persona, con el alcance aplicado. Devuelve `null` si no la alcanza. */
export async function getPersona(session: Session, id: string) {
  return prisma.person.findFirst({
    where: withPersonScope(session, { id }),
    select: {
      id: true,
      name: true,
      jobTitle: true,
      email: true,
      phone: true,
      committeeRole: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true, ownerId: true, countryCode: true } },
    },
  });
}

export type PersonaEditable = NonNullable<Awaited<ReturnType<typeof getPersona>>>;
