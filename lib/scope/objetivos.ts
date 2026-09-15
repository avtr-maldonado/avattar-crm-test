import { Prisma, type CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { rangoDeAnioFiscal, rangoDeTrimestre } from "@/lib/filters/dates";
import type { Money } from "@/lib/money";
import { withObjectiveScope } from "./objectives";
import { withScope } from "./opportunities";

/**
 * El tablero de objetivos · §10.2 y §10.3.
 *
 * ## Las tres fechas, que es donde se equivocan los reportes
 *
 *   - La **cuota** la fija el periodo del objetivo: no tiene fecha propia.
 *   - Lo **logrado** se mide con `actualCloseDate`. Es lo que ya pasó.
 *   - La **cobertura** se mide con `expectedCloseDate`. Es lo que podría pasar.
 *
 * §10.2 lo dice por nombre: mezclarlas produce coberturas absurdas al cierre
 * del trimestre. Por eso son tres consultas y no una con un `OR`.
 *
 * ## El total del equipo se suma de las filas visibles
 *
 * §10.3 es explícito: **nunca** una consulta aparte que ignore el alcance. Este
 * lector devuelve renglones ya acotados y la pantalla los suma; no existe una
 * función que devuelva «el total de la oficina» saltándose `objectiveScope`.
 *
 * ## La utilidad
 *
 * §10.2 la define como la suma de `grossProfit` de la cotización congelada. Se
 * lee aquí, en el servidor. Qué se serializa hacia la pantalla lo decide la
 * página según permiso; este módulo no adivina (INV-02,
 * `decisiones-pendientes.md` §17).
 */
const CERO = new Prisma.Decimal(0);

export type RenglonDeObjetivo = {
  usuario: { id: string; name: string; initials: string };
  /** Índice 0..3 = T1..T4. Cero donde no hay objetivo fijado. */
  cuotaVenta: Money[];
  cuotaUtilidad: Money[];
  logradoVenta: Money[];
  logradoUtilidad: Money[];
  /** Pipeline abierto que cierra en cada trimestre, por `expectedCloseDate`. */
  pipelineVenta: Money[];
  /** La fila ANUAL, si existe. §10.1: puede coexistir con las trimestrales. */
  cuotaAnualVenta: Money | null;
  cuotaAnualUtilidad: Money | null;
  /** Tiene cuota fijada en algún periodo. Un vendedor sin cuota igual aparece. */
  tieneCuota: boolean;
};

function cuatroCeros(): Money[] {
  return [CERO, CERO, CERO, CERO];
}

export async function avanceDeObjetivos(
  session: Session,
  opciones: {
    fiscalYear: number;
    pais: CountryCode;
    fiscalYearStartMonth: number;
  },
): Promise<RenglonDeObjetivo[]> {
  const { fiscalYear, pais, fiscalYearStartMonth } = opciones;
  const anio = rangoDeAnioFiscal(fiscalYear, fiscalYearStartMonth);
  const trimestres = [1, 2, 3, 4].map((q) =>
    rangoDeTrimestre(fiscalYear, q, fiscalYearStartMonth),
  );

  const [objetivos, ganadas, abiertas] = await Promise.all([
    prisma.objective.findMany({
      where: withObjectiveScope(session, { fiscalYear, countryCode: pais }),
      select: {
        periodType: true,
        quarter: true,
        revenueQuota: true,
        grossProfitQuota: true,
        user: { select: { id: true, name: true, initials: true } },
      },
    }),

    // Lo logrado: `actualCloseDate` dentro del año fiscal (§10.2). La utilidad
    // sale de la cotización congelada de mayor versión, que es la que se firmó.
    prisma.opportunity.findMany({
      where: withScope(session, {
        status: "GANADA",
        countryCode: pais,
        actualCloseDate: { gte: anio.from, lte: anio.to },
      }),
      select: {
        amount: true,
        actualCloseDate: true,
        owner: { select: { id: true, name: true, initials: true } },
        quotes: {
          where: { frozenAt: { not: null } },
          select: { grossProfit: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    }),

    // La cobertura: `expectedCloseDate`, y solo lo que sigue abierto.
    prisma.opportunity.findMany({
      where: withScope(session, {
        status: "ABIERTA",
        countryCode: pais,
        expectedCloseDate: { gte: anio.from, lte: anio.to },
      }),
      select: {
        amount: true,
        expectedCloseDate: true,
        owner: { select: { id: true, name: true, initials: true } },
      },
    }),
  ]);

  const renglones = new Map<string, RenglonDeObjetivo>();

  function renglonDe(usuario: { id: string; name: string; initials: string }) {
    let r = renglones.get(usuario.id);
    if (!r) {
      r = {
        usuario,
        cuotaVenta: cuatroCeros(),
        cuotaUtilidad: cuatroCeros(),
        logradoVenta: cuatroCeros(),
        logradoUtilidad: cuatroCeros(),
        pipelineVenta: cuatroCeros(),
        cuotaAnualVenta: null,
        cuotaAnualUtilidad: null,
        tieneCuota: false,
      };
      renglones.set(usuario.id, r);
    }
    return r;
  }

  for (const o of objetivos) {
    const r = renglonDe(o.user);
    r.tieneCuota = true;
    if (o.periodType === "ANUAL") {
      r.cuotaAnualVenta = o.revenueQuota;
      r.cuotaAnualUtilidad = o.grossProfitQuota;
    } else if (o.quarter) {
      r.cuotaVenta[o.quarter - 1] = o.revenueQuota;
      r.cuotaUtilidad[o.quarter - 1] = o.grossProfitQuota;
    }
  }

  for (const o of ganadas) {
    // `status: GANADA` sin `actualCloseDate` sería un dato roto; el rango de la
    // consulta ya lo excluye, pero el índice se calcula sobre la fecha y no
    // sobre una suposición.
    if (!o.actualCloseDate) continue;
    const i = indiceDeTrimestre(o.actualCloseDate, trimestres);
    if (i === null) continue;
    const r = renglonDe(o.owner);
    r.logradoVenta[i] = r.logradoVenta[i]!.plus(o.amount);
    const utilidad = o.quotes[0]?.grossProfit;
    if (utilidad) r.logradoUtilidad[i] = r.logradoUtilidad[i]!.plus(utilidad);
  }

  for (const o of abiertas) {
    const i = indiceDeTrimestre(o.expectedCloseDate, trimestres);
    if (i === null) continue;
    const r = renglonDe(o.owner);
    r.pipelineVenta[i] = r.pipelineVenta[i]!.plus(o.amount);
  }

  // Por cuota descendente: la conversación empieza por quien más carga lleva.
  return [...renglones.values()].sort((a, b) => {
    const totalA = a.cuotaAnualVenta ?? sumaDe(a.cuotaVenta);
    const totalB = b.cuotaAnualVenta ?? sumaDe(b.cuotaVenta);
    return totalB.comparedTo(totalA) || a.usuario.name.localeCompare(b.usuario.name, "es");
  });
}

function sumaDe(valores: Money[]): Money {
  return valores.reduce((acc, v) => acc.plus(v), CERO);
}

function indiceDeTrimestre(
  fecha: Date,
  trimestres: readonly { from: Date; to: Date }[],
): number | null {
  for (let i = 0; i < trimestres.length; i++) {
    const t = trimestres[i]!;
    if (fecha >= t.from && fecha <= t.to) return i;
  }
  return null;
}

/**
 * Los años fiscales que tienen algún objetivo fijado, para el selector.
 *
 * Ofrecer un año sin objetivos lleva a una pantalla vacía sin explicación; esta
 * lista hace que el control solo proponga años que existen. Siempre incluye el
 * año en curso, porque fijar la cuota del año que empieza es justo el caso en
 * que todavía no hay ninguna.
 */
export async function aniosConObjetivos(
  session: Session,
  pais: CountryCode,
  anioEnCurso: number,
): Promise<number[]> {
  const filas = await prisma.objective.findMany({
    where: withObjectiveScope(session, { countryCode: pais }),
    select: { fiscalYear: true },
    distinct: ["fiscalYear"],
  });

  const anios = new Set(filas.map((f) => f.fiscalYear));
  anios.add(anioEnCurso);
  return [...anios].sort((a, b) => b - a);
}
