import type { Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import type { CotizacionConLineas } from "@/lib/scope/cotizaciones";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";
import { calcularTotales, validarPisoDePrecio, type LineaParaCalcular } from "./quote";

/**
 * Las escrituras de la cotización · `INV-06`, `RN-08`, `RN-24`.
 *
 * Las fórmulas viven en `quote.ts`, que es puro. Aquí está lo que toca la base:
 * abrir el borrador, guardar líneas, congelar y versionar.
 *
 * ## El cliente nunca manda el costo
 *
 * Es la decisión de seguridad de este módulo. Para una línea de catálogo, el
 * precio y el costo se buscan **aquí** en la lista vigente del producto. Si el
 * cliente pudiera mandarlos, un vendedor sin `VER_COSTO` podría inyectar un
 * costo, o deducir el verdadero probando valores hasta que el margen cuadre —la
 * misma aritmética que documenta §9.2—.
 *
 * La única excepción es el concepto libre (`Q-07`), que no viene de ninguna
 * lista y por eso exige costo capturado. Capturarlo requiere `VER_COSTO`: quien
 * no puede ver un costo tampoco puede fijarlo.
 */

type Umbrales = { lineMarginFloor: string };

/** Solo un borrador se escribe. Congelada o reemplazada es historia (INV-06). */
function editable(cotizacion: CotizacionConLineas): ResultadoAccion | null {
  if (cotizacion.status === "BORRADOR") return null;
  return falla(
    "CONFLICTO",
    cotizacion.status === "CONGELADA"
      ? `La versión ${cotizacion.version} está congelada. Crea la versión siguiente para cambiarla.`
      : `La versión ${cotizacion.version} fue reemplazada por una posterior.`,
  );
}

/**
 * Recalcula y persiste los totales.
 *
 * El esquema es explícito: «totales persistidos, no calculados en vista: hay
 * que poder congelarlos». Se recalculan en cada cambio mientras es borrador.
 */
async function recalcular(tx: Prisma.TransactionClient, quoteId: string): Promise<void> {
  const cotizacion = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      taxRate: true,
      lines: { select: { quantity: true, unitPrice: true, discountRate: true, unitCost: true } },
    },
  });

  const t = calcularTotales(cotizacion.lines, cotizacion.taxRate);

  await tx.quote.update({
    where: { id: quoteId },
    data: {
      grossSubtotal: t.grossSubtotal,
      netSubtotal: t.netSubtotal,
      discountRate: t.discountRate,
      taxAmount: t.taxAmount,
      total: t.total,
      totalCost: t.totalCost,
      grossProfit: t.grossProfit,
      grossMargin: t.grossMargin,
    },
  });
}

// ═════════════════════════════════════════════════════ Abrir el borrador

/**
 * El borrador vigente de la oportunidad, abriendo la v1 si no hay ninguno.
 *
 * `RN-24` · la tasa de impuesto se **copia** del país al crear, no se lee
 * después: cambiar `Country.taxRate` mañana no puede alterar una cotización
 * histórica (`AC-11`).
 */
export async function borradorDeCotizacion(
  session: Session,
  detalle: DetalleOportunidad,
  taxRate: Money,
): Promise<ResultadoAccion<{ id: string; version: number }>> {
  if (detalle.status !== "ABIERTA") {
    return falla("AUTORIZACION", "Una oportunidad cerrada no se cotiza.");
  }

  const existente = await prisma.quote.findFirst({
    where: { opportunityId: detalle.id, status: "BORRADOR" },
    select: { id: true, version: true },
  });
  if (existente) return ok(existente);

  const ultima = await prisma.quote.findFirst({
    where: { opportunityId: detalle.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const creada = await prisma.quote.create({
    data: {
      opportunityId: detalle.id,
      version: (ultima?.version ?? 0) + 1,
      status: "BORRADOR",
      taxRate,
      grossSubtotal: 0,
      netSubtotal: 0,
      discountRate: 0,
      taxAmount: 0,
      total: 0,
      totalCost: 0,
      grossProfit: 0,
      grossMargin: 0,
    },
    select: { id: true, version: true },
  });

  return ok(creada);
}

// ═══════════════════════════════════════════════════════════════ Líneas

export type EntradaDeLinea = {
  /** Al editar una línea existente. */
  lineId?: string;
  /** Línea de catálogo: precio y costo salen de la lista vigente. */
  productId?: string;
  /** Concepto libre (`Q-07`): exige descripción, unidad, precio y costo. */
  description?: string;
  unit?: string;
  unitPrice?: string;
  unitCost?: string;
  quantity: string;
  discountRate: string;
};

export async function guardarLinea(
  session: Session,
  cotizacion: CotizacionConLineas,
  entrada: EntradaDeLinea,
  umbrales: Umbrales,
): Promise<ResultadoAccion> {
  const bloqueada = editable(cotizacion);
  if (bloqueada) return bloqueada;

  const quantity = money(entrada.quantity);
  const discountRate = money(entrada.discountRate);

  if (quantity.lte(0)) {
    return falla("VALIDACION", { campo: "quantity", mensaje: "La cantidad tiene que ser mayor que cero." });
  }
  if (discountRate.lt(0) || discountRate.gt(1)) {
    return falla("VALIDACION", { campo: "discountRate", mensaje: "El descuento va de 0 a 100 %." });
  }

  let descripcion: string;
  let unit: string;
  let unitPrice: Money;
  let unitCost: Money;
  let minPrice: Money | null = null;
  let productId: string | null = null;

  if (entrada.productId) {
    // ── Línea de catálogo · precio, costo y piso los pone el servidor ──────
    const hoy = new Date();
    const producto = await prisma.product.findFirst({
      where: { id: entrada.productId, active: true },
      select: {
        id: true,
        name: true,
        unit: true,
        prices: {
          where: { validFrom: { lte: hoy }, validTo: { gte: hoy } },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { listPrice: true, minPrice: true, standardCost: true },
        },
      },
    });
    if (!producto) {
      return falla("VALIDACION", { campo: "productId", mensaje: "Ese producto no existe o está inactivo." });
    }
    const precio = producto.prices[0];
    if (!precio) {
      return falla("VALIDACION", {
        campo: "productId",
        mensaje: `«${producto.name}» no tiene lista de precio vigente a la fecha.`,
      });
    }

    productId = producto.id;
    descripcion = producto.name;
    unit = producto.unit;
    unitPrice = precio.listPrice;
    unitCost = precio.standardCost;
    minPrice = precio.minPrice;
  } else {
    // ── Concepto libre · Q-07 ─────────────────────────────────────────────
    if (!entrada.description?.trim()) {
      return falla("VALIDACION", { campo: "description", mensaje: "Describe el concepto." });
    }
    if (!entrada.unitPrice) {
      return falla("VALIDACION", { campo: "unitPrice", mensaje: "Pon el precio unitario." });
    }
    if (!entrada.unitCost) {
      // Sin costo no hay margen, y sin margen la política no puede opinar. Es
      // lo que Q-07 dejó resuelto: concepto libre con costo obligatorio.
      return falla("VALIDACION", {
        campo: "unitCost",
        mensaje: "Un concepto libre necesita su costo: sin él no se puede calcular el margen.",
      });
    }
    // Quien no puede ver un costo tampoco puede fijarlo (INV-02).
    if (!can(session, "VER_COSTO")) {
      return falla("AUTORIZACION", "Capturar un concepto libre exige poder ver el costo.");
    }

    descripcion = entrada.description.trim();
    unit = entrada.unit?.trim() || "servicio";
    unitPrice = money(entrada.unitPrice);
    unitCost = money(entrada.unitCost);

    if (unitPrice.lte(0)) {
      return falla("VALIDACION", { campo: "unitPrice", mensaje: "El precio tiene que ser mayor que cero." });
    }
    if (unitCost.lt(0)) {
      return falla("VALIDACION", { campo: "unitCost", mensaje: "El costo no puede ser negativo." });
    }
  }

  // RN-08 · el piso duro, con el mensaje que nombra las dos cifras.
  const problema = validarPisoDePrecio({ descripcion, unitPrice, discountRate, minPrice });
  if (problema) return falla("VALIDACION", { campo: "discountRate", mensaje: problema });

  void umbrales; // RN-05 señala en la pantalla; aquí no bloquea (sin autorizaciones).

  await prisma.$transaction(async (tx) => {
    if (entrada.lineId) {
      await tx.quoteLine.update({
        where: { id: entrada.lineId },
        data: { productId, description: descripcion, unit, quantity, unitPrice, unitCost, discountRate },
      });
    } else {
      const ultima = await tx.quoteLine.findFirst({
        where: { quoteId: cotizacion.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      await tx.quoteLine.create({
        data: {
          quoteId: cotizacion.id,
          position: (ultima?.position ?? 0) + 1,
          productId,
          description: descripcion,
          unit,
          quantity,
          unitPrice,
          unitCost,
          discountRate,
        },
      });
    }

    await recalcular(tx, cotizacion.id);
  });

  return ok(null);
}

export async function quitarLinea(
  _session: Session,
  cotizacion: CotizacionConLineas,
  lineId: string,
): Promise<ResultadoAccion> {
  const bloqueada = editable(cotizacion);
  if (bloqueada) return bloqueada;

  await prisma.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { id: lineId, quoteId: cotizacion.id } });
    await recalcular(tx, cotizacion.id);
  });

  return ok(null);
}

// ═══════════════════════════════════════════════════ Congelar y versionar

/**
 * Congela la cotización · `INV-06`.
 *
 * Y escribe el espejo en la oportunidad: el esquema dice que `amount` es «neto
 * vigente, espejo de la cotización activa, actualizado en la misma
 * transacción». Sin eso el kanban seguiría mostrando el importe estimado y las
 * banderas de riesgo calcularían sobre un margen que no existe.
 */
export async function congelarCotizacion(
  session: Session,
  cotizacion: CotizacionConLineas,
): Promise<ResultadoAccion> {
  const bloqueada = editable(cotizacion);
  if (bloqueada) return bloqueada;

  if (cotizacion.lines.length === 0) {
    return falla("VALIDACION", "Una cotización sin líneas no se congela: no hay nada que ofrecer.");
  }

  await prisma.$transaction(async (tx) => {
    // Se releen los totales dentro de la transacción: los del argumento se
    // cargaron antes y pudo cambiar una línea en medio.
    await recalcular(tx, cotizacion.id);
    const fresca = await tx.quote.findUniqueOrThrow({
      where: { id: cotizacion.id },
      select: { netSubtotal: true, grossMargin: true },
    });

    await tx.quote.update({
      where: { id: cotizacion.id },
      data: { status: "CONGELADA", frozenAt: new Date(), frozenById: session.userId },
    });

    await tx.opportunity.update({
      where: { id: cotizacion.opportunity.id },
      data: { amount: fresca.netSubtotal, grossMargin: fresca.grossMargin },
    });
  });

  return ok(null);
}

/**
 * Abre la versión siguiente a partir de una congelada · `INV-06` y `AC-10`.
 *
 * La nueva **nace con las líneas de la anterior**: editar una cotización es
 * corregir lo que había, no capturarlo de cero. Y conserva su `taxRate`: la
 * tasa pertenece a la negociación, no al calendario (`RN-24`).
 */
export async function nuevaVersion(
  session: Session,
  cotizacion: CotizacionConLineas,
): Promise<ResultadoAccion<{ id: string; version: number }>> {
  void session;

  if (cotizacion.status === "BORRADOR") {
    return falla("CONFLICTO", `La versión ${cotizacion.version} todavía es un borrador: edítala.`);
  }

  const yaHayBorrador = await prisma.quote.findFirst({
    where: { opportunityId: cotizacion.opportunity.id, status: "BORRADOR" },
    select: { version: true },
  });
  if (yaHayBorrador) {
    return falla(
      "CONFLICTO",
      `Ya existe la versión ${yaHayBorrador.version} en borrador. Termínala o descártala antes de abrir otra.`,
    );
  }

  const nueva = await prisma.$transaction(async (tx) => {
    const anterior = await tx.quote.findUniqueOrThrow({
      where: { id: cotizacion.id },
      select: {
        opportunityId: true,
        version: true,
        taxRate: true,
        lines: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            productId: true,
            description: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            unitCost: true,
            discountRate: true,
          },
        },
      },
    });

    const creada = await tx.quote.create({
      data: {
        opportunityId: anterior.opportunityId,
        version: anterior.version + 1,
        status: "BORRADOR",
        taxRate: anterior.taxRate,
        grossSubtotal: 0,
        netSubtotal: 0,
        discountRate: 0,
        taxAmount: 0,
        total: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMargin: 0,
        lines: { create: anterior.lines },
      },
      select: { id: true, version: true },
    });

    await tx.quote.update({ where: { id: cotizacion.id }, data: { status: "REEMPLAZADA" } });
    await recalcular(tx, creada.id);

    return creada;
  });

  return ok(nueva);
}

/** Los tipos que la pantalla necesita, derivados y no repetidos a mano. */
export type LineaDeCotizacion = CotizacionConLineas["lines"][number] & Partial<LineaParaCalcular>;
