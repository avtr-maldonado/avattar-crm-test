import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";

export type SiguientePaso = {
  typeId: string;
  subject: string;
  startsAt: Date;
};

export type RegistroDeActividad = {
  typeId: string;
  subject: string;
  outcome?: string;
  notes?: string;
  /** Cuándo ocurrió. Por omisión, ahora. */
  ocurrioEn?: Date;
  siguiente?: SiguientePaso;
  /** §12.4 · la confirmación explícita de cerrar sin seguimiento. */
  sinSeguimiento?: boolean;
};

/**
 * Registra una actividad hecha y, en el mismo movimiento, su siguiente paso.
 *
 * ## El DEBE de §12.4 vive aquí, no en el navegador
 *
 * «Una actividad que se completa sin agendar la siguiente **DEBE** preguntar de
 * forma explícita si se cierra sin seguimiento.»
 *
 * Si no viene `siguiente` ni `sinSeguimiento`, esta función **no escribe nada**
 * y devuelve `CONFIRMACION`. Ponerlo en un `confirm()` del navegador lo dejaría
 * a merced de la consola; ponerlo aquí lo hace la regla, y de paso se puede
 * probar sin navegador.
 *
 * La pregunta solo aplica a una oportunidad **abierta**: en una cerrada, no
 * tener siguiente paso no es un olvido, es lo normal.
 *
 * ## `nextActivityAt` se recalcula, no se sobrescribe
 *
 * Es el más próximo de los pendientes, no el que se acaba de agendar. Si ya
 * había algo para la semana que entra y hoy se agenda algo para dentro de un
 * mes, el recordatorio tiene que seguir siendo el de la semana que entra. Y
 * «sin seguimiento» habla de **esta** actividad, no de la agenda entera: no
 * puede borrar un pendiente que ya existía.
 *
 * No lleva `AuditLog`: registrar una actividad no está entre las seis acciones
 * de INV-09, y no debería. La actividad **es** su propio registro.
 */
export async function registrarActividad(
  session: Session,
  detalle: DetalleOportunidad,
  input: RegistroDeActividad,
): Promise<ResultadoAccion<{ siguienteEn: Date | null }>> {
  const subject = input.subject.trim();
  if (subject.length < 3) {
    return falla("VALIDACION", {
      campo: "subject",
      mensaje: "Escribe de qué se trató la actividad.",
    });
  }

  if (input.siguiente) {
    const siguienteAsunto = input.siguiente.subject.trim();
    if (siguienteAsunto.length < 3) {
      return falla("VALIDACION", {
        campo: "siguiente.subject",
        mensaje: "Escribe cuál es el siguiente paso.",
      });
    }
  }

  const abierta = detalle.status === "ABIERTA";
  if (abierta && !input.siguiente && !input.sinSeguimiento) {
    return falla(
      "CONFIRMACION",
      "Sin siguiente paso, esta oportunidad aparecerá mañana en «sin próximo paso». ¿La cierras sin seguimiento?",
    );
  }

  const ocurrioEn = input.ocurrioEn ?? new Date();

  const siguienteEn = await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        typeId: input.typeId,
        subject,
        notes: input.notes?.trim() || null,
        outcome: input.outcome?.trim() || null,
        startsAt: ocurrioEn,
        completedAt: ocurrioEn,
        opportunityId: detalle.id,
        organizationId: detalle.organization.id,
        // Quien la registra es quien la hizo.
        userId: session.userId,
      },
    });

    if (input.siguiente) {
      await tx.activity.create({
        data: {
          typeId: input.siguiente.typeId,
          subject: input.siguiente.subject.trim(),
          startsAt: input.siguiente.startsAt,
          opportunityId: detalle.id,
          organizationId: detalle.organization.id,
          userId: session.userId,
        },
      });
    }

    // El más próximo de los que quedan pendientes, ya con lo recién escrito.
    const proximo = await tx.activity.findFirst({
      where: { opportunityId: detalle.id, completedAt: null, deletedAt: null },
      select: { startsAt: true },
      orderBy: { startsAt: "asc" },
    });

    await tx.opportunity.update({
      where: { id: detalle.id },
      data: {
        // Solo avanza: registrar hoy una llamada de la semana pasada no debe
        // hacer que la cuenta parezca más fría de lo que está.
        lastActivityAt:
          detalle.lastActivityAt && detalle.lastActivityAt > ocurrioEn
            ? detalle.lastActivityAt
            : ocurrioEn,
        nextActivityAt: proximo?.startsAt ?? null,
      },
    });

    return proximo?.startsAt ?? null;
  });

  return ok({ siguienteEn });
}
