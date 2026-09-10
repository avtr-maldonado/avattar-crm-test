import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { opportunityScope } from "./opportunities";

/**
 * La ruta de almacenamiento de un documento, con el alcance aplicado.
 *
 * `storageKey` **no viaja al cliente**: `getOpportunityDetail` no lo selecciona.
 * Se lee aquí, en el servidor, solo para firmar la descarga, y solo si la sesión
 * alcanza la oportunidad a la que el documento pertenece (INV-01).
 */
export async function getRutaDeDocumento(
  session: Session,
  opportunityId: string,
  documentId: string,
) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      opportunityId,
      opportunity: opportunityScope(session),
    },
    select: { storageKey: true, name: true },
  });
}
