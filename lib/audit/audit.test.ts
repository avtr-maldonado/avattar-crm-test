import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { writeAudit } from "./index";

/**
 * La garantía de INV-09 es la clausura de `auditedTransaction`, no el tipo de
 * `writeAudit`.
 *
 * Se intentó primero lo segundo —exigir `Prisma.TransactionClient` como primer
 * argumento— y no funciona: ese tipo es un `Omit<PrismaClient, …>`, y
 * `PrismaClient` lo satisface estructuralmente. `writeAudit(prisma, …)`
 * compila. La primera prueba de aquí abajo documenta ese hecho para que nadie
 * vuelva a confiar en él.
 *
 * Lo que sí hace falta probar en ejecución es que si la escritura de la
 * bitácora falla, la operación completa se revierte. Eso necesita base
 * sembrada, así que se activa con la Task 12.
 */
describe("auditedTransaction · INV-09", () => {
  it("el tipo de writeAudit NO distingue el cliente normal del de transacción", () => {
    // Esto compila, y no debería confundirse con una garantía: TypeScript
    // acepta `prisma` donde se pide `TransactionClient`. Por eso la API que
    // usan las acciones de dominio es `auditedTransaction`, que entrega una
    // función con la transacción ya capturada y no un cliente.
    const compilaAunqueNoDebiera = () =>
      writeAudit(prisma, {
        entity: "Opportunity",
        entityId: "x",
        action: "CAMBIAR_PROPIETARIO",
        byUserId: "y",
      });
    expect(typeof compilaAunqueNoDebiera).toBe("function");
  });

  it("auditedTransaction entrega una función, no un cliente", async () => {
    // La diferencia es la que hace real el invariante: `audit` tiene `tx` en su
    // clausura, así que no existe forma de invocarla contra otra conexión.
    const { auditedTransaction } = await import("./index");
    expect(auditedTransaction).toBeTypeOf("function");
    expect(auditedTransaction.length).toBe(1);
  });

  it.skip("si la bitácora falla, la operación completa se revierte (AC-33)", async () => {
    const oportunidad = await prisma.opportunity.findFirstOrThrow({
      select: { id: true, ownerId: true },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.opportunity.update({
          where: { id: oportunidad.id },
          data: { ownerId: oportunidad.ownerId },
        });
        // byUserId inexistente: viola la llave foránea a users y revienta.
        await writeAudit(tx, {
          entity: "Opportunity",
          entityId: oportunidad.id,
          action: "CAMBIAR_PROPIETARIO",
          byUserId: "usuario-que-no-existe",
        });
      }),
    ).rejects.toThrow();

    // Ni la bitácora ni el cambio quedaron.
    const entradas = await prisma.auditLog.count({
      where: { entityId: oportunidad.id, action: "CAMBIAR_PROPIETARIO" },
    });
    expect(entradas).toBe(0);
  });

  it.skip("una acción sensible deja exactamente una entrada (AC-33)", async () => {
    const [usuario, oportunidad] = await Promise.all([
      prisma.user.findFirstOrThrow({ select: { id: true } }),
      prisma.opportunity.findFirstOrThrow({ select: { id: true, ownerId: true } }),
    ]);

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        entity: "Opportunity",
        entityId: oportunidad.id,
        action: "CAMBIAR_PROPIETARIO",
        byUserId: usuario.id,
        before: { ownerId: oportunidad.ownerId },
        after: { ownerId: usuario.id },
      });
    });

    const entradas = await prisma.auditLog.findMany({
      where: { entityId: oportunidad.id, action: "CAMBIAR_PROPIETARIO" },
    });
    expect(entradas).toHaveLength(1);
    expect(entradas[0].before).toEqual({ ownerId: oportunidad.ownerId });

    await prisma.auditLog.deleteMany({ where: { id: entradas[0].id } });
  });
});
