import type { Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction, type AuditFn } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import type { CotizacionConLineas } from "@/lib/scope/cotizaciones";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";
import { calcularTotales, validarPisoDePrecio, type LineaParaCalcular } from "./quote";

/**
 * Las escrituras de la cotización · `INV-06` (enmendado), `RN-08`, `RN-24`.
 *
 * Las fórmulas viven en `quote.ts`, que es puro. Aquí está lo que toca la base:
 * abrir la cotización, guardar, editar y quitar líneas.
 *
 * ## Una cotización, editable, con bitácora (decisiones §21)
 *
 * Hasta el 22 de septiembre de 2026 la cotización se congelaba y editar creaba
 * una versión. El negocio lo revisó en uso y pidió una sola cotización que se
 * corrige en su lugar. `INV-06` se enmienda: la trazabilidad no se pierde,
 * cambia de forma. **Cada cambio deja en `AuditLog` el neto antes y después y
 * qué línea cambió** (`EDITAR_COTIZACION`), en la misma transacción que el
 * cambio (INV-09). Y el espejo en la oportunidad —`amount`, `grossMargin`— se
 * escribe en cada cambio, porque ya no hay otro momento en que la cotización
 * sea «la vigente».
 *
 * Las columnas `version`, `status` y `frozenAt` siguen en la base sin uso; las
 * versiones anteriores a este cambio quedan como historia que nadie lee.
 *
 * ## Precio y costo: referencia, no imposición
 *
 * Para una línea de catálogo, el precio y el costo salen de la lista vigente
 * del producto **como valor inicial** y se pueden fijar distintos. El piso del
 * SKU (`RN-08`) sigue aplicando al precio que quede. El costo solo lo fija
 * quien puede verlo: sin `VER_COSTO` no se acepta, ni al agregar ni al editar,
 * porque probar costos hasta que el margen cuadre es deducirlo (§9.2).
 */

type Umbrales = { lineMarginFloor: string };

/** Una cerrada no se cotiza: su cifra es la que se ganó o se perdió. */
function editable(cotizacion: CotizacionConLineas): ResultadoAccion<never> | null {
  return cotizacion.opportunity.status === "ABIERTA"
    ? null
    : falla("AUTORIZACION", "Una oportunidad cerrada no se cotiza.");
}

/**
 * Recalcula los totales y los espeja en la oportunidad.
 *
 * Con líneas, `amount` y `grossMargin` son los de la cotización. Sin líneas la
 * cotización no dice nada, y el kanban debe volver a enseñar el estimado, no
 * un cero. Devuelve el neto para que la bitácora lo anote.
 */
async function recalcularYEspejar(tx: Prisma.TransactionClient, quoteId: string): Promise<Money> {
  const cotizacion = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      opportunityId: true,
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

  if (cotizacion.lines.length > 0) {
    await tx.opportunity.update({
      where: { id: cotizacion.opportunityId },
      data: { amount: t.netSubtotal, grossMargin: t.grossMargin },
    });
  } else {
    const o = await tx.opportunity.findUniqueOrThrow({
      where: { id: cotizacion.opportunityId },
      select: { estimatedAmount: true },
    });
    await tx.opportunity.update({
      where: { id: cotizacion.opportunityId },
      data: { amount: o.estimatedAmount, grossMargin: null },
    });
  }

  return t.netSubtotal;
}

async function netoActual(tx: Prisma.TransactionClient, quoteId: string): Promise<Money> {
  const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { netSubtotal: true } });
  return q.netSubtotal;
}

/** Lo que `EDITAR_COTIZACION` deja en `after.linea`; lo lee `lib/domain/bitacora`. */
type LineaAuditada = {
  descripcion: string;
  campo?: "quantity" | "unitPrice" | "discountRate" | "unitCost";
  de?: string;
  a?: string;
  alta?: boolean;
  baja?: boolean;
};

async function anotar(
  audit: AuditFn,
  session: Session,
  quoteId: string,
  antes: Money,
  despues: Money,
  linea: LineaAuditada,
) {
  await audit({
    entity: "Quote",
    entityId: quoteId,
    action: "EDITAR_COTIZACION",
    byUserId: session.userId,
    before: { netSubtotal: antes.toFixed(4) },
    after: { netSubtotal: despues.toFixed(4), linea },
  });
}

// ═════════════════════════════════════════════════════ Abrir la cotización

/**
 * La cotización de la oportunidad, abriéndola si no existe.
 *
 * `RN-24` · la tasa de impuesto se **copia** del país al crear, no se lee
 * después: cambiar `Country.taxRate` mañana no puede alterar una cotización
 * histórica (`AC-11`).
 */
export async function abrirCotizacion(
  session: Session,
  detalle: DetalleOportunidad,
  taxRate: Money,
): Promise<ResultadoAccion<{ id: string }>> {
  void session;
  if (detalle.status !== "ABIERTA") {
    return falla("AUTORIZACION", "Una oportunidad cerrada no se cotiza.");
  }

  // La de mayor versión, sin importar su estatus: las versiones vienen de
  // antes de §21 y la última es la que se estaba trabajando.
  const existente = await prisma.quote.findFirst({
    where: { opportunityId: detalle.id },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (existente) return ok(existente);

  const creada = await prisma.quote.create({
    data: {
      opportunityId: detalle.id,
      version: 1,
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
    select: { id: true },
  });

  return ok(creada);
}

// ═══════════════════════════════════════════════════════════════ Líneas

export type EntradaDeLinea = {
  /** Línea de catálogo: precio y costo salen de la lista vigente, salvo que se fijen. */
  productId?: string;
  /** Concepto libre (`Q-07`): exige descripción, unidad, precio y costo. */
  description?: string;
  unit?: string;
  unitPrice?: string;
  /** Solo con `VER_COSTO`, en las dos clases de línea. */
  unitCost?: string;
  quantity: string;
  discountRate: string;
};

function validarCantidadYDescuento(quantity: Money, discountRate: Money): ResultadoAccion<never> | null {
  if (quantity.lte(0)) {
    return falla("VALIDACION", { campo: "quantity", mensaje: "La cantidad tiene que ser mayor que cero." });
  }
  if (discountRate.lt(0) || discountRate.gt(1)) {
    return falla("VALIDACION", { campo: "discountRate", mensaje: "El descuento va de 0 a 100 %." });
  }
  return null;
}

/** El precio de lista vigente de un producto, con su piso. `null` si no hay. */
async function precioVigenteDe(productId: string) {
  const hoy = new Date();
  return prisma.product.findFirst({
    where: { id: productId, active: true },
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
}

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
  const invalida = validarCantidadYDescuento(quantity, discountRate);
  if (invalida) return invalida;

  // Quien no puede ver un costo tampoco puede fijarlo (INV-02).
  if (entrada.unitCost !== undefined && !can(session, "VER_COSTO")) {
    return falla("AUTORIZACION", "Fijar el costo exige poder verlo.");
  }

  let descripcion: string;
  let unit: string;
  let unitPrice: Money;
  let unitCost: Money;
  let minPrice: Money | null = null;
  let productId: string | null = null;

  if (entrada.productId) {
    // ── Línea de catálogo · la lista es la referencia ──────────────────────
    const producto = await precioVigenteDe(entrada.productId);
    if (!producto) {
      return falla("VALIDACION", { campo: "productId", mensaje: "Ese producto no existe o está inactivo." });
    }
    productId = producto.id;
    descripcion = producto.name;
    unit = producto.unit;

    const precio = producto.prices[0] ?? null;
    if (precio) {
      unitPrice = entrada.unitPrice ? money(entrada.unitPrice) : precio.listPrice;
      unitCost = entrada.unitCost ? money(entrada.unitCost) : precio.standardCost;
      minPrice = precio.minPrice;
    } else {
      // Producto sin lista (decisiones §22): precio y costo se fijan aquí, como
      // en el concepto libre de Q-07. Sin lista no hay piso de SKU (RN-08);
      // RN-05 sigue señalando el margen de la línea.
      if (!entrada.unitPrice) {
        return falla("VALIDACION", {
          campo: "unitPrice",
          mensaje: `«${producto.name}» no tiene lista de precio: pon el precio para esta oportunidad.`,
        });
      }
      if (!entrada.unitCost) {
        return falla("VALIDACION", {
          campo: "unitCost",
          mensaje: `«${producto.name}» no tiene lista: su costo se fija aquí, y lo captura quien puede verlo.`,
        });
      }
      unitPrice = money(entrada.unitPrice);
      unitCost = money(entrada.unitCost);
    }
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

    descripcion = entrada.description.trim();
    unit = entrada.unit?.trim() || "servicio";
    unitPrice = money(entrada.unitPrice);
    unitCost = money(entrada.unitCost);
  }

  if (unitPrice.lte(0)) {
    return falla("VALIDACION", { campo: "unitPrice", mensaje: "El precio tiene que ser mayor que cero." });
  }
  if (unitCost.lt(0)) {
    return falla("VALIDACION", { campo: "unitCost", mensaje: "El costo no puede ser negativo." });
  }

  // RN-08 · el piso duro, con el mensaje que nombra las dos cifras.
  const problema = validarPisoDePrecio({ descripcion, unitPrice, discountRate, minPrice });
  if (problema) return falla("VALIDACION", { campo: "discountRate", mensaje: problema });

  void umbrales; // RN-05 señala en la pantalla; aquí no bloquea (sin autorizaciones).

  await auditedTransaction(async (tx, audit) => {
    const [antes, ultima] = await Promise.all([
      netoActual(tx, cotizacion.id),
      tx.quoteLine.findFirst({
        where: { quoteId: cotizacion.id },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
    ]);
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
    const despues = await recalcularYEspejar(tx, cotizacion.id);
    await anotar(audit, session, cotizacion.id, antes, despues, { descripcion, alta: true });
  });

  return ok(null);
}

export type CambiosDeLinea = {
  quantity?: string;
  unitPrice?: string;
  discountRate?: string;
  /** Solo con `VER_COSTO`. */
  unitCost?: string;
};

export type CambioPorLinea = { lineId: string; campos: CambiosDeLinea };

const CAMPOS_EDITABLES = ["quantity", "unitPrice", "discountRate", "unitCost"] as const;

/**
 * Guarda de una vez los cambios de varias líneas · el «Guardar» de la pestaña.
 *
 * Editar es abrir, cambiar lo que haga falta y guardar. Por eso:
 *
 * - **Solo lo que cambió de valor cuenta.** Cada campo se compara con lo
 *   guardado; un valor igual no es un cambio. Si nada cambió, no se escribe
 *   nada —ni totales, ni espejo, ni bitácora— y se devuelve `cambios: 0`.
 * - **Todo o nada.** Un precio bajo el piso del SKU tumba el guardado entero:
 *   el usuario corrige y vuelve a guardar, en vez de quedar a medias.
 * - **Una entrada en la bitácora por guardado**, con cada línea y campo que
 *   cambió y el neto antes y después. La bitácora cuenta guardados, no teclas.
 *
 * Las líneas se releen de la base con todas sus columnas: las de
 * `cotizacion.lines` pueden venir sin `unitCost` (INV-02). Cambiar el precio no
 * vuelve la línea concepto libre: sigue apuntando a su producto, y el piso del
 * SKU sigue aplicando al precio que quede.
 */
export async function guardarCambiosDeCotizacion(
  session: Session,
  cotizacion: CotizacionConLineas,
  cambios: CambioPorLinea[],
  umbrales: Umbrales,
): Promise<ResultadoAccion<{ cambios: number }>> {
  const bloqueada = editable(cotizacion);
  if (bloqueada) return bloqueada;

  const propias = new Set(cotizacion.lines.map((l) => l.id));
  if (cambios.some((c) => !propias.has(c.lineId))) {
    return falla("VALIDACION", "Alguna de esas líneas no es de esta cotización.");
  }
  if (cambios.some((c) => c.campos.unitCost !== undefined) && !can(session, "VER_COSTO")) {
    return falla("AUTORIZACION", "Fijar el costo exige poder verlo.");
  }

  const actuales = await prisma.quoteLine.findMany({
    where: { id: { in: cambios.map((c) => c.lineId) }, quoteId: cotizacion.id },
    select: {
      id: true,
      description: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      discountRate: true,
      unitCost: true,
    },
  });
  const porId = new Map(actuales.map((l) => [l.id, l]));

  // El piso es del SKU: se traen de una vez los de los productos tocados.
  const productos = [...new Set(actuales.flatMap((l) => (l.productId ? [l.productId] : [])))];
  const pisos = new Map<string, Money | null>();
  if (productos.length > 0) {
    const hoy = new Date();
    const conPrecio = await prisma.product.findMany({
      where: { id: { in: productos } },
      select: {
        id: true,
        prices: {
          where: { validFrom: { lte: hoy }, validTo: { gte: hoy } },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { minPrice: true },
        },
      },
    });
    for (const p of conPrecio) pisos.set(p.id, p.prices[0]?.minPrice ?? null);
  }

  const pendientes: { id: string; data: LineaParaCalcular; auditadas: LineaAuditada[] }[] = [];

  for (const cambio of cambios) {
    const actual = porId.get(cambio.lineId);
    if (!actual) return falla("VALIDACION", "Alguna de esas líneas ya no existe.");

    const nueva: LineaParaCalcular = {
      quantity: cambio.campos.quantity !== undefined ? money(cambio.campos.quantity) : actual.quantity,
      unitPrice: cambio.campos.unitPrice !== undefined ? money(cambio.campos.unitPrice) : actual.unitPrice,
      discountRate:
        cambio.campos.discountRate !== undefined ? money(cambio.campos.discountRate) : actual.discountRate,
      unitCost: cambio.campos.unitCost !== undefined ? money(cambio.campos.unitCost) : actual.unitCost,
    };

    const auditadas: LineaAuditada[] = CAMPOS_EDITABLES.filter(
      (campo) => cambio.campos[campo] !== undefined && !nueva[campo].eq(actual[campo]),
    ).map((campo) => ({
      descripcion: actual.description,
      campo,
      de: pintar(campo, actual[campo]),
      a: pintar(campo, nueva[campo]),
    }));
    if (auditadas.length === 0) continue;

    const invalida = validarCantidadYDescuento(nueva.quantity, nueva.discountRate);
    if (invalida) return invalida;
    if (nueva.unitPrice.lte(0)) {
      return falla("VALIDACION", { campo: "unitPrice", mensaje: "El precio tiene que ser mayor que cero." });
    }
    if (nueva.unitCost.lt(0)) {
      return falla("VALIDACION", { campo: "unitCost", mensaje: "El costo no puede ser negativo." });
    }

    // RN-08 · el piso es del SKU, y se revisa contra el precio que quede.
    const problema = validarPisoDePrecio({
      descripcion: actual.description,
      unitPrice: nueva.unitPrice,
      discountRate: nueva.discountRate,
      minPrice: actual.productId ? (pisos.get(actual.productId) ?? null) : null,
    });
    if (problema) return falla("VALIDACION", { campo: "unitPrice", mensaje: problema });

    pendientes.push({ id: actual.id, data: nueva, auditadas });
  }

  void umbrales; // RN-05 señala en la pantalla; aquí no bloquea (sin autorizaciones).

  const todas = pendientes.flatMap((p) => p.auditadas);
  if (todas.length === 0) return ok({ cambios: 0 });

  await auditedTransaction(async (tx, audit) => {
    const antes = await netoActual(tx, cotizacion.id);
    await Promise.all(pendientes.map((p) => tx.quoteLine.update({ where: { id: p.id }, data: p.data })));
    const despues = await recalcularYEspejar(tx, cotizacion.id);
    await audit({
      entity: "Quote",
      entityId: cotizacion.id,
      action: "EDITAR_COTIZACION",
      byUserId: session.userId,
      before: { netSubtotal: antes.toFixed(4) },
      after: { netSubtotal: despues.toFixed(4), lineas: todas },
    });
  });

  return ok({ cambios: todas.length });
}

/** Cómo se anota un valor en la bitácora: el descuento como porcentaje, lo demás tal cual. */
function pintar(campo: (typeof CAMPOS_EDITABLES)[number], v: Money): string {
  return campo === "discountRate" ? v.times(100).toFixed(2).replace(/\.?0+$/, "") : v.toString();
}

export async function quitarLinea(
  session: Session,
  cotizacion: CotizacionConLineas,
  lineId: string,
): Promise<ResultadoAccion> {
  const bloqueada = editable(cotizacion);
  if (bloqueada) return bloqueada;

  const linea = cotizacion.lines.find((l) => l.id === lineId);
  if (!linea) return falla("VALIDACION", "Esa línea no es de esta cotización.");

  await auditedTransaction(async (tx, audit) => {
    const antes = await netoActual(tx, cotizacion.id);
    await tx.quoteLine.deleteMany({ where: { id: lineId, quoteId: cotizacion.id } });
    const despues = await recalcularYEspejar(tx, cotizacion.id);
    await anotar(audit, session, cotizacion.id, antes, despues, {
      descripcion: linea.description,
      baja: true,
    });
  });

  return ok(null);
}

/** Los tipos que la pantalla necesita, derivados y no repetidos a mano. */
export type LineaDeCotizacion = CotizacionConLineas["lines"][number] & Partial<LineaParaCalcular>;
