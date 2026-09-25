import type { MeddicComponent, MeddicStatus } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { iniciales } from "@/lib/etiquetas";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";
import { computeMeddicScore, validarComponente, type MeddicWeights } from "./meddic";

/**
 * Guardar un componente MEDDIC · §7 y `AC-16`.
 *
 * Las reglas ya viven en `meddic.ts`, que es puro y está probado: persona real
 * del comité para confirmar decisor económico o campeón (§2.1); la evidencia se
 * señala, no se exige (`RN-30` enmendada, decisiones §24). Aquí solo está lo
 * que toca la base.
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
    /** §27 · si la persona del comité no existe, se crea aquí, en la cuenta de la oportunidad. */
    nuevaPersona?: { name: string; jobTitle?: string | null; committeeRoleId?: string | null };
  },
  pesos: MeddicWeights,
): Promise<ResultadoAccion<{ puntaje: number }>> {
  if (detalle.status !== "ABIERTA") {
    return falla("AUTORIZACION", "Una oportunidad cerrada ya no se califica.");
  }

  const evidence = entrada.evidence?.trim() || null;
  let personId = entrada.personId || null;
  const nuevaPersona = entrada.nuevaPersona;
  if (nuevaPersona && nuevaPersona.name.trim().length < 3) {
    return falla("VALIDACION", { campo: "personaNombre", mensaje: "Ponle nombre a la persona." });
  }

  const valido = validarComponente({
    component: entrada.component,
    status: entrada.status,
    evidence,
    // La persona nueva cuenta como ligada: nace en la misma transacción.
    personId: personId ?? (nuevaPersona ? "nueva" : null),
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
    if (nuevaPersona && !personId) {
      // Igual que en el alta de oportunidad: la persona es de la cuenta, con
      // su rol en el comité si se declaró (§2.1).
      const creada = await tx.person.create({
        data: {
          organizationId: detalle.organization.id,
          name: nuevaPersona.name.trim(),
          initials: iniciales(nuevaPersona.name.trim()),
          jobTitle: nuevaPersona.jobTitle?.trim() || null,
          committeeRoleId: nuevaPersona.committeeRoleId || null,
        },
        select: { id: true },
      });
      personId = creada.id;
    }

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
