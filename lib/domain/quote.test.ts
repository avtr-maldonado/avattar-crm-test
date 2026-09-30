import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import {
  calcularLinea,
  calcularTotales,
  precioNeto,
} from "./quote";

/**
 * El escenario del prototipo aprobado, línea por línea.
 *
 * Las trece cifras del boceto se verificaron contra las fórmulas de `RN-07`
 * antes de escribir nada, y cuadran. Sirven de caso de prueba mejor que
 * números inventados: si alguien cambia una fórmula, esto falla contra lo que
 * Dirección ya vio.
 */
const LINEAS = [
  { descripcion: "Consultoría de arquitectura cloud", cantidad: "20", precio: "18000", descuento: "0.10", costo: "9500" },
  { descripcion: "Staffing · DevOps Senior (12 m)", cantidad: "12", precio: "165000", descuento: "0.05", costo: "118000" },
  { descripcion: "Licencia Microsoft 365 E3 (12 m)", cantidad: "80", precio: "8400", descuento: "0", costo: "7900" },
  { descripcion: "Soporte administrado 8x5", cantidad: "12", precio: "42000", descuento: "0.15", costo: "26000" },
].map((l) => ({
  descripcion: l.descripcion,
  quantity: money(l.cantidad),
  unitPrice: money(l.precio),
  discountRate: money(l.descuento),
  unitCost: money(l.costo),
}));

describe("calcularLinea · RN-07 y AC-06", () => {
  it("el caso exacto de AC-06", () => {
    // «Con precio 18 000, cantidad 20, descuento 10 % y costo 9 500, la línea
    // reporta importe 324 000, utilidad 134 000 y margen 41.4 %.»
    const r = calcularLinea(LINEAS[0]!);
    expect(r.importe.toFixed(2)).toBe("324000.00");
    expect(r.utilidad.toFixed(2)).toBe("134000.00");
    expect(r.margen.times(100).toFixed(1)).toBe("41.4");
  });

  it("el precio neto es precio × (1 − descuento)", () => {
    expect(precioNeto(money("18000"), money("0.10")).toFixed(2)).toBe("16200.00");
    expect(precioNeto(money("42000"), money("0.15")).toFixed(2)).toBe("35700.00");
  });

  it("las cuatro líneas del prototipo dan sus importes y utilidades", () => {
    const esperado = [
      { importe: "324000.00", utilidad: "134000.00" },
      { importe: "1881000.00", utilidad: "465000.00" },
      { importe: "672000.00", utilidad: "40000.00" },
      { importe: "428400.00", utilidad: "116400.00" },
    ];
    LINEAS.forEach((linea, i) => {
      const r = calcularLinea(linea);
      expect(r.importe.toFixed(2), linea.descripcion).toBe(esperado[i]!.importe);
      expect(r.utilidad.toFixed(2), linea.descripcion).toBe(esperado[i]!.utilidad);
    });
  });

  it("el margen de un importe cero es cero, no una división por cero", () => {
    // RN-07 lo dice explícitamente. Una cantidad cero es un renglón que alguien
    // está capturando, no un error que deba tumbar la pantalla.
    const r = calcularLinea({
      quantity: money(0),
      unitPrice: money("18000"),
      discountRate: money(0),
      unitCost: money("9500"),
    });
    expect(r.importe.toFixed(2)).toBe("0.00");
    expect(r.margen.toFixed(4)).toBe("0.0000");
    expect(r.margen.isFinite()).toBe(true);
  });

  it("un descuento del 100 % deja importe cero y margen cero", () => {
    const r = calcularLinea({
      quantity: money("10"),
      unitPrice: money("1000"),
      discountRate: money("1"),
      unitCost: money("600"),
    });
    expect(r.importe.toFixed(2)).toBe("0.00");
    expect(r.margen.toFixed(4)).toBe("0.0000");
  });
});

describe("calcularTotales · las cifras del prototipo", () => {
  const totales = calcularTotales(LINEAS, money("0.16"));

  it("subtotal bruto, neto y descuento global", () => {
    expect(totales.grossSubtotal.toFixed(2)).toBe("3516000.00");
    expect(totales.netSubtotal.toFixed(2)).toBe("3305400.00");
    expect(totales.descuento.toFixed(2)).toBe("210600.00");
    // 210 600 ÷ 3 516 000 = 5.99 %, que el prototipo redondea a 6.0 %.
    expect(totales.discountRate.times(100).toFixed(1)).toBe("6.0");
  });

  it("impuesto y total", () => {
    expect(totales.taxAmount.toFixed(2)).toBe("528864.00");
    expect(totales.total.toFixed(2)).toBe("3834264.00");
  });

  it("costo, utilidad y margen bruto", () => {
    expect(totales.totalCost.toFixed(2)).toBe("2550000.00");
    expect(totales.grossProfit.toFixed(2)).toBe("755400.00");
    expect(totales.grossMargin.times(100).toFixed(1)).toBe("22.9");
  });

  it("una cotización sin líneas da ceros, no errores", () => {
    const vacia = calcularTotales([], money("0.16"));
    expect(vacia.netSubtotal.toFixed(2)).toBe("0.00");
    expect(vacia.grossMargin.toFixed(4)).toBe("0.0000");
    expect(vacia.discountRate.toFixed(4)).toBe("0.0000");
  });
});

