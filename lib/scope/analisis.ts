import type { BusinessType, CountryCode, Prisma } from "@prisma/client";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import { calcularLinea } from "@/lib/domain/quote";
import type { ActividadHecha, OportunidadAbierta, VentaGanada } from "@/lib/domain/analisis";
import { rangoDeAnioFiscal } from "@/lib/filters/dates";
import { withScope } from "./opportunities";
import { actividadEnOficina, withActivityScope } from "./activities";
import { avanceDeObjetivos, type RenglonDeObjetivo } from "./objetivos";

/**
 * Lo que leen los reportes de P-09 · Análisis.
 *
 * Todo pasa por el alcance del rol (`withScope`, `withActivityScope`,
 * `avanceDeObjetivos`): un gerente ve su país, Dirección todo; un vendedor no
 * llega aquí (403 en la ruta). Los filtros de la URL recortan **después** del
 * alcance, con AND, así que no pueden ampliarlo (AC-25).
 *
 * INV-02 · costo y utilidad solo se seleccionan con `VER_COSTO`. Sin él, las
 * cotizaciones viajan con neto y líneas sin costo, y el dominio devuelve
 * utilidad nula: la pantalla no la pinta, pero sobre todo no la manda.
 *
 * La evidencia MEDDIC no se serializa: solo si existe (`conEvidencia`).
 */

export type RecorteDeAnalisis = {
  pais: CountryCode | null;
  vendedor: string | null;
  producto: string | null;
  tipo: BusinessType | null;
};

function recorte(r: RecorteDeAnalisis): Prisma.OpportunityWhereInput {
  return {
    ...(r.pais ? { countryCode: r.pais } : {}),
    ...(r.vendedor ? { ownerId: r.vendedor } : {}),
    ...(r.tipo ? { businessType: r.tipo } : {}),
    // Por producto: cualquier cotización de la oportunidad con una línea de ese SKU.
    ...(r.producto ? { quotes: { some: { lines: { some: { productId: r.producto } } } } } : {}),
  };
}

/**
 * Las ganadas del alcance, con su cotización vigente. Sin `anio`, toda la
 * historia: el histórico de venta (reporte 2) compara años entre sí y no se
 * puede recortar al año elegido. Con `anio`, las de ese año fiscal por
 * `actualCloseDate` (§10.2): es la fecha que mide el avance de cuota.
 */
export async function ganadas(
  session: Session,
  r: RecorteDeAnalisis,
  anio: { fiscalYear: number; fiscalYearStartMonth: number } | null,
): Promise<VentaGanada[]> {
  const verCosto = can(session, "VER_COSTO");
  const rango = anio ? rangoDeAnioFiscal(anio.fiscalYear, anio.fiscalYearStartMonth) : null;

  const filas = await prisma.opportunity.findMany({
    where: withScope(session, {
      ...recorte(r),
      status: "GANADA",
      ...(rango ? { actualCloseDate: { gte: rango.from, lte: rango.to } } : {}),
    }),
    select: {
      id: true,
      amount: true,
      actualCloseDate: true,
      createdAt: true,
      businessType: true,
      organization: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      // La cotización vigente es la de mayor versión (§21: ya no hay congeladas).
      quotes: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          netSubtotal: true,
          ...(verCosto ? { totalCost: true, grossProfit: true } : {}),
          lines: {
            select: {
              productId: true,
              description: true,
              quantity: true,
              unitPrice: true,
              discountRate: true,
              ...(verCosto ? { unitCost: true } : {}),
            },
          },
        },
      },
    },
    orderBy: { actualCloseDate: "asc" },
  });

  return filas.flatMap((o) => {
    // Una GANADA sin cierre real es un dato roto: no se inventa una fecha.
    if (!o.actualCloseDate) return [];
    const q = o.quotes[0];
    const cotizacion =
      q && q.lines.length > 0
        ? {
            netSubtotal: q.netSubtotal,
            ...("totalCost" in q ? { totalCost: q.totalCost, grossProfit: q.grossProfit } : {}),
            lineas: q.lines.map((l) => {
              const calculo = calcularLinea({
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountRate: l.discountRate,
                // Sin VER_COSTO el costo no viene; el importe no lo necesita.
                unitCost: "unitCost" in l ? l.unitCost : money(0),
              });
              return {
                productId: l.productId,
                descripcion: l.description,
                importe: calculo.importe,
                ...("unitCost" in l ? { costo: l.unitCost.times(l.quantity) } : {}),
              };
            }),
          }
        : null;

    return [
      {
        id: o.id,
        amount: o.amount,
        actualCloseDate: o.actualCloseDate,
        createdAt: o.createdAt,
        businessType: o.businessType,
        organization: o.organization,
        owner: o.owner,
        cotizacion,
      },
    ];
  });
}

/** Las abiertas del alcance, con su etapa y sus calificaciones MEDDIC (sin el texto de la evidencia). */
export async function abiertasDelAnalisis(
  session: Session,
  r: RecorteDeAnalisis,
): Promise<OportunidadAbierta[]> {
  const filas = await prisma.opportunity.findMany({
    where: withScope(session, { ...recorte(r), status: "ABIERTA" }),
    select: {
      id: true,
      folio: true,
      name: true,
      amount: true,
      expectedCloseDate: true,
      createdAt: true,
      stageEnteredAt: true,
      lastActivityAt: true,
      nextActivityAt: true,
      forecastCategory: true,
      meddicScore: true,
      businessType: true,
      organization: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      stage: {
        select: { name: true, position: true, probability: true, staleAfterDays: true, isClosing: true },
      },
      meddic: { select: { component: true, status: true, evidence: true } },
    },
    orderBy: { amount: "desc" },
  });

  return filas.map((o) => ({
    ...o,
    meddic: o.meddic.map((m) => ({
      component: m.component,
      status: m.status,
      conEvidencia: Boolean(m.evidence?.trim()),
    })),
  }));
}

/** Las actividades hechas en el año fiscal, dentro del alcance y, si se pide, de una oficina o un vendedor. */
export async function actividadesHechasDelAnio(
  session: Session,
  r: { pais: CountryCode | null; vendedor: string | null },
  anio: { fiscalYear: number; fiscalYearStartMonth: number },
): Promise<ActividadHecha[]> {
  const rango = rangoDeAnioFiscal(anio.fiscalYear, anio.fiscalYearStartMonth);
  const filas = await prisma.activity.findMany({
    where: withActivityScope(session, {
      AND: [
        { completedAt: { gte: rango.from, lte: rango.to } },
        ...(r.pais ? [actividadEnOficina(r.pais)] : []),
        ...(r.vendedor ? [{ userId: r.vendedor }] : []),
      ],
    }),
    select: {
      completedAt: true,
      type: { select: { name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return filas.flatMap((a) =>
    a.completedAt ? [{ completedAt: a.completedAt, tipo: a.type.name, usuario: a.user }] : [],
  );
}

/**
 * Los renglones de objetivos del año, de uno o varios países. `avanceDeObjetivos`
 * trabaja por país; Dirección los pide todos y aquí se juntan.
 */
export async function objetivosDelAnalisis(
  session: Session,
  opciones: {
    fiscalYear: number;
    paises: CountryCode[];
    fiscalYearStartMonth: number;
    vendedor: string | null;
  },
): Promise<RenglonDeObjetivo[]> {
  const porPais = await Promise.all(
    opciones.paises.map((pais) =>
      avanceDeObjetivos(session, {
        fiscalYear: opciones.fiscalYear,
        pais,
        fiscalYearStartMonth: opciones.fiscalYearStartMonth,
      }),
    ),
  );
  const filas = porPais.flat();
  return opciones.vendedor ? filas.filter((f) => f.usuario.id === opciones.vendedor) : filas;
}
