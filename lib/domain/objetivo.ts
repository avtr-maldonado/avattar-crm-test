import type { CountryCode, ObjectivePeriod } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

/**
 * Fijar la cuota de una persona · §10.1, P-08.
 *
 * ## Quién puede
 *
 * `EDITAR_CATALOGOS`, que hoy es solo Administración. Se evaluó usar
 * `VER_OBJETIVOS_EQUIPO` —lo tienen gerencia y dirección— y se descartó: un
 * gerente de país podría fijar la cuota de su propio equipo, contra la que a él
 * lo miden. Los permisos son datos (F-1005): si el negocio quiere que Dirección
 * fije cuotas, se concede desde Administración sin tocar código. Queda anotado
 * en `decisiones-pendientes.md` §17.
 *
 * ## Qué se valida
 *
 * La cuota se fija **a una persona que opera en ese país**. Sin esa condición
 * se podría cargar la cuota de México a un vendedor de Chile, y el tablero de
 * México sumaría una cuota que nadie de esa oficina va a cubrir.
 *
 * La utilidad no puede ser mayor que la venta: sería pedir margen por encima
 * del 100 %, y es un error de dedo que se detecta al capturar o nunca.
 *
 * ## Lo que NO valida aquí
 *
 * `RN-32` —que los cuatro trimestres sumen el anual— **no bloquea**. El spec
 * pide avisar, no impedir: durante la captura de un año completo el desajuste
 * es el estado normal hasta el cuarto renglón. El aviso vive en la pantalla,
 * donde se ve siempre y no solo en el instante de guardar.
 *
 * Reemplaza por periodo (INV-15 no aplica: los objetivos no se borran, se
 * sustituyen) y deja bitácora en la misma transacción (INV-09).
 */
const SIN_PERMISO = "Fijar objetivos es de Administración.";

export type CuotaCapturada = {
  userId: string;
  countryCode: CountryCode;
  fiscalYear: number;
  periodType: ObjectivePeriod;
  /** 1 a 4 en TRIMESTRAL; nulo en ANUAL. */
  quarter: number | null;
  /** Cadenas, no números: el dinero no pasa por `number` (INV-03). */
  revenueQuota: string;
  grossProfitQuota: string;
};

export async function fijarObjetivo(
  session: Session,
  entrada: CuotaCapturada,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", { mensaje: SIN_PERMISO });
  }

  const quarter = entrada.periodType === "TRIMESTRAL" ? entrada.quarter : null;
  if (entrada.periodType === "TRIMESTRAL" && (quarter === null || quarter < 1 || quarter > 4)) {
    return falla("VALIDACION", {
      campo: "quarter",
      mensaje: "Un objetivo trimestral necesita un trimestre del 1 al 4.",
    });
  }

  const venta = money(entrada.revenueQuota);
  const utilidad = money(entrada.grossProfitQuota);

  if (venta.isNegative() || utilidad.isNegative()) {
    return falla("VALIDACION", {
      campo: venta.isNegative() ? "revenueQuota" : "grossProfitQuota",
      mensaje: "Una cuota no puede ser negativa. Para quitar la meta, ponla en cero.",
    });
  }

  if (utilidad.gt(venta)) {
    return falla("VALIDACION", {
      campo: "grossProfitQuota",
      mensaje: "La utilidad no puede ser mayor que la venta: sería un margen arriba del 100 %.",
    });
  }

  // AC-05 por la puerta de atrás: una cuota de México a alguien que no opera en
  // México le carga a la oficina un número que nadie de ahí va a cubrir.
  const usuario = await prisma.user.findFirst({
    where: {
      id: entrada.userId,
      active: true,
      deletedAt: null,
      countryCodes: { has: entrada.countryCode },
    },
    select: { id: true, name: true },
  });

  if (!usuario) {
    return falla("VALIDACION", {
      campo: "userId",
      mensaje: `Esa persona no está activa o no opera en ${entrada.countryCode}.`,
    });
  }

  const id = await auditedTransaction(async (tx, audit) => {
    /**
     * Se busca y luego se escribe, en vez de `upsert` sobre la clave única.
     *
     * `@@unique([userId, fiscalYear, periodType, quarter])` **no protege la
     * fila ANUAL**: ahí `quarter` es nulo, y en Postgres `NULL` nunca es igual
     * a `NULL`, así que el índice permitiría dos anuales del mismo año para la
     * misma persona. Prisma lo delata al tipar la clave compuesta como
     * `quarter: number`, que es justo lo que no se puede pasar.
     *
     * Dentro de la transacción, buscar y escribir es correcto y no inventa un
     * `quarter = 0` que cambiaría el significado de la columna. Cerrar el hueco
     * de raíz pide un índice parcial que Prisma todavía no sabe expresar; queda
     * anotado en `decisiones-pendientes.md` §17.
     */
    const antes = await tx.objective.findFirst({
      where: {
        userId: entrada.userId,
        fiscalYear: entrada.fiscalYear,
        periodType: entrada.periodType,
        quarter,
      },
      select: { id: true, revenueQuota: true, grossProfitQuota: true },
    });

    const guardado = antes
      ? await tx.objective.update({
          where: { id: antes.id },
          data: {
            countryCode: entrada.countryCode,
            revenueQuota: venta,
            grossProfitQuota: utilidad,
          },
          select: { id: true },
        })
      : await tx.objective.create({
          data: {
            userId: entrada.userId,
            countryCode: entrada.countryCode,
            fiscalYear: entrada.fiscalYear,
            periodType: entrada.periodType,
            quarter,
            revenueQuota: venta,
            grossProfitQuota: utilidad,
          },
          select: { id: true },
        });

    await audit({
      entity: "Objective",
      entityId: guardado.id,
      action: "FIJAR_OBJETIVO",
      byUserId: session.userId,
      before: antes
        ? {
            revenueQuota: antes.revenueQuota.toString(),
            grossProfitQuota: antes.grossProfitQuota.toString(),
          }
        : {},
      after: {
        userId: entrada.userId,
        countryCode: entrada.countryCode,
        fiscalYear: entrada.fiscalYear,
        periodType: entrada.periodType,
        quarter,
        revenueQuota: venta.toString(),
        grossProfitQuota: utilidad.toString(),
      },
    });

    return guardado.id;
  });

  return ok({ id });
}
