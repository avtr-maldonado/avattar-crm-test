import { PrismaClient } from "@prisma/client";

/**
 * El cliente de Prisma · INV-01.
 *
 * ESTE MÓDULO SOLO PUEDE IMPORTARSE DESDE `lib/scope` Y `lib/domain`.
 *
 * `app/**` y `components/**` no lo alcanzan: lo impide `no-restricted-imports`
 * en `eslint.config.mjs` y lo verifica `tests/arquitectura/invariantes.test.ts`
 * (AC-32). Esas capas reciben funciones ya acotadas por rol, no un cliente con
 * el que puedan consultar por su cuenta.
 *
 * La razón no es estilística. La autorización de este sistema vive en la capa
 * de datos, no en la UI: si un componente puede llamar a
 * `prisma.opportunity.findMany`, un vendedor termina viendo el pipeline de sus
 * compañeros y nadie lo nota hasta que alguien lo reporta.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // En desarrollo conviene ver la consulta que se va a la base; en producción
    // solo lo que hay que atender.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Sin esto, el recarga-en-caliente de Next abre una conexión nueva por cada
// cambio de archivo y agota el pooler.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
