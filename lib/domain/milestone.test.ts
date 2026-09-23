import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { cuadreDeHitos, montoDesdePorcentaje, porcentajeDelNeto, topeDeHitos } from "./milestone";

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

describe("topeDeHitos · la suma de hitos no supera el neto", () => {
  it("dentro del neto no opina y dice cuánto queda", () => {
    const r = topeDeHitos([money("300000"), money("200000")], money("300000"), money("1000000"));
    expect(r.excede).toBe(false);
    expect(r.mensaje).toBeNull();
    expect(r.suma.toFixed(2)).toBe("800000.00");
    expect(r.disponible?.toFixed(2)).toBe("500000.00");
  });

  it("llegar exacto al neto es válido: es justo el cuadre", () => {
    const r = topeDeHitos([money("300000"), money("200000")], money("500000"), money("1000000"));
    expect(r.excede).toBe(false);
    expect(r.mensaje).toBeNull();
  });

  it("pasarse lo dice con la suma, el exceso y el neto", () => {
    // El mensaje trae las tres cifras: lo que sumarían, cuánto de más y contra
    // qué. Decir «supera el 100 %» obligaría a sacar la calculadora (AC-18).
    const r = topeDeHitos([money("600000")], money("600000"), money("1000000"));
    expect(r.excede).toBe(true);
    expect(r.mensaje).toContain("1,200,000");
    expect(r.mensaje).toContain("200,000");
    expect(r.mensaje).toContain("1,000,000");
  });

  it("un centavo de más ya es pasarse", () => {
    const r = topeDeHitos([money("999999.99")], money("0.02"), money("1000000"));
    expect(r.excede).toBe(true);
  });

  it("sin neto no hay tope: no hay contra qué comparar", () => {
    const r = topeDeHitos([money("600000")], money("600000"), null);
    expect(r.excede).toBe(false);
    expect(r.mensaje).toBeNull();
    expect(r.disponible).toBeNull();
  });

  it("al editar, el hito que se corrige no cuenta dos veces", () => {
    // Quien llama saca el hito editado de «otros»; aquí solo se comprueba que
    // con los demás en 700 000, corregir el tercero a 300 000 cuadra exacto.
    const r = topeDeHitos([money("300000"), money("400000")], money("300000"), money("1000000"));
    expect(r.excede).toBe(false);
    expect(r.disponible?.toFixed(2)).toBe("300000.00");
  });
});
