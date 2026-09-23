import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { crearOportunidad } from "@/lib/domain/opportunity";
import {
  abrirCotizacion,
  guardarCambiosDeCotizacion,
  guardarLinea,
  quitarLinea,
} from "@/lib/domain/quoteService";

async function sesionDe(correo: string): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  const permisos = await prisma.rolePermission.findMany({
    where: { role: u.role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos.map((p) => p.permission.code)),
    limits: Object.fromEntries(
      permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null]),
    ),
  };
}

let jorge: Session;
let paulina: Session;
let productoId: string;
let sinListaId: string;
const oportunidades: string[] = [];

beforeAll(async () => {
  [jorge, paulina] = await Promise.all([
    sesionDe("jm@avattar.com"),
    sesionDe("pe@avattar.com"),
  ]);
  const p = await prisma.product.findFirstOrThrow({
    where: { active: true, prices: { some: {} } },
    select: { id: true },
  });
  productoId = p.id;

  // Un producto sin lista: precio y costo se fijan en cada cotización.
  const familia = await prisma.productFamily.findFirstOrThrow({ select: { id: true } });
  const sinLista = await prisma.product.create({
    data: {
      sku: `TST-SL-${Date.now()}`,
      name: "Servicio a medida",
      familyId: familia.id,
      unit: "servicio",
      priceModel: "PRECIO_FIJO",
    },
    select: { id: true },
  });
  sinListaId = sinLista.id;
});

afterAll(async () => {
  if (!oportunidades.length) return;
  const quotes = await prisma.quote.findMany({
    where: { opportunityId: { in: oportunidades } },
    select: { id: true },
  });
  await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: quotes.map((q) => q.id) } } });
  await prisma.quote.deleteMany({ where: { opportunityId: { in: oportunidades } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: oportunidades } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: oportunidades } } });
  await prisma.product.deleteMany({ where: { id: sinListaId } });
});

async function unaOportunidadConBorrador() {
  const [organizacion, pipeline, politica] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null },
      select: { id: true },
    }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
    getCommercialPolicy("MX"),
  ]);

  const creada = await crearOportunidad(
    jorge,
    {
      name: `Cotización · ${Math.random().toString(36).slice(2, 8)}`,
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "50000.0000",
      expectedCloseDate: new Date("2026-12-31"),
      businessType: "NUEVO",
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!creada.ok) throw new Error("no se pudo preparar la oportunidad");
  oportunidades.push(creada.datos.id);

  const detalle = await getOpportunityDetail(jorge, creada.datos.id);
  const pais = await getCountry("MX");
  const borrador = await abrirCotizacion(jorge, detalle!, pais.taxRate);
  if (!borrador.ok) throw new Error("no se pudo abrir la cotización");

  return { opportunityId: creada.datos.id, quoteId: borrador.datos.id };
}

const UMBRALES = { lineMarginFloor: "0.10" };

describe("abrirCotizacion · RN-24 y AC-11", () => {
  it("abre la cotización y copia la tasa de impuesto del país", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const q = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { version: true, status: true, taxRate: true, currency: true },
    });
    expect(q.version).toBe(1);
    expect(q.status).toBe("BORRADOR");
    expect(q.taxRate.toString()).toBe("0.16");
    // D-A · monomoneda.
    expect(q.currency).toBe("USD");
  });

  it("AC-11 · cambiar Country.taxRate no altera una cotización existente", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const antes = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { taxRate: true },
    });

    await prisma.country.update({ where: { code: "MX" }, data: { taxRate: "0.18" } });
    try {
      const despues = await prisma.quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: { taxRate: true },
      });
      expect(despues.taxRate.toString()).toBe(antes.taxRate.toString());
    } finally {
      await prisma.country.update({ where: { code: "MX" }, data: { taxRate: "0.16" } });
    }
  });

  it("llamarlo dos veces devuelve la misma cotización: no hay versiones", async () => {
    const { opportunityId, quoteId } = await unaOportunidadConBorrador();
    const detalle = await getOpportunityDetail(jorge, opportunityId);
    const pais = await getCountry("MX");
    const otra = await abrirCotizacion(jorge, detalle!, pais.taxRate);
    expect(otra.ok && otra.datos.id).toBe(quoteId);
  });
});

describe("guardarLinea · el costo lo pone el servidor", () => {
  it("toma precio y costo de la lista vigente del producto", async () => {
    // El cliente no manda el costo. Si lo mandara, un vendedor sin VER_COSTO
    // podría inyectarlo, o deducirlo probando valores hasta que cuadre el
    // margen.
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "10", discountRate: "0" },
      UMBRALES,
    );
    expect(r.ok).toBe(true);

    const vigente = await prisma.priceListEntry.findFirstOrThrow({
      where: { productId: productoId },
      orderBy: { validFrom: "desc" },
      select: { listPrice: true, standardCost: true },
    });
    const linea = await prisma.quoteLine.findFirstOrThrow({
      where: { quoteId },
      select: { unitPrice: true, unitCost: true, description: true },
    });
    expect(linea.unitPrice.toString()).toBe(vigente.listPrice.toString());
    expect(linea.unitCost.toString()).toBe(vigente.standardCost.toString());
  });

  it("recalcula y persiste los totales en cada cambio", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "10", discountRate: "0" },
      UMBRALES,
    );

    const q = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { netSubtotal: true, totalCost: true, grossProfit: true, taxAmount: true, total: true },
    });
    const vigente = await prisma.priceListEntry.findFirstOrThrow({
      where: { productId: productoId },
      orderBy: { validFrom: "desc" },
      select: { listPrice: true, standardCost: true },
    });

    expect(q.netSubtotal.toString()).toBe(vigente.listPrice.times(10).toString());
    expect(q.totalCost.toString()).toBe(vigente.standardCost.times(10).toString());
    expect(q.grossProfit.toString()).toBe(q.netSubtotal.minus(q.totalCost).toString());
    expect(q.total.toString()).toBe(q.netSubtotal.plus(q.taxAmount).toString());
  });

  it("AC-07 · un descuento bajo el piso no se guarda y el error nombra el piso", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "5", discountRate: "0.95" },
      UMBRALES,
    );

    expect(r).toMatchObject({ motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.mensaje).toMatch(/piso/i);
    expect(await prisma.quoteLine.count({ where: { quoteId } })).toBe(0);
  });

  it("un concepto libre exige costo, porque no viene de la lista · Q-07", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);

    const sinCosto = await guardarLinea(
      jorge,
      cotizacion!,
      { description: "Bolsa de horas", unit: "hora", quantity: "40", unitPrice: "1200", discountRate: "0" },
      UMBRALES,
    );
    expect(sinCosto).toMatchObject({ motivo: "VALIDACION" });

    const conCosto = await guardarLinea(
      jorge,
      cotizacion!,
      {
        description: "Bolsa de horas",
        unit: "hora",
        quantity: "40",
        unitPrice: "1200",
        unitCost: "700",
        discountRate: "0",
      },
      UMBRALES,
    );
    expect(conCosto.ok).toBe(true);
  });

  it("un vendedor sin VER_COSTO no puede capturar el costo de un concepto libre", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    // Paulina no alcanza esta oportunidad, así que se prueba el permiso en el
    // servicio con la cotización ya cargada por Jorge.
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarLinea(
      paulina,
      cotizacion!,
      { description: "Libre", unit: "hora", quantity: "1", unitPrice: "100", unitCost: "50", discountRate: "0" },
      UMBRALES,
    );
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });
  });

  it("quitar una línea recalcula los totales", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "3", discountRate: "0" },
      UMBRALES,
    );

    cotizacion = await getCotizacion(jorge, quoteId);
    const linea = await prisma.quoteLine.findFirstOrThrow({ where: { quoteId }, select: { id: true } });
    const r = await quitarLinea(jorge, cotizacion!, linea.id);
    expect(r.ok).toBe(true);

    const q = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { netSubtotal: true, total: true },
    });
    expect(q.netSubtotal.toString()).toBe("0");
    expect(q.total.toString()).toBe("0");
  });
});

describe("una sola cotización, editable, con bitácora · INV-06 enmendado (decisiones §21)", () => {
  async function conUnaLinea(session = jorge) {
    const { opportunityId, quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(session, quoteId);
    await guardarLinea(
      session,
      cotizacion!,
      { productId: productoId, quantity: "4", discountRate: "0" },
      UMBRALES,
    );
    const linea = await prisma.quoteLine.findFirstOrThrow({ where: { quoteId }, select: { id: true } });
    return { opportunityId, quoteId, lineId: linea.id };
  }

  async function precioVigente() {
    return prisma.priceListEntry.findFirstOrThrow({
      where: { productId: productoId },
      orderBy: { validFrom: "desc" },
      select: { listPrice: true, minPrice: true, standardCost: true },
    });
  }

  async function entradasDeBitacora(quoteId: string) {
    return prisma.auditLog.count({
      where: { entity: "Quote", entityId: quoteId, action: "EDITAR_COTIZACION" },
    });
  }

  it("guardar sin cambiar nada no escribe nada: ni totales, ni espejo, ni bitácora", async () => {
    // Abrir la edición y guardar tal cual no es un cambio. Anotarlo llenaría
    // la bitácora de ruido y la volvería inútil para lo que existe.
    const { quoteId, lineId } = await conUnaLinea();
    const antes = await entradasDeBitacora(quoteId);

    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [{ lineId, campos: { quantity: "4", discountRate: "0" } }],
      UMBRALES,
    );

    expect(r).toMatchObject({ ok: true, datos: { cambios: 0 } });
    expect(await entradasDeBitacora(quoteId)).toBe(antes);
  });

  it("guardar una cantidad distinta recalcula los totales y espeja el neto en la oportunidad", async () => {
    const { opportunityId, quoteId, lineId } = await conUnaLinea();
    const antes = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { netSubtotal: true },
    });

    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [{ lineId, campos: { quantity: "8" } }],
      UMBRALES,
    );
    expect(r).toMatchObject({ ok: true, datos: { cambios: 1 } });

    const despues = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { netSubtotal: true, grossMargin: true },
    });
    expect(despues.netSubtotal.toString()).toBe(antes.netSubtotal.times(2).toString());

    // `amount` es espejo de la cotización, en cada guardado.
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      select: { amount: true, grossMargin: true },
    });
    expect(o.amount.toString()).toBe(despues.netSubtotal.toString());
    expect(o.grossMargin?.toString()).toBe(despues.grossMargin.toString());
  });

  it("varios cambios en un guardado son UNA entrada en la bitácora, con cada línea y campo", async () => {
    const { quoteId, lineId } = await conUnaLinea();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await guardarLinea(
      jorge,
      cotizacion!,
      { description: "Bolsa de horas", unit: "hora", quantity: "10", unitPrice: "1000", unitCost: "600", discountRate: "0" },
      UMBRALES,
    );
    const segunda = await prisma.quoteLine.findFirstOrThrow({
      where: { quoteId, description: "Bolsa de horas" },
      select: { id: true },
    });
    const antes = await entradasDeBitacora(quoteId);
    const netoAntes = (await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { netSubtotal: true } })).netSubtotal;

    cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [
        { lineId, campos: { quantity: "6", discountRate: "0.1000" } },
        { lineId: segunda.id, campos: { quantity: "12", unitPrice: "1000" } },
      ],
      UMBRALES,
    );
    expect(r).toMatchObject({ ok: true, datos: { cambios: 3 } });
    expect(await entradasDeBitacora(quoteId)).toBe(antes + 1);

    const registro = await prisma.auditLog.findFirstOrThrow({
      where: { entity: "Quote", entityId: quoteId, action: "EDITAR_COTIZACION" },
      orderBy: { at: "desc" },
      select: { before: true, after: true },
    });
    expect(registro.before).toMatchObject({ netSubtotal: netoAntes.toFixed(4) });
    const despues = registro.after as { lineas: { campo: string; de: string; a: string }[] };
    expect(despues.lineas.map((l) => l.campo).sort()).toEqual(["discountRate", "quantity", "quantity"]);
    expect(despues.lineas.find((l) => l.campo === "discountRate")).toMatchObject({ de: "0", a: "10" });
  });

  it("el precio unitario se puede cambiar, pero no por debajo del piso del SKU · RN-08", async () => {
    const { quoteId, lineId } = await conUnaLinea();
    const precio = await precioVigente();

    let cotizacion = await getCotizacion(jorge, quoteId);
    const sube = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [{ lineId, campos: { unitPrice: precio.listPrice.plus(100).toString() } }],
      UMBRALES,
    );
    expect(sube.ok).toBe(true);
    const l = await prisma.quoteLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { unitPrice: true, productId: true, quantity: true },
    });
    expect(l.unitPrice.toString()).toBe(precio.listPrice.plus(100).toString());
    // Sigue siendo la línea de ese producto: cambiar el precio no la vuelve concepto libre.
    expect(l.productId).toBe(productoId);

    // Todo o nada: el precio bajo el piso tumba el guardado entero, también la cantidad.
    cotizacion = await getCotizacion(jorge, quoteId);
    const baja = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [{ lineId, campos: { unitPrice: precio.minPrice.minus(1).toString(), quantity: "9" } }],
      UMBRALES,
    );
    expect(baja).toMatchObject({ ok: false, motivo: "VALIDACION" });
    const intacta = await prisma.quoteLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { quantity: true },
    });
    expect(intacta.quantity.toString()).toBe(l.quantity.toString());
  });

  it("el costo se fija con VER_COSTO; sin el permiso no se acepta · INV-02", async () => {
    const { quoteId, lineId } = await conUnaLinea();

    let cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarCambiosDeCotizacion(
      jorge,
      cotizacion!,
      [{ lineId, campos: { unitCost: "123" } }],
      UMBRALES,
    );
    expect(r.ok).toBe(true);
    const l = await prisma.quoteLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { unitCost: true },
    });
    expect(Number(l.unitCost)).toBe(123);

    // Paulina no ve costos: tampoco los fija. Se prueba con la cotización que
    // cargó Jorge, igual que en el concepto libre.
    cotizacion = await getCotizacion(jorge, quoteId);
    const negado = await guardarCambiosDeCotizacion(
      paulina,
      cotizacion!,
      [{ lineId, campos: { unitCost: "1" } }],
      UMBRALES,
    );
    expect(negado).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("al agregar del catálogo, precio y costo son referencia: se pueden fijar distintos", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const precio = await precioVigente();
    const cotizacion = await getCotizacion(jorge, quoteId);

    const r = await guardarLinea(
      jorge,
      cotizacion!,
      {
        productId: productoId,
        quantity: "2",
        discountRate: "0",
        unitPrice: precio.listPrice.plus(50).toString(),
        unitCost: precio.standardCost.plus(5).toString(),
      },
      UMBRALES,
    );
    expect(r.ok).toBe(true);

    const l = await prisma.quoteLine.findFirstOrThrow({
      where: { quoteId },
      select: { unitPrice: true, unitCost: true, productId: true },
    });
    expect(l.unitPrice.toString()).toBe(precio.listPrice.plus(50).toString());
    expect(l.unitCost.toString()).toBe(precio.standardCost.plus(5).toString());
    expect(l.productId).toBe(productoId);
  });

  it("quitar la única línea devuelve el importe de la oportunidad al estimado", async () => {
    // Con cero líneas la cotización no dice nada: el kanban debe volver a
    // enseñar el estimado y no un cero.
    const { opportunityId, quoteId, lineId } = await conUnaLinea();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await quitarLinea(jorge, cotizacion!, lineId);
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      select: { amount: true, estimatedAmount: true, grossMargin: true },
    });
    expect(o.amount.toString()).toBe(o.estimatedAmount.toString());
    expect(o.grossMargin).toBeNull();
  });
});

describe("INV-02 · AC-03 sobre datos reales", () => {
  it("la cotización de un vendedor no serializa costo ni utilidad", async () => {
    // El diseño de E0/E1 decía que AC-03 se probaría «sobre el JSON serializado
    // de la cotización que trae el seed». El seed no traía ninguna: hasta ahora
    // solo se probaba la FORMA del selector, nunca una fila real.
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "2", discountRate: "0" },
      UMBRALES,
    );

    const conCosto = JSON.stringify(await getCotizacion(jorge, quoteId));
    expect(conCosto).toContain("unitCost");
    expect(conCosto).toContain("totalCost");

    const sinCosto = JSON.stringify(await getCotizacion(paulina, quoteId, { forzarAlcance: false }));
    expect(sinCosto).not.toContain("unitCost");
    expect(sinCosto).not.toContain("totalCost");
    expect(sinCosto).not.toContain("grossProfit");
    // RN-09 · el margen es permiso aparte, y el vendedor sí lo tiene.
    expect(sinCosto).toContain("grossMargin");
  });
});

describe("producto sin lista · precio y costo por oportunidad", () => {
  it("sin precio en la línea la rechaza y dice que aquí se fija", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarLinea(
      jorge,
      cotizacion!,
      { productId: sinListaId, quantity: "1", discountRate: "0" },
      UMBRALES,
    );
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("unitPrice");
  });

  it("con precio y costo capturados la línea nace con ellos y sin piso de SKU", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    // 50 % de descuento: con lista habría piso RN-08; sin lista no hay contra qué.
    const r = await guardarLinea(
      jorge,
      cotizacion!,
      { productId: sinListaId, quantity: "2", discountRate: "0.5", unitPrice: "1000", unitCost: "400" },
      UMBRALES,
    );
    expect(r.ok).toBe(true);

    const linea = await prisma.quoteLine.findFirstOrThrow({
      where: { quoteId, productId: sinListaId },
      select: { unitPrice: true, unitCost: true, description: true },
    });
    expect(linea.unitPrice.toString()).toBe("1000");
    expect(linea.unitCost.toString()).toBe("400");
    expect(linea.description).toBe("Servicio a medida");
  });
});
