import type { Session } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, sum, type Money } from "@/lib/money";
import type { GateContext } from "@/lib/domain/stageGate";
import { opportunityScope } from "./opportunities";

/**
 * Todo lo que P-02 necesita, en una sola lectura.
 *
 * Una función y no seis porque el detalle es una pantalla, no seis: pedir las
 * piezas por separado multiplica los viajes a la base y abre la puerta a que
 * una de ellas se consulte sin alcance.
 *
 * Devuelve `null` si el usuario no alcanza la oportunidad. **No lanza «no
 * autorizado»**: distinguir «no existe» de «existe pero no es tuya» le
 * confirmaría a un vendedor que la oportunidad de su compañero existe. La
 * pantalla responde 404 en ambos casos.
 *
 * INV-02 · `grossProfit`, `totalCost` y `unitCost` solo se consultan con
 * `VER_COSTO`. No se ocultan después: no entran al `select`.
 */
export async function getOpportunityDetail(session: Session, id: string) {
  const verCosto = can(session, "VER_COSTO");
  const verMargen = can(session, "VER_MARGEN");

  const oportunidad = await prisma.opportunity.findFirst({
    where: { AND: [opportunityScope(session), { id }] },
    select: {
      id: true,
      folio: true,
      name: true,
      status: true,
      forecastCategory: true,
      businessType: true,
      currency: true,
      amount: true,
      estimatedAmount: true,
      ...(verMargen ? { grossMargin: true } : {}),
      meddicScore: true,
      expectedCloseDate: true,
      actualCloseDate: true,
      stageEnteredAt: true,
      lastActivityAt: true,
      nextActivityAt: true,
      createdAt: true,
      lossCompetitor: true,
      // El país es de la oportunidad, no de la cuenta: política, impuesto y
      // destinatarios de reasignación se leen de aquí (decisiones §18).
      countryCode: true,

      organization: {
        select: {
          id: true,
          name: true,
          type: true,
          industry: true,
          city: true,
          countryCode: true,
          isStrategic: true,
          people: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              initials: true,
              jobTitle: true,
              email: true,
              committeeRole: { select: { id: true, name: true } },
            },
            orderBy: { name: "asc" },
          },
        },
      },
      primaryPerson: {
        select: {
          id: true,
          name: true,
          initials: true,
          jobTitle: true,
          committeeRole: { select: { id: true, name: true } },
        },
      },
      pipeline: {
        select: {
          id: true,
          name: true,
          countryCode: true,
          stages: {
            select: {
              id: true,
              name: true,
              position: true,
              probability: true,
              staleAfterDays: true,
              gateRequires: true,
              gateMode: true,
              isClosing: true,
            },
            orderBy: { position: "asc" },
          },
        },
      },
      stage: {
        select: { id: true, name: true, position: true, probability: true, staleAfterDays: true },
      },
      owner: { select: { id: true, name: true, initials: true } },
      createdBy: { select: { id: true, name: true, initials: true } },
      source: { select: { id: true, name: true } },
      lossReason: { select: { id: true, name: true, requiresCompetitor: true } },

      meddic: {
        select: {
          component: true,
          status: true,
          evidence: true,
          person: { select: { id: true, name: true } },
        },
      },

      // Insumos de las compuertas. Se traen contados o mínimos: la pantalla no
      // necesita el detalle de la cotización en E1, solo saber si existe.
      // La cotización vigente: la de mayor versión, sin importar su estatus. Es
      // una sola y editable (decisiones §21); las versiones viejas de antes de
      // ese cambio quedan en la base como historia sin uso.
      quotes: {
        select: {
          id: true,
          version: true,
          netSubtotal: true,
          discountRate: true,
          ...(verMargen ? { grossMargin: true } : {}),
          ...(verCosto ? { grossProfit: true, totalCost: true } : {}),
          _count: { select: { lines: true } },
        },
        orderBy: { version: "desc" },
        take: 1,
      },
      milestones: {
        select: { id: true, position: true, description: true, dueDate: true, amount: true, status: true },
        orderBy: { position: "asc" },
      },
      documents: {
        select: {
          id: true,
          name: true,
          version: true,
          createdAt: true,
          // Para mostrar el peso en la lista; la ruta NO se serializa: la
          // descarga se pide por acción, que emite una URL firmada.
          sizeBytes: true,
          type: { select: { id: true, name: true, isContract: true } },
          uploadedBy: { select: { name: true, initials: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      approvals: {
        where: { status: "PENDIENTE" },
        select: { id: true, level: true, dueAt: true, discountRate: true },
      },
      stageHistory: {
        select: {
          id: true,
          atDate: true,
          gateOverride: true,
          fromStage: { select: { name: true } },
          toStage: { select: { name: true } },
          byUser: { select: { name: true, initials: true } },
        },
        orderBy: { atDate: "desc" },
        take: 20,
      },
    },
  });

  return oportunidad;
}

export type DetalleOportunidad = NonNullable<
  Awaited<ReturnType<typeof getOpportunityDetail>>
>;

/**
 * Traduce el detalle cargado al contexto que `evaluateGate` espera.
 *
 * Vive aquí y no en la pantalla porque es traducción de datos, no presentación:
 * si la pantalla armara el contexto, cada pantalla que evalúe una compuerta lo
 * armaría distinto y las dos discreparían en algún caso raro.
 */
export function contextoDeCompuerta(
  o: DetalleOportunidad,
  politica: { meddicMinToClosing: number },
): GateContext {
  const cotizacion = cotizacionConLineas(o);

  // RN-06 · la diferencia se mide contra el neto de la cotización. Sin líneas
  // no hay contra qué cuadrar, y eso es distinto de «cuadra en cero».
  const diferenciaHitos: Money | null = cotizacion
    ? cotizacion.netSubtotal.minus(sum(o.milestones.map((h) => h.amount)))
    : null;

  return {
    tienePersonaConRol: o.primaryPerson?.committeeRole != null,
    tienePropuestaCargada: o.documents.some((d) =>
      d.type.name.toLowerCase().includes("propuesta"),
    ),
    tieneContratoOrdenCompra: o.documents.some((d) => d.type.isContract),
    tieneCotizacion: cotizacion != null,
    cantidadHitos: o.milestones.length,
    diferenciaHitos,
    meddicScore: o.meddicScore ?? 0,
    meddicDecisorConfirmado: o.meddic.some(
      (m) => m.component === "DECISOR_ECONOMICO" && m.status === "CONFIRMADO",
    ),
    autorizacionesPendientes: o.approvals.length,
    meddicMinToClosing: politica.meddicMinToClosing,
  };
}

/**
 * La cotización, solo si tiene líneas. Una cotización vacía no dice nada del
 * importe: para las compuertas, los hitos y el neto vigente es como si no
 * existiera.
 */
export function cotizacionConLineas(o: DetalleOportunidad) {
  const q = o.quotes[0];
  return q && q._count.lines > 0 ? q : null;
}

/** El neto vigente: el de la cotización con líneas, o el importe estimado. */
export function netoVigente(o: DetalleOportunidad): Money {
  return cotizacionConLineas(o)?.netSubtotal ?? money(o.amount.toString());
}
