import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import { opportunityScope } from "./opportunities";
import { organizationScope, withOrganizationScope } from "./organizations";

/**
 * Indicadores de cuenta · §5.3.
 *
 * ## La regla que este módulo existe para hacer cumplir
 *
 * «Los indicadores de la ficha —pipeline abierto, ganado 12 meses— se calculan
 * **solo sobre las oportunidades que ese usuario puede ver**, no sobre el total
 * de la cuenta. Si no fuera así, un vendedor deduciría el pipeline de su
 * compañero restando.»
 *
 * Es la fuga más sutil del sistema: la lista de cuentas puede estar
 * perfectamente acotada y aun así filtrar información, porque un total agregado
 * es un canal. Por eso **cada agregado pasa por `opportunityScope`**, igual que
 * una lectura de filas.
 *
 * ## Por qué agrupado y no por cuenta
 *
 * Cuatro consultas agrupadas en vez de cuatro por cada organización. Con 14
 * cuentas la diferencia es de 56 viajes a 4, y medido contra `us-east-1` cada
 * viaje cuesta ~287 ms (`docs/latencia.md`).
 */
export type IndicadoresDeCuenta = {
  /** Suma de las abiertas que este usuario ve. */
  pipelineAbierto: Money;
  abiertas: number;
  /** Suma de las ganadas en los últimos 12 meses que este usuario ve. */
  ganado12Meses: Money;
  ultimaActividad: Date | null;
};

const CERO = money("0");

export type OrganizacionConIndicadores = Awaited<
  ReturnType<typeof listOrganizationsConIndicadores>
>["organizaciones"][number];

export async function listOrganizationsConIndicadores(
  session: Session,
  options: { where?: Prisma.OrganizationWhereInput; take?: number } = {},
) {
  const hace12Meses = new Date();
  hace12Meses.setUTCFullYear(hace12Meses.getUTCFullYear() - 1);

  const alcanceOportunidades = opportunityScope(session);

  const [organizaciones, abiertas, ganadas, actividades, hayHistorico] =
    await Promise.all([
      prisma.organization.findMany({
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
      }),

      // Pipeline abierto, acotado.
      prisma.opportunity.groupBy({
        by: ["organizationId"],
        where: { AND: [alcanceOportunidades, { status: "ABIERTA" }] },
        _sum: { amount: true },
        _count: true,
      }),

      // Ganado en 12 meses, acotado. §10.2 · con `actualCloseDate`, que es la
      // fecha del avance; `expectedCloseDate` sería la del pronóstico.
      prisma.opportunity.groupBy({
        by: ["organizationId"],
        where: {
          AND: [
            alcanceOportunidades,
            { status: "GANADA", actualCloseDate: { gte: hace12Meses } },
          ],
        },
        _sum: { amount: true },
      }),

      // Última actividad de la cuenta, también acotada: una fecha reciente
      // delata que alguien más está trabajando ahí.
      prisma.activity.groupBy({
        by: ["organizationId"],
        where: {
          deletedAt: null,
          organizationId: { not: null },
          opportunity: { is: alcanceOportunidades },
        },
        _max: { startsAt: true },
      }),

      // C-02 · el sistema arrancó en limpio. Si no hay NINGUNA oportunidad
      // cerrada, la columna «ganado 12 meses» no vale cero: no tiene dato. Ver
      // `hayHistoricoDeCierres` abajo.
      prisma.opportunity.count({ where: { status: { in: ["GANADA", "PERDIDA"] } } }),
    ]);

  const porAbiertas = new Map(abiertas.map((a) => [a.organizationId, a]));
  const porGanadas = new Map(ganadas.map((g) => [g.organizationId, g]));
  const porActividad = new Map(
    actividades
      .filter((a) => a.organizationId !== null)
      .map((a) => [a.organizationId as string, a._max.startsAt]),
  );

  return {
    organizaciones: organizaciones.map((o) => ({
      ...o,
      indicadores: {
        pipelineAbierto: porAbiertas.get(o.id)?._sum.amount ?? CERO,
        abiertas: porAbiertas.get(o.id)?._count ?? 0,
        ganado12Meses: porGanadas.get(o.id)?._sum.amount ?? CERO,
        ultimaActividad: porActividad.get(o.id) ?? null,
      } satisfies IndicadoresDeCuenta,
    })),
    /**
     * Si es `false`, «ganado 12 meses» debe mostrarse como «sin histórico», no
     * como cero. Un cero afirma que la cuenta no compró; la verdad es que no
     * hay historia contra la cual medirlo (C-02).
     */
    hayHistoricoDeCierres: hayHistorico > 0,
  };
}

/** Los mismos indicadores para una sola cuenta, en la ficha (P-04). */
export async function indicadoresDeCuenta(
  session: Session,
  organizationId: string,
): Promise<IndicadoresDeCuenta> {
  const { organizaciones } = await listOrganizationsConIndicadores(session, {
    where: { id: organizationId },
    take: 1,
  });
  return (
    organizaciones[0]?.indicadores ?? {
      pipelineAbierto: CERO,
      abiertas: 0,
      ganado12Meses: CERO,
      ultimaActividad: null,
    }
  );
}

/**
 * Las oportunidades de una cuenta que este usuario ve.
 *
 * Para la ficha (P-04). Pasa por `opportunityScope`: un vendedor abre la cuenta
 * de un cliente compartido y ve las suyas, no las de su compañero.
 */
export async function oportunidadesDeCuenta(session: Session, organizationId: string) {
  return prisma.opportunity.findMany({
    where: { AND: [opportunityScope(session), { organizationId }] },
    select: {
      id: true,
      folio: true,
      name: true,
      status: true,
      amount: true,
      expectedCloseDate: true,
      actualCloseDate: true,
      stage: { select: { id: true, name: true, probability: true } },
      owner: { select: { id: true, name: true, initials: true } },
    },
    orderBy: [{ status: "asc" }, { expectedCloseDate: "asc" }],
  });
}

/** Una cuenta por id, o `null` si el usuario no la alcanza. */
export async function getOrganizationDetail(session: Session, id: string) {
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
      createdAt: true,
      owner: { select: { id: true, name: true, initials: true } },
      parent: { select: { id: true, name: true } },
      children: {
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
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
