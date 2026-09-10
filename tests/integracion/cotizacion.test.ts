import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { crearOportunidad } from "@/lib/domain/opportunity";
import {
  borradorDeCotizacion,
  congelarCotizacion,
  guardarLinea,
  nuevaVersion,
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
});

afterAll(async () => {
  if (!oportunidades.length) return;
  const quotes = await prisma.quote.findMany({
    where: { opportunityId: { in: oportunidades } },
    select: { id: true },
  });
  await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
  await prisma.quote.deleteMany({ where: { opportunityId: { in: oportunidades } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: oportunidades } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: oportunidades } } });
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
  const borrador = await borradorDeCotizacion(jorge, detalle!, pais.taxRate);
  if (!borrador.ok) throw new Error("no se pudo abrir el borrador");

  return { opportunityId: creada.datos.id, quoteId: borrador.datos.id };
}

const UMBRALES = { lineMarginFloor: "0.10" };

describe("borradorDeCotizacion · RN-24 y AC-11", () => {
  it("abre la v1 y copia la tasa de impuesto del país", async () => {
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

  it("llamarlo dos veces devuelve el mismo borrador, no abre otro", async () => {
    const { opportunityId, quoteId } = await unaOportunidadConBorrador();
    const detalle = await getOpportunityDetail(jorge, opportunityId);
    const pais = await getCountry("MX");
    const otra = await borradorDeCotizacion(jorge, detalle!, pais.taxRate);
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

describe("congelar y versionar · INV-06 y AC-10", () => {
  async function conUnaLinea() {
    const { opportunityId, quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "4", discountRate: "0" },
      UMBRALES,
    );
    return { opportunityId, quoteId };
  }

  it("congelar sella quién y cuándo, y espeja el neto en la oportunidad", async () => {
    const { opportunityId, quoteId } = await conUnaLinea();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await congelarCotizacion(jorge, cotizacion!);
    expect(r.ok).toBe(true);

    const q = await prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: { status: true, frozenAt: true, frozenById: true, netSubtotal: true, grossMargin: true },
    });
    expect(q.status).toBe("CONGELADA");
    expect(q.frozenById).toBe(jorge.userId);
    expect(q.frozenAt).not.toBeNull();

    // El esquema lo dice: `amount` es espejo de la cotización activa. Sin esto
    // el kanban seguiría mostrando el estimado y las banderas de riesgo
    // calcularían sobre un margen que no existe.
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      select: { amount: true, grossMargin: true },
    });
    expect(o.amount.toString()).toBe(q.netSubtotal.toString());
    expect(o.grossMargin?.toString()).toBe(q.grossMargin.toString());
  });

  it("no se congela una cotización sin líneas", async () => {
    const { quoteId } = await unaOportunidadConBorrador();
    const cotizacion = await getCotizacion(jorge, quoteId);
    const r = await congelarCotizacion(jorge, cotizacion!);
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("AC-10 · editar una línea de la congelada falla", async () => {
    const { quoteId } = await conUnaLinea();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await congelarCotizacion(jorge, cotizacion!);

    cotizacion = await getCotizacion(jorge, quoteId);
    const r = await guardarLinea(
      jorge,
      cotizacion!,
      { productId: productoId, quantity: "9", discountRate: "0" },
      UMBRALES,
    );
    expect(r).toMatchObject({ motivo: "CONFLICTO" });
  });

  it("AC-10 · la versión siguiente funciona y la anterior queda REEMPLAZADA", async () => {
    const { opportunityId, quoteId } = await conUnaLinea();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await congelarCotizacion(jorge, cotizacion!);

    cotizacion = await getCotizacion(jorge, quoteId);
    const r = await nuevaVersion(jorge, cotizacion!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const versiones = await prisma.quote.findMany({
      where: { opportunityId },
      orderBy: { version: "asc" },
      select: { version: true, status: true, netSubtotal: true, _count: { select: { lines: true } } },
    });
    expect(versiones).toHaveLength(2);
    expect(versiones[0]).toMatchObject({ version: 1, status: "REEMPLAZADA" });
    expect(versiones[1]).toMatchObject({ version: 2, status: "BORRADOR" });
    // La v2 nace con las líneas de la v1: se edita a partir de lo que había,
    // no desde cero.
    expect(versiones[1]!._count.lines).toBe(versiones[0]!._count.lines);
    expect(versiones[1]!.netSubtotal.toString()).toBe(versiones[0]!.netSubtotal.toString());
  });

  it("la v2 conserva la tasa de la v1, no la del país de hoy · RN-24", async () => {
    const { quoteId } = await conUnaLinea();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await congelarCotizacion(jorge, cotizacion!);

    await prisma.country.update({ where: { code: "MX" }, data: { taxRate: "0.18" } });
    try {
      cotizacion = await getCotizacion(jorge, quoteId);
      const r = await nuevaVersion(jorge, cotizacion!);
      if (!r.ok) return;
      const v2 = await prisma.quote.findUniqueOrThrow({
        where: { id: r.datos.id },
        select: { taxRate: true },
      });
      expect(v2.taxRate.toString()).toBe("0.16");
    } finally {
      await prisma.country.update({ where: { code: "MX" }, data: { taxRate: "0.16" } });
    }
  });

  it("no se abre una segunda versión mientras haya un borrador", async () => {
    const { quoteId } = await conUnaLinea();
    let cotizacion = await getCotizacion(jorge, quoteId);
    await congelarCotizacion(jorge, cotizacion!);

    cotizacion = await getCotizacion(jorge, quoteId);
    await nuevaVersion(jorge, cotizacion!);

    cotizacion = await getCotizacion(jorge, quoteId);
    const otra = await nuevaVersion(jorge, cotizacion!);
    expect(otra).toMatchObject({ motivo: "CONFLICTO" });
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
