import type { MeddicComponent, MeddicStatus } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";
import { computeMeddicScore, validarComponente, type MeddicWeights } from "./meddic";

/**
 * Guardar un componente MEDDIC · §7 y `AC-16`.
 *
 * Las reglas ya viven en `meddic.ts`, que es puro y está probado: evidencia
 * obligatoria en `PARCIAL` y `CONFIRMADO` (`RN-30`), y persona real del comité
 * para confirmar decisor económico o campeón (§2.1). Aquí solo está lo que toca
 * la base.
 *
 * ## El puntaje se recalcula en la misma transacción
 *
 * `AC-16` lo exige y el esquema lo subraya: «se recalcula en la misma
 * transacción en que cambia un componente. **Nunca se edita a mano**». Si el
 * número desnormalizado y el calculado divergen, la tarjeta del kanban miente,
 * y con ella el filtro por puntaje y el gate de «Compromiso».
 */
export async function guardarComponenteMeddic(
  session: Session,
  detalle: DetalleOportunidad,
  entrada: {
    component: MeddicComponent;
    status: MeddicStatus;
    evidence?: string | null;
    personId?: string | null;
  },
  pesos: MeddicWeights,
): Promise<ResultadoAccion<{ puntaje: number }>> {
  if (detalle.status !== "ABIERTA") {
    return falla("AUTORIZACION", "Una oportunidad cerrada ya no se califica.");
  }

  const evidence = entrada.evidence?.trim() || null;
  const personId = entrada.personId || null;

  const valido = validarComponente({
    component: entrada.component,
    status: entrada.status,
    evidence,
    personId,
  });
  if (!valido.ok) {
    return falla("VALIDACION", { campo: "status", mensaje: valido.motivo });
  }

  // La persona tiene que ser del comité de esta cuenta, no de cualquier otra:
  // «apunta a una persona real del comité de compra, no a texto libre».
  if (personId && !detalle.organization.people.some((p) => p.id === personId)) {
    return falla("VALIDACION", {
      campo: "personId",
      mensaje: "Esa persona no está en el comité de compra de esta cuenta.",
    });
  }

  const puntaje = await prisma.$transaction(async (tx) => {
    await tx.meddicComponentAssessment.upsert({
      where: {
        opportunityId_component: { opportunityId: detalle.id, component: entrada.component },
      },
      update: { status: entrada.status, evidence, personId, updatedById: session.userId },
      create: {
        opportunityId: detalle.id,
        component: entrada.component,
        status: entrada.status,
        evidence,
        personId,
        updatedById: session.userId,
      },
    });

    const todos = await tx.meddicComponentAssessment.findMany({
      where: { opportunityId: detalle.id },
      select: { component: true, status: true },
    });
    const nuevo = computeMeddicScore(todos, pesos);

    await tx.opportunity.update({ where: { id: detalle.id }, data: { meddicScore: nuevo } });
    return nuevo;
  });

  return ok({ puntaje });
}
