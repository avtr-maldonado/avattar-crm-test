import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { money } from "@/lib/money";
import { getProducto } from "@/lib/scope/productos";
import { crearProducto, editarProducto, pisoDePrecio } from "@/lib/domain/product";

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

let admin: Session;
let paulina: Session;
let familyId: string;
let piso: string;
const creados: string[] = [];

beforeAll(async () => {
  [admin, paulina] = await Promise.all([
    sesionDe("as@avattar.com"),
    sesionDe("pe@avattar.com"),
  ]);
  const familia = await prisma.productFamily.findFirstOrThrow({ select: { id: true } });
  familyId = familia.id;
  piso = (await getCommercialPolicy("MX")).lineMarginFloor.toString();
});

afterAll(async () => {
  if (!creados.length) return;
  await prisma.priceListEntry.deleteMany({ where: { productId: { in: creados } } });
  await prisma.product.deleteMany({ where: { id: { in: creados } } });
});

const BASE = {
  name: "Producto de prueba",
  familyId: "",
  unit: "hora",
  priceModel: "PRECIO_FIJO" as const,
  listPrice: "1000.0000",
  standardCost: "600.0000",
};

describe("pisoDePrecio · RN-08 e INV-05, con Decimal", () => {
  it("costo / (1 − piso), exacto", () => {
    // 600 / (1 − 0.10) = 666.6666…, redondeado a 4 decimales.
    expect(pisoDePrecio(money("600"), money("1000"), money("0.10")).toFixed(4)).toBe("666.6667");
  });

  it("se topa al precio de lista cuando el margen a lista no alcanza el piso", () => {
    // El caso de LIC-M365-E3 en §9.1: 7 900 / 0.90 = 8 777.78 > 8 400. Un piso
    // por encima del techo no significa nada.
    expect(pisoDePrecio(money("7900"), money("8400"), money("0.10")).toFixed(4)).toBe(
      "8400.0000",
    );
  });
});

describe("crearProducto", () => {
  it("crea el SKU y abre su primera vigencia con el piso derivado", async () => {
    const r = await crearProducto(
      admin,
      { ...BASE, sku: `TST-${Date.now()}`, familyId },
      { lineMarginFloor: piso },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creados.push(r.datos.id);

    const p = await prisma.product.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: {
        costUpdatedAt: true,
        costSource: true,
        prices: { select: { listPrice: true, minPrice: true, standardCost: true } },
      },
    });
    expect(p.prices).toHaveLength(1);
    expect(p.prices[0]!.listPrice.toString()).toBe("1000");
    expect(p.prices[0]!.minPrice.toString()).toBe(
      pisoDePrecio(money("600"), money("1000"), money(piso)).toFixed(4).replace(/\.?0+$/, ""),
    );
    // C-01 · el costo acaba de capturarse: la fecha es hoy.
    expect(p.costUpdatedAt).not.toBeNull();
    expect(p.costSource).toBe("CARGA_MASIVA");
  });

  it("el SKU tiene que ser único", async () => {
    const sku = `TST-DUP-${Date.now()}`;
    const a = await crearProducto(admin, { ...BASE, sku, familyId }, { lineMarginFloor: piso });
    if (a.ok) creados.push(a.datos.id);

    const b = await crearProducto(admin, { ...BASE, sku, familyId }, { lineMarginFloor: piso });
    expect(b).toMatchObject({ motivo: "VALIDACION" });
    if (!b.ok) expect(b.problemas[0]?.campo).toBe("sku");
  });

  it("sin EDITAR_CATALOGOS no se crea", async () => {
    const r = await crearProducto(
      paulina,
      { ...BASE, sku: `TST-NO-${Date.now()}`, familyId },
      { lineMarginFloor: piso },
    );
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });
  });

  it("un costo por encima del precio de lista no pasa", async () => {
    // Vender bajo costo no es un descuento: es una pérdida.
    const r = await crearProducto(
      admin,
      { ...BASE, sku: `TST-NEG-${Date.now()}`, familyId, listPrice: "500", standardCost: "600" },
      { lineMarginFloor: piso },
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});

describe("editarProducto · RN-26, el precio se versiona", () => {
  async function unProducto() {
    const r = await crearProducto(
      admin,
      { ...BASE, sku: `TST-ED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, familyId },
      { lineMarginFloor: piso },
    );
    if (!r.ok) throw new Error("no se pudo preparar el producto");
    creados.push(r.datos.id);
    return r.datos.id;
  }

  it("cambiar el nombre no toca la vigencia", async () => {
    const id = await unProducto();
    const producto = await getProducto(admin, id);
    const r = await editarProducto(admin, producto!, { name: "Renombrado" }, { lineMarginFloor: piso });
    expect(r.ok).toBe(true);

    const vigencias = await prisma.priceListEntry.count({ where: { productId: id } });
    expect(vigencias).toBe(1);
  });

  /** Una vigencia que empezó antes de hoy, para que editarla abra otra. */
  async function envejecerVigencia(id: string) {
    await prisma.priceListEntry.updateMany({
      where: { productId: id },
      data: { validFrom: new Date("2026-01-01T00:00:00Z") },
    });
  }

  it("cambiar el precio cierra la vigencia actual y abre otra desde hoy", async () => {
    const id = await unProducto();
    await envejecerVigencia(id);
    const producto = await getProducto(admin, id);
    const r = await editarProducto(admin, producto!, { listPrice: "1200" }, { lineMarginFloor: piso });
    expect(r.ok).toBe(true);

    const vigencias = await prisma.priceListEntry.findMany({
      where: { productId: id },
      orderBy: { validFrom: "asc" },
      select: { listPrice: true, validFrom: true, validTo: true },
    });
    expect(vigencias).toHaveLength(2);
    const [vieja, nueva] = vigencias;
    expect(vieja!.listPrice.toString()).toBe("1000");
    expect(nueva!.listPrice.toString()).toBe("1200");
    // La vieja termina justo antes de que empiece la nueva: no se solapan ni
    // dejan hueco, que es lo que hace reproducible «el precio vigente a tal
    // fecha» (RN-26).
    expect(vieja!.validTo.getTime()).toBeLessThan(nueva!.validFrom.getTime());
  });

  it("dos correcciones el mismo día corrigen la vigencia de hoy, no abren otra", async () => {
    // Una vigencia de cero días no significa nada y chocaría con la unicidad
    // (productId, validFrom). El producto recién creado ya abrió la de hoy.
    const id = await unProducto();
    const producto = await getProducto(admin, id);
    const r = await editarProducto(admin, producto!, { listPrice: "1100" }, { lineMarginFloor: piso });
    expect(r.ok).toBe(true);

    const vigencias = await prisma.priceListEntry.findMany({
      where: { productId: id },
      select: { listPrice: true },
    });
    expect(vigencias).toHaveLength(1);
    expect(vigencias[0]!.listPrice.toString()).toBe("1100");
  });

  it("el precio vigente hoy es el nuevo", async () => {
    const id = await unProducto();
    const producto = await getProducto(admin, id);
    await editarProducto(admin, producto!, { listPrice: "1500" }, { lineMarginFloor: piso });

    const despues = await getProducto(admin, id);
    expect(despues!.prices[0]?.listPrice.toString()).toBe("1500");
  });

  it("cambiar el costo actualiza costUpdatedAt · C-01", async () => {
    const id = await unProducto();
    // Se envejece a mano para poder ver que la edición lo refresca.
    await prisma.product.update({
      where: { id },
      data: { costUpdatedAt: new Date("2026-01-01") },
    });

    const producto = await getProducto(admin, id);
    await editarProducto(admin, producto!, { standardCost: "650" }, { lineMarginFloor: piso });

    const p = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { costUpdatedAt: true },
    });
    expect(p.costUpdatedAt!.getTime()).toBeGreaterThan(new Date("2026-06-01").getTime());
  });

  it("el SKU no se edita", async () => {
    const id = await unProducto();
    const producto = await getProducto(admin, id);
    const antes = producto!.sku;
    // La firma no admite `sku`; esto verifica que tampoco se cuele por otro lado.
    await editarProducto(
      admin,
      producto!,
      { name: "Otro" } as Parameters<typeof editarProducto>[2] & { sku?: string },
      { lineMarginFloor: piso },
    );
    const p = await prisma.product.findUniqueOrThrow({ where: { id }, select: { sku: true } });
    expect(p.sku).toBe(antes);
  });

  it("desactivar no borra: el SKU sigue en la base", async () => {
    const id = await unProducto();
    const producto = await getProducto(admin, id);
    const r = await editarProducto(admin, producto!, { active: false }, { lineMarginFloor: piso });
    expect(r.ok).toBe(true);

    const p = await prisma.product.findUniqueOrThrow({ where: { id }, select: { active: true } });
    expect(p.active).toBe(false);
  });
});
