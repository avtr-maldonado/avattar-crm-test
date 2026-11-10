import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { activityScope } from "./activities";
import { opportunityCardSelect } from "./selectors";
import { withScope } from "./opportunities";

/**
 * Los lectores del servidor MCP · decisiones §61.
 *
 * Un lector por «pantalla», y el MCP es una: cada herramienta lee de aquí y
 * de nada más. Todos anteponen el alcance del rol (INV-01); ninguno trae
 * costo ni utilidad, porque el MCP no los sirve (INV-02 reforzado), y por eso
 * no consultan `can(session, "VER_COSTO")`.
 */

const actividadSelect = {
  id: true,
  subject: true,
  notes: true,
  outcome: true,
  transcript: true,
  startsAt: true,
  durationMin: true,
  completedAt: true,
  opportunityId: true,
  type: { select: { name: true } },
  user: { select: { name: true } },
  opportunity: { select: { id: true, folio: true } },
} satisfies Prisma.ActivitySelect;

/** Las actividades citadas en una recomendación, solo las que la sesión alcanza. */
export async function actividadesPorIds(session: Session, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return prisma.activity.findMany({
    where: { AND: [activityScope(session), { id: { in: [...ids] } }] },
    select: actividadSelect,
  });
}

/** Una actividad al alcance, con todo su contenido. `null` si no se alcanza. */
export async function actividadPorId(session: Session, id: string) {
  return prisma.activity.findFirst({
    where: { AND: [activityScope(session), { id }] },
    select: actividadSelect,
  });
}

export type CursorDeActividad = { startsAt: Date; id: string };

/**
 * Las actividades de una oportunidad, de la más reciente a la más antigua,
 * por páginas con cursor de (fecha, id). Trae una de más para saber si hay
 * otra página sin contar.
 */
export async function actividadesDeOportunidad(
  session: Session,
  opportunityId: string,
  pagina: { take: number; cursor: CursorDeActividad | null },
) {
  const despuesDelCursor: Prisma.ActivityWhereInput | null = pagina.cursor
    ? {
        OR: [
          { startsAt: { lt: pagina.cursor.startsAt } },
          { startsAt: pagina.cursor.startsAt, id: { lt: pagina.cursor.id } },
        ],
      }
    : null;
  return prisma.activity.findMany({
    where: { AND: [activityScope(session), { opportunityId }, ...(despuesDelCursor ? [despuesDelCursor] : [])] },
    select: actividadSelect,
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: pagina.take + 1,
  });
}

/** Cuántas actividades tiene una oportunidad al alcance. Para la ficha. */
export async function totalDeActividades(session: Session, opportunityId: string): Promise<number> {
  return prisma.activity.count({ where: { AND: [activityScope(session), { opportunityId }] } });
}

/**
 * Oportunidades para `buscar_oportunidades`: el `where` ya viene con el alcance
 * antepuesto por `toWhere` (lib/filters), y aquí se vuelve a anteponer: dos
 * veces no cuesta nada y una vez olvidada cuesta todo. Trae una de más para
 * saber si hay otra página.
 */
export async function buscarOportunidades(
  session: Session,
  where: Prisma.OpportunityWhereInput,
  pagina: { take: number; skip: number },
) {
  return prisma.opportunity.findMany({
    where: withScope(session, where),
    select: opportunityCardSelect(session),
    orderBy: [{ expectedCloseDate: "asc" }, { id: "asc" }],
    take: pagina.take + 1,
    skip: pagina.skip,
  });
}

/** Las etapas de los pipelines de los países de la sesión, para resolver «etapa» por nombre. */
export async function etapasPorNombre(session: Session, nombre: string) {
  return prisma.stage.findMany({
    where: {
      name: { equals: nombre, mode: "insensitive" },
      pipeline: { active: true, countryCode: { in: session.countryCodes } },
    },
    select: { id: true, name: true },
  });
}

/** Los nombres de etapa que existen en los pipelines de la sesión, para decirle al agente cuáles hay. */
export async function nombresDeEtapas(session: Session): Promise<string[]> {
  const etapas = await prisma.stage.findMany({
    where: { pipeline: { active: true, countryCode: { in: session.countryCodes } } },
    select: { name: true },
    distinct: ["name"],
    orderBy: { name: "asc" },
  });
  return etapas.map((e) => e.name);
}

/** Usuarios activos de los países de la sesión cuyo nombre o correo coincide con «responsable». */
export async function usuariosPorNombre(session: Session, texto: string) {
  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      countryCodes: { hasSome: session.countryCodes },
      OR: [{ name: { contains: texto, mode: "insensitive" } }, { email: { equals: texto, mode: "insensitive" } }],
    },
    select: { id: true, name: true },
    take: 10,
  });
}
