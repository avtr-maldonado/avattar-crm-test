import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { opportunityScope } from "./opportunities";

/**
 * El alcance de personas · decisiones §29.
 *
 * Las cuentas las ve todo el mundo; las **personas** tienen propietario. Un
 * vendedor ve las suyas, las que le compartieron y las de las cuentas donde
 * tiene una oportunidad: capturar al contacto que acabas de conocer es parte
 * de trabajar la oportunidad, y trabajarla exige ver a quién ya conocen. El
 * gerente ve además las de los usuarios de su país; Dirección y
 * Administración, todas.
 *
 * La tercera condición se escribe con `opportunityScope`, no repitiendo sus
 * reglas: «las cuentas donde tengo oportunidad» es exactamente «las cuentas
 * con una oportunidad que alcanzo», y así cambia con RN-31 sin que nadie
 * tenga que acordarse.
 *
 * Compartir da solo lectura; quién edita, comparte o transfiere lo decide
 * `administraPersona` (`lib/domain/personAccess.ts`).
 */
export function personScope(session: Session): Prisma.PersonWhereInput {
  const base: Prisma.PersonWhereInput = { deletedAt: null };
  const compartidaConmigo: Prisma.PersonWhereInput = {
    shares: { some: { userId: session.userId } },
  };
  const deCuentaConOportunidad: Prisma.PersonWhereInput = {
    organization: { opportunities: { some: opportunityScope(session) } },
  };

  switch (session.role) {
    case "DIRECCION":
    case "ADMINISTRADOR":
      return base;
    case "GERENTE_PAIS":
      return {
        ...base,
        OR: [
          { owner: { countryCodes: { hasSome: session.countryCodes } } },
          compartidaConmigo,
          deCuentaConOportunidad,
        ],
      };
    case "VENDEDOR":
    case "PREVENTA":
      return {
        ...base,
        OR: [{ ownerId: session.userId }, compartidaConmigo, deCuentaConOportunidad],
      };
  }
}

export function withPersonScope(
  session: Session,
  where?: Prisma.PersonWhereInput,
): Prisma.PersonWhereInput {
  return { AND: [personScope(session), ...(where ? [where] : [])] };
}

/**
 * Las personas que la sesión alcanza, con su empresa, su rol en el comité y
 * quién la tiene.
 *
 * Para la pestaña «Personas» de P-03. El rol de comité es la información que
 * convierte una lista de nombres en un mapa del comité de compra (§2.1). Las
 * compartidas viajan completas: quien mira sabe si se la compartieron, y quien
 * la administra ve con quién está.
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
      ownerId: true,
      owner: { select: { id: true, name: true, initials: true, countryCodes: true } },
      shares: { select: { userId: true, sharedBy: { select: { name: true } } } },
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
      ownerId: true,
      owner: { select: { id: true, name: true, countryCodes: true } },
      shares: { select: { userId: true } },
      committeeRole: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true, ownerId: true, countryCode: true } },
    },
  });
}

export type PersonaEditable = NonNullable<Awaited<ReturnType<typeof getPersona>>>;

/**
 * Con quién se puede compartir o a quién transferir una persona.
 *
 * Un gerente comparte dentro de su país; Dirección y Administración, con
 * cualquiera. El vendedor, con la gente de su oficina: es a quien le pasa un
 * contacto. Siempre usuarios activos.
 */
export async function usuariosParaCompartir(session: Session) {
  const todos = session.role === "DIRECCION" || session.role === "ADMINISTRADOR";
  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      ...(todos ? {} : { countryCodes: { hasSome: session.countryCodes } }),
    },
    select: { id: true, name: true, initials: true, role: true, countryCodes: true },
    orderBy: { name: "asc" },
  });
}

export type UsuarioParaCompartir = Awaited<ReturnType<typeof usuariosParaCompartir>>[number];
