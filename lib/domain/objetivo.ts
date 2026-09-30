import type { CountryCode, ObjectivePeriod } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, type Money } from "@/lib/money";

const CERO = money(0);

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

// ═══════════════════════════════════ La cuadrícula por vendedor y trimestre

export type CuotasDelEquipo = {
  countryCode: CountryCode;
  fiscalYear: number;
  /** Qué columna de la cuota se está capturando; la otra se respeta tal cual. */
  metrica: "VENTA" | "UTILIDAD";
  /** Cadenas, no números (INV-03). Cuatro por persona: Q1 a Q4. */
  filas: { userId: string; cuotas: string[] }[];
  /** A quién se le quitan todas las cuotas del año, ventas y utilidad. */
  eliminar: string[];
};

/**
 * Guardar la cuadrícula de objetivos · decisiones §34.
 *
 * El negocio pidió capturar como en su hoja: una fila por vendedor, Q1 a Q4 y
 * el total anual. Se guarda **todo lo que cambió en un viaje**, pero la bitácora
 * sigue siendo **una entrada por cuota** (INV-09): cada trimestre que cambia
 * deja su antes y su después. Lo que no cambió de valor no se escribe.
 *
 * La métrica se captura de una en una (venta o utilidad); la otra columna del
 * mismo trimestre se conserva. El dedazo que se sigue atajando: una utilidad
 * mayor que la venta del trimestre, **solo cuando hay venta**, porque la
 * utilidad puede capturarse antes que la venta y cero no es una venta.
 *
 * Quitar a alguien borra sus objetivos del año, trimestrales y anual, de las
 * dos métricas: es sacarlo de la hoja. Cada objetivo borrado deja rastro. Y la
 * fila ANUAL de quien recibe trimestres nuevos también se retira: el anual es
 * la suma de los cuatro, no una cifra aparte.
 */
export async function guardarCuotasDelEquipo(
  session: Session,
  entrada: CuotasDelEquipo,
): Promise<ResultadoAccion<{ cambios: number }>> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", { mensaje: SIN_PERMISO });
  }

  const eliminar = new Set(entrada.eliminar);
  const filas = entrada.filas.filter((f) => !eliminar.has(f.userId));
  const ids = [...new Set([...filas.map((f) => f.userId), ...eliminar])];
  if (ids.length === 0) return ok({ cambios: 0 });

  for (const f of filas) {
    if (f.cuotas.length !== 4) {
      return falla("VALIDACION", { campo: "cuotas", mensaje: "Cada persona lleva cuatro trimestres." });
    }
  }
  const cuotas = filas.map((f) => ({ userId: f.userId, cuotas: f.cuotas.map((c) => money(c.trim() || "0")) }));
  if (cuotas.some((f) => f.cuotas.some((c) => c.isNegative()))) {
    return falla("VALIDACION", {
      campo: "cuotas",
      mensaje: "Una cuota no puede ser negativa. Para quitar la meta, ponla en cero.",
    });
  }

  // AC-05 por la puerta de atrás, igual que al fijar una sola.
  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids }, active: true, deletedAt: null, countryCodes: { has: entrada.countryCode } },
    select: { id: true },
  });
  const validos = new Set(usuarios.map((u) => u.id));
  if (ids.some((id) => !validos.has(id))) {
    return falla("VALIDACION", {
      campo: "userId",
      mensaje: `Alguien de la lista no está activo o no opera en ${entrada.countryCode}.`,
    });
  }

  const existentes = await prisma.objective.findMany({
    where: { userId: { in: ids }, fiscalYear: entrada.fiscalYear },
    select: { id: true, userId: true, periodType: true, quarter: true, revenueQuota: true, grossProfitQuota: true },
  });
  const trimestral = (userId: string, q: number) =>
    existentes.find((o) => o.userId === userId && o.periodType === "TRIMESTRAL" && o.quarter === q);

  // Qué queda en cada trimestre, ya con la otra métrica respetada, y la
  // validación del dedazo antes de abrir la transacción.
  const pendientes: { userId: string; q: number; venta: Money; utilidad: Money; antes: (typeof existentes)[number] | undefined }[] = [];
  for (const f of cuotas) {
    for (let q = 1; q <= 4; q++) {
      const antes = trimestral(f.userId, q);
      const nueva = f.cuotas[q - 1]!;
      const venta = entrada.metrica === "VENTA" ? nueva : (antes?.revenueQuota ?? CERO);
      const utilidad = entrada.metrica === "UTILIDAD" ? nueva : (antes?.grossProfitQuota ?? CERO);
      if (!venta.isZero() && utilidad.gt(venta)) {
        return falla("VALIDACION", {
          campo: `q${q}`,
          mensaje: `Q${q}: la utilidad no puede ser mayor que la venta; sería un margen arriba del 100 %.`,
        });
      }
      const sinCambio = antes ? antes.revenueQuota.equals(venta) && antes.grossProfitQuota.equals(utilidad) : venta.isZero() && utilidad.isZero();
      if (!sinCambio) pendientes.push({ userId: f.userId, q, venta, utilidad, antes });
    }
  }
  // Se van: los objetivos de quien se elimina, y la fila ANUAL de quien recibe
  // trimestres, porque desde §34 el anual es la suma y una anual aparte que no
  // coincide solo confunde (RN-32 sigue valiendo para las que nadie vuelve a tocar).
  const conTrimestresNuevos = new Set(pendientes.map((p) => p.userId));
  const aBorrar = existentes
    .filter((o) => eliminar.has(o.userId) || (o.periodType === "ANUAL" && conTrimestresNuevos.has(o.userId)))
    .map((o) => ({
      ...o,
      motivo: eliminar.has(o.userId)
        ? "Se quitó a la persona de la hoja del año."
        : "La cuota anual se deriva de los trimestres (decisiones §34).",
    }));
  if (pendientes.length === 0 && aBorrar.length === 0) return ok({ cambios: 0 });

  const cambios = await auditedTransaction(async (tx, audit) => {
    // Cada cuota es independiente de las demás: van en paralelo dentro de la
    // misma transacción, y cada una deja su propio renglón de bitácora.
    await Promise.all(
      pendientes.map(async (p) => {
        const guardado = p.antes
          ? await tx.objective.update({
              where: { id: p.antes.id },
              data: { countryCode: entrada.countryCode, revenueQuota: p.venta, grossProfitQuota: p.utilidad },
              select: { id: true },
            })
          : await tx.objective.create({
              data: {
                userId: p.userId,
                countryCode: entrada.countryCode,
                fiscalYear: entrada.fiscalYear,
                periodType: "TRIMESTRAL",
                quarter: p.q,
                revenueQuota: p.venta,
                grossProfitQuota: p.utilidad,
              },
              select: { id: true },
            });
        await audit({
          entity: "Objective",
          entityId: guardado.id,
          action: "FIJAR_OBJETIVO",
          byUserId: session.userId,
          before: p.antes
            ? { revenueQuota: p.antes.revenueQuota.toString(), grossProfitQuota: p.antes.grossProfitQuota.toString() }
            : {},
          after: {
            userId: p.userId,
            countryCode: entrada.countryCode,
            fiscalYear: entrada.fiscalYear,
            periodType: "TRIMESTRAL",
            quarter: p.q,
            revenueQuota: p.venta.toString(),
            grossProfitQuota: p.utilidad.toString(),
          },
        });
      }),
    );

    if (aBorrar.length > 0) {
      await tx.objective.deleteMany({ where: { id: { in: aBorrar.map((o) => o.id) } } });
      await Promise.all(
        aBorrar.map((o) =>
          audit({
            entity: "Objective",
            entityId: o.id,
            action: "FIJAR_OBJETIVO",
            byUserId: session.userId,
            before: {
              userId: o.userId,
              periodType: o.periodType,
              quarter: o.quarter,
              revenueQuota: o.revenueQuota.toString(),
              grossProfitQuota: o.grossProfitQuota.toString(),
            },
            after: { eliminado: true, fiscalYear: entrada.fiscalYear, motivo: o.motivo },
          }),
        ),
      );
    }
    return pendientes.length + aBorrar.length;
  });

  return ok({ cambios });
}

