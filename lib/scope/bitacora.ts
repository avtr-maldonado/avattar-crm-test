import type { Session } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { construirBitacora, type EventoDeBitacora } from "@/lib/domain/bitacora";
import { listActivities } from "./activities";
import type { DetalleOportunidad } from "./opportunityDetail";

/**
 * La bitácora de una oportunidad · P-02, pestaña Bitácora.
 *
 * Recibe el detalle ya cargado por `getOpportunityDetail`: ese es el alcance
 * (INV-01). Si la sesión llegó al detalle, llega a su historia. Las actividades
 * pasan por su propio lector, con su propio alcance, porque una actividad de
 * otra persona sobre esta oportunidad sí es parte de la historia.
 *
 * INV-02: la auditoría de la cotización puede traer cambios de costo. Se pasa
 * `verCosto` al constructor, que los nombra sin cifras cuando no hay permiso.
 */
export async function bitacoraDeOportunidad(
  session: Session,
  detalle: DetalleOportunidad,
): Promise<EventoDeBitacora[]> {
  // Las dos consultas que no dependen entre sí, a la vez; la auditoría
  // necesita los ids de las cotizaciones y va después.
  const [cotizaciones, actividades] = await Promise.all([
    prisma.quote.findMany({ where: { opportunityId: detalle.id }, select: { id: true } }),
    listActivities(session, { where: { opportunityId: detalle.id, completedAt: { not: null } } }),
  ]);

  const auditoria = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: "Opportunity", entityId: detalle.id },
        { entity: "Quote", entityId: { in: cotizaciones.map((c) => c.id) } },
      ],
    },
    select: {
      id: true,
      at: true,
      action: true,
      before: true,
      after: true,
      byUser: { select: { name: true } },
    },
    orderBy: { at: "desc" },
    take: 200,
  });

  return construirBitacora({
    oportunidad: { createdAt: detalle.createdAt, createdBy: detalle.createdBy },
    transiciones: detalle.stageHistory,
    auditoria,
    actividades,
    verCosto: can(session, "VER_COSTO"),
  });
}
