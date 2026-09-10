import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { cuadreDeHitos, montoDesdePorcentaje, porcentajeDelNeto } from "./milestone";

/** El escenario de §8.2: neto 1 000 000, hitos 300 + 200 + 300 = 800 000. */
const HITOS = [money("300000"), money("200000"), money("300000")];

describe("cuadreDeHitos · RN-06 y AC-18", () => {
  it("el mensaje dice cuánto falta, con la cifra", () => {
    // «El mensaje DEBE decir "faltan $200,000 por asignar", no "los hitos no
    // cuadran".» Decir que no cuadra obliga a sacar la calculadora.
    const r = cuadreDeHitos(HITOS, money("1000000"));
    expect(r.cuadra).toBe(false);
    expect(r.diferencia.toFixed(2)).toBe("200000.00");
    expect(r.mensaje).toContain("200,000");
    expect(r.mensaje).toMatch(/falta/i);
  });

  it("cuadrado exacto no deja mensaje", () => {
    const r = cuadreDeHitos([...HITOS, money("200000")], money("1000000"));
    expect(r.cuadra).toBe(true);
    expect(r.diferencia.toFixed(2)).toBe("0.00");
    expect(r.mensaje).toBeNull();
  });

  it("pasarse también es no cuadrar, y lo dice al revés", () => {
    // Repartir de más no es «casi bien»: son hitos que nadie va a poder
    // facturar contra ese contrato.
    const r = cuadreDeHitos([money("600000"), money("600000")], money("1000000"));
    expect(r.cuadra).toBe(false);
    expect(r.diferencia.toFixed(2)).toBe("-200000.00");
    expect(r.mensaje).toMatch(/sobra/i);
    expect(r.mensaje).toContain("200,000");
  });

  it("sin hitos, falta el neto entero", () => {
    const r = cuadreDeHitos([], money("1000000"));
    expect(r.cuadra).toBe(false);
    expect(r.mensaje).toContain("1,000,000");
  });

  it("sin neto contra qué cuadrar, no opina", () => {
    // Sin cotización congelada no hay total que repartir. Eso es distinto de
    // «cuadra en cero», y confundirlos dejaría pasar una oportunidad sin
    // calendario de cobro.
    const r = cuadreDeHitos(HITOS, null);
    expect(r.cuadra).toBe(false);
    expect(r.mensaje).toMatch(/cotización/i);
  });

  it("cuadra a los centavos, no a los pesos", () => {
    // Un centavo suelto es un centavo que no se va a poder facturar.
    const r = cuadreDeHitos([money("999999.99")], money("1000000"));
    expect(r.cuadra).toBe(false);
    expect(r.diferencia.toFixed(2)).toBe("0.01");
  });
});

describe("conversión entre porcentaje y monto · §4", () => {
  it("el porcentaje se convierte a monto para guardar", () => {
    // «Hitos: monto, no porcentaje. La captura permite alternar, pero lo
    // almacenado siempre es monto.»
    expect(montoDesdePorcentaje(money("30"), money("1000000")).toFixed(2)).toBe("300000.00");
    expect(montoDesdePorcentaje(money("33.33"), money("1000000")).toFixed(2)).toBe("333300.00");
  });

  it("el monto se muestra como porcentaje del neto", () => {
    expect(porcentajeDelNeto(money("300000"), money("1000000")).toFixed(2)).toBe("30.00");
  });

  it("un neto en cero no revienta al calcular el porcentaje", () => {
    expect(porcentajeDelNeto(money("300000"), money("0")).toFixed(2)).toBe("0.00");
  });
});
