import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * La bitácora de auditoría · INV-09.
 *
 * El invariante dice: las acciones sensibles escriben en `AuditLog` **en la
 * misma transacción** que el cambio, y si el log falla, la operación falla.
 *
 * ## Por qué `auditedTransaction` y no solo `writeAudit(tx, …)`
 *
 * La idea original era que exigir un `Prisma.TransactionClient` como primer
 * argumento bastaba para impedir escribir fuera de la transacción. **No basta.**
 * `TransactionClient` es un `Omit<PrismaClient, …>`, y `PrismaClient` tiene
 * todos esos métodos y más, así que satisface el tipo estructuralmente:
 * `writeAudit(prisma, …)` compila sin queja. Lo detectó un `@ts-expect-error`
 * que quedó sin usar.
 *
 * `auditedTransaction` sí lo garantiza, porque no entrega un cliente: entrega
 * una función `audit` que ya tiene la transacción **capturada en su clausura**.
 * No hay forma de invocarla fuera, y no hay forma de hacer el cambio sin tener
 * la función a la mano.
 *
 * ```ts
 * await auditedTransaction(async (tx, audit) => {
 *   const antes = await tx.opportunity.findUniqueOrThrow({ where: { id } });
 *   const despues = await tx.opportunity.update({ where: { id }, data });
 *   await audit({
 *     entity: "Opportunity",
 *     entityId: id,
 *     action: "CAMBIAR_PROPIETARIO",
 *     byUserId: session.userId,
 *     before: { ownerId: antes.ownerId },
 *     after: { ownerId: despues.ownerId },
 *   });
 * });
 * ```
 */

/**
 * Las acciones que INV-09 enumera. Unión de literales para que una acción mal
 * escrita sea error de compilación: la bitácora se consulta filtrando por
 * `action`, y un typo la vuelve invisible justo cuando alguien la necesita.
 */
export type AuditAction =
  | "AUTORIZAR_DESCUENTO"
  | "RECHAZAR_DESCUENTO"
  | "CAMBIAR_PRECIO_CONGELADO"
  | "REABRIR_OPORTUNIDAD"
  | "EDITAR_CATALOGO"
  | "EXPORTAR_CON_COSTO"
  | "CAMBIAR_PROPIETARIO"
  | "EDITAR_POLITICA_COMERCIAL"
  | "MARCAR_GANADA"
  | "MARCAR_PERDIDA";

export type AuditEntry = {
  /** El modelo, en singular y como lo llama Prisma: "Opportunity", "Quote". */
  entity: string;
  entityId: string;
  action: AuditAction;
  byUserId: string;
  /** Solo los campos que cambiaron, no el registro entero. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
};

/** La función que `auditedTransaction` entrega, con la transacción capturada. */
export type AuditFn = (entry: AuditEntry) => Promise<void>;

/**
 * Ejecuta una operación sensible y su bitácora en la misma transacción.
 *
 * **Esta es la API que las acciones de dominio deben usar.** La función `audit`
 * que recibe el callback tiene `tx` capturado en su clausura: es imposible
 * escribir la bitácora contra otra conexión, y si esa escritura falla, el
 * `$transaction` revierte también el cambio que se estaba auditando.
 */
export async function auditedTransaction<T>(
  fn: (tx: Prisma.TransactionClient, audit: AuditFn) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    return fn(tx, (entry) => writeAudit(tx, entry));
  });
}

/**
 * Primitiva de escritura. Preferir `auditedTransaction`.
 *
 * Recibe el cliente de transacción por convención, no por garantía: TypeScript
 * acepta también el cliente normal, porque `TransactionClient` es un `Omit` de
 * `PrismaClient` y este lo satisface estructuralmente. Se exporta para casos
 * donde la transacción ya viene de fuera.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      byUserId: entry.byUserId,
      before: entry.before,
      after: entry.after,
      ip: entry.ip,
    },
  });
}

/**
 * Lee la bitácora de un registro, de lo más reciente a lo más antiguo.
 *
 * No lleva alcance por rol: la bitácora es de administración y auditoría, y
 * quien llegue aquí ya pasó por `requirePermission`. Se deja explícito para
 * que no parezca un olvido de INV-01.
 */
export async function readAuditTrail(
  client: Prisma.TransactionClient,
  entity: string,
  entityId: string,
  take = 50,
) {
  return client.auditLog.findMany({
    where: { entity, entityId },
    select: {
      id: true,
      action: true,
      at: true,
      before: true,
      after: true,
      byUser: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { at: "desc" },
    take,
  });
}
