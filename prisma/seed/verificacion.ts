import type { CountryCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeRiskFlags, type RiskFlag } from "@/lib/domain/riskFlags";
import { openTotal, weightedTotal } from "@/lib/domain/pipeline";
import { getCommercialPolicy } from "@/lib/policy";
import { money, sum, type Money } from "@/lib/money";
import { OPORTUNIDADES } from "./datos";

/**
 * Los folios que el seed siembra.
 *
 * **Estas verificaciones se acotan al escenario sembrado, no a toda la base.**
 * La igualdad exacta con §15 valía mientras la aplicación era de solo lectura;
 * dejó de valer el día que se puede dar de alta una oportunidad. Contar todo lo
 * que hay en México convertiría estas pruebas en «nadie ha usado el sistema»,
 * que no es lo que prometen: prometen que **el seed reprodujo el escenario que
 * Dirección aprobó**, y eso sigue siendo cierto aunque encima haya trabajo real.
 */
const FOLIOS_SEMBRADOS = OPORTUNIDADES.map((o) => o.folio);

/**
 * Los agregados que el seed promete.
 *
 * No son código de siembra: son las agregaciones que E1 va a reutilizar en los
 * indicadores de encabezado de P-01. Se escriben aquí porque el seed las
 * verifica, y verificar contra la implementación real es lo único que garantiza
 * que la pantalla mostrará lo mismo que el prototipo aprobado.
 */

export type ResumenPipeline = {
  valorAbierto: Money;
  ponderado: Money;
  cantidad: number;
};

/** Valor abierto y ponderado de las oportunidades abiertas de un país. */
export async function resumenDePipeline(pais: CountryCode): Promise<ResumenPipeline> {
  const abiertas = await prisma.opportunity.findMany({
    where: {
      status: "ABIERTA",
      deletedAt: null,
      countryCode: pais,
      folio: { in: FOLIOS_SEMBRADOS },
    },
    select: { amount: true, stage: { select: { probability: true } } },
  });

  return {
    valorAbierto: openTotal(abiertas),
    ponderado: weightedTotal(abiertas),
    cantidad: abiertas.length,
  };
}

export type ResumenRiesgo = {
  banderas: number;
  oportunidades: number;
  monto: Money;
  detalle: { folio: string; banderas: RiskFlag[] }[];
};

/**
 * Las banderas de riesgo, **calculadas** (INV-11).
 *
 * Aquí es donde el seed se separa de la cifra que el prototipo declaraba: con
 * `marginFloor = 0.20`, tres oportunidades caen bajo el piso, no una. El
 * prototipo marcaba solo OPP-2026-00388 (9 %) y pasaba por alto OPP-2026-00341
 * (11 %) y OPP-2026-00304 (19 %).
 */
export async function resumenDeRiesgo(
  pais: CountryCode,
  ahora = new Date("2026-09-01T12:00:00Z"),
): Promise<ResumenRiesgo> {
  const politica = await getCommercialPolicy(pais);

  const abiertas = await prisma.opportunity.findMany({
    where: {
      status: "ABIERTA",
      deletedAt: null,
      countryCode: pais,
      folio: { in: FOLIOS_SEMBRADOS },
    },
    select: {
      folio: true,
      amount: true,
      grossMargin: true,
      stageEnteredAt: true,
      nextActivityAt: true,
      stage: { select: { staleAfterDays: true } },
    },
    orderBy: { folio: "asc" },
  });

  let banderas = 0;
  const enRiesgo: Money[] = [];
  const detalle: ResumenRiesgo["detalle"] = [];

  for (const o of abiertas) {
    const flags = computeRiskFlags(o, o.stage, politica, ahora);
    if (flags.length === 0) continue;
    banderas += flags.length;
    enRiesgo.push(o.amount);
    detalle.push({ folio: o.folio, banderas: flags });
  }

  return { banderas, oportunidades: enRiesgo.length, monto: sum(enRiesgo), detalle };
}

/**
 * Cobertura de pipeline · RN-25, §10.2.
 *
 * Cobertura = pipeline abierto que cierra en el periodo ÷ brecha de cuota.
 *
 * El detalle que suele estar mal y que aquí es explícito: **el avance se mide
 * con `actualCloseDate`, la cobertura con `expectedCloseDate`.** Mezclarlas
 * produce coberturas absurdas al final del trimestre.
 */
export async function coberturaEquipo(
  pais: CountryCode,
  fiscalYear: number,
  quarter: number,
): Promise<number> {
  const desde = new Date(Date.UTC(fiscalYear, (quarter - 1) * 3, 1));
  const hasta = new Date(Date.UTC(fiscalYear, quarter * 3, 0));

  const [abiertas, ganadas, cuotas] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        status: "ABIERTA",
        deletedAt: null,
        countryCode: pais,
        expectedCloseDate: { gte: desde, lte: hasta },
      },
      select: { amount: true },
    }),
    prisma.opportunity.findMany({
      where: {
        status: "GANADA",
        deletedAt: null,
        countryCode: pais,
        actualCloseDate: { gte: desde, lte: hasta },
      },
      select: { amount: true },
    }),
    prisma.objective.findMany({
      where: { countryCode: pais, fiscalYear, periodType: "TRIMESTRAL", quarter },
      select: { revenueQuota: true },
    }),
  ]);

  const cuota = sum(cuotas.map((c) => c.revenueQuota));
  const alcanzado = sum(ganadas.map((g) => g.amount));
  const brecha = cuota.minus(alcanzado);

  // Cuota cubierta: la cobertura deja de ser una pregunta interesante.
  if (brecha.lte(0)) return Number.POSITIVE_INFINITY;

  return sum(abiertas.map((o) => o.amount)).div(brecha).toNumber();
}

/** Cobertura de un vendedor. §10.3: el gerente ve quién está por debajo. */
export async function coberturaPorVendedor(
  pais: CountryCode,
  fiscalYear: number,
  quarter: number,
): Promise<{ userId: string; nombre: string; cuota: Money; cobertura: number }[]> {
  const desde = new Date(Date.UTC(fiscalYear, (quarter - 1) * 3, 1));
  const hasta = new Date(Date.UTC(fiscalYear, quarter * 3, 0));

  const cuotas = await prisma.objective.findMany({
    where: { countryCode: pais, fiscalYear, periodType: "TRIMESTRAL", quarter },
    select: { userId: true, revenueQuota: true, user: { select: { name: true } } },
  });

  const salida = [];
  for (const c of cuotas) {
    const abiertas = await prisma.opportunity.findMany({
      where: {
        status: "ABIERTA",
        deletedAt: null,
        countryCode: pais,
        ownerId: c.userId,
        expectedCloseDate: { gte: desde, lte: hasta },
      },
      select: { amount: true },
    });
    const pipeline = sum(abiertas.map((o) => o.amount));
    salida.push({
      userId: c.userId,
      nombre: c.user.name,
      cuota: c.revenueQuota,
      cobertura: c.revenueQuota.isZero()
        ? Number.POSITIVE_INFINITY
        : pipeline.div(c.revenueQuota).toNumber(),
    });
  }
  return salida;
}

/** Cero tipado, para cuando una lista viene vacía. */
export const CERO = money("0");
