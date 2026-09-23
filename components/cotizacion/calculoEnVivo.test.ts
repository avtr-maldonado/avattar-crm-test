import { describe, expect, it } from "vitest";
import { calcularLinea, calcularTotales, lineasBajoElPiso } from "@/lib/domain/quote";
import { formatPercent, formatUSD, money, toClient } from "@/lib/money";
import { calcularEnVivo } from "./calculoEnVivo";

/**
 * Paridad con el dominio.
 *
 * El cálculo en vivo corre en el navegador con `decimal.js`; el que se guarda
 * corre en el servidor con `Prisma.Decimal` (`lib/domain/quote.ts`). Son la
 * misma librería, pero dos módulos: esta prueba es lo que impide que un día
 * digan cifras distintas. Compara **las cadenas formateadas**, que es lo que la
 * persona ve.
 */

/** El escenario aprobado de RN-07: 18 000 × 20 con 10 %, costo 9 500. */
const LINEAS = [
  { id: "a", cantidad: "20", precioUnitario: "18000", descuentoPct: "10", costoUnitario: "9500" },
  { id: "b", cantidad: "40", precioUnitario: "1200", descuentoPct: "20", costoUnitario: "900" },
  { id: "c", cantidad: "3", precioUnitario: "25000.5", descuentoPct: "5.5", costoUnitario: "17000" },
];

const DOMINIO = LINEAS.map((l) => ({
  quantity: money(l.cantidad),
  unitPrice: money(l.precioUnitario),
  discountRate: money(l.descuentoPct).div(100),
  unitCost: money(l.costoUnitario),
}));

const PARAMETROS = { taxRate: "0.16", pisoDeLinea: "0.10", verCosto: true, verMargen: true };

describe("calcularEnVivo · paridad con lib/domain/quote", () => {
  it("cada línea coincide con calcularLinea, ya formateada", () => {
    const vivo = calcularEnVivo(LINEAS, PARAMETROS);
    for (const [i, l] of DOMINIO.entries()) {
      const c = calcularLinea(l);
      expect(vivo.lineas[i]!.precioNeto).toBe(formatUSD(c.neto));
      expect(vivo.lineas[i]!.importe).toBe(formatUSD(c.importe));
      expect(vivo.lineas[i]!.utilidad).toBe(formatUSD(c.utilidad));
      expect(vivo.lineas[i]!.margen).toBe(formatPercent(toClient(c.margen)));
    }
  });

  it("los totales coinciden con calcularTotales", () => {
    const vivo = calcularEnVivo(LINEAS, PARAMETROS);
    const t = calcularTotales(DOMINIO, money("0.16"));
    expect(vivo.totales.grossSubtotal).toBe(formatUSD(t.grossSubtotal));
    expect(vivo.totales.descuento).toBe(formatUSD(t.descuento));
    expect(vivo.totales.descuentoPct).toBe(formatPercent(toClient(t.discountRate)));
    expect(vivo.totales.netSubtotal).toBe(formatUSD(t.netSubtotal));
    expect(vivo.totales.taxAmount).toBe(formatUSD(t.taxAmount));
    expect(vivo.totales.total).toBe(formatUSD(t.total));
    expect(vivo.totales.totalCost).toBe(formatUSD(t.totalCost));
    expect(vivo.totales.grossProfit).toBe(formatUSD(t.grossProfit));
    expect(vivo.totales.grossMargin).toBe(formatPercent(toClient(t.grossMargin)));
  });

  it("señala bajo el piso las mismas líneas que lineasBajoElPiso · RN-05", () => {
    const vivo = calcularEnVivo(LINEAS, PARAMETROS);
    const bajas = new Set(
      lineasBajoElPiso(
        DOMINIO.map((l, i) => ({ ...l, descripcion: LINEAS[i]!.id })),
        money("0.10"),
      ).map((b) => b.descripcion),
    );
    // La bolsa de horas: 960 neto contra 900 de costo, 6.3 %: bajo el piso.
    expect(bajas.has("b")).toBe(true);
    for (const l of vivo.lineas) expect(l.bajoElPiso).toBe(bajas.has(l.id));
  });

  it("una celda en blanco o ilegible cuenta como cero, no tumba la tabla · RN-07", () => {
    const vivo = calcularEnVivo(
      [{ id: "a", cantidad: "", precioUnitario: "abc", descuentoPct: "10", costoUnitario: "9500" }],
      PARAMETROS,
    );
    expect(vivo.lineas[0]!.importe).toBe(formatUSD(money(0)));
    expect(vivo.lineas[0]!.margen).toBe(formatPercent("0"));
    expect(vivo.lineas[0]!.bajoElPiso).toBe(false);
    expect(vivo.totales.total).toBe(formatUSD(money(0)));
  });

  it("acepta comas de miles, como los campos del formulario", () => {
    const vivo = calcularEnVivo(
      [{ id: "a", cantidad: "1", precioUnitario: "18,000", descuentoPct: "0", costoUnitario: "9,500" }],
      PARAMETROS,
    );
    expect(vivo.lineas[0]!.importe).toBe(formatUSD(money("18000")));
  });

  it("sin VER_COSTO no inventa utilidad ni margen · INV-02", () => {
    // Sin costo no hay margen que calcular, y adivinarlo sería mentir en la
    // señal más importante de la interfaz (§13.1).
    const vivo = calcularEnVivo(
      [{ id: "a", cantidad: "20", precioUnitario: "18000", descuentoPct: "10" }],
      { taxRate: "0.16", pisoDeLinea: "0.10", verCosto: false, verMargen: true },
    );
    expect(vivo.lineas[0]!.utilidad).toBeUndefined();
    expect(vivo.lineas[0]!.margen).toBeUndefined();
    expect(vivo.lineas[0]!.bajoElPiso).toBe(false);
    expect(vivo.totales.totalCost).toBeUndefined();
    expect(vivo.totales.grossMargin).toBeUndefined();
    // Lo que sí se puede: precio, importe y los totales sin costo.
    expect(vivo.lineas[0]!.importe).toBe(formatUSD(money("324000")));
    expect(vivo.totales.total).toBe(formatUSD(money("375840")));
  });
});
