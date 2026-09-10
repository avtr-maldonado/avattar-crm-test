import { describe, expect, it } from "vitest";
import { formatPercent, formatUSD, money, sum, toClient } from "./index";

describe("lib/money · INV-03", () => {
  it("no pierde precisión donde un float la perdería", () => {
    expect(toClient(sum([money("0.1"), money("0.2")]))).toBe("0.3");
    // Por contraste, para que quede claro qué se está evitando:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("serializa a string, nunca a number", () => {
    const importe = money("324000");
    expect(typeof toClient(importe)).toBe("string");
    expect(toClient(importe)).toBe("324000");
  });

  it("rechaza un number que no sea entero exacto", () => {
    // Los enteros son cómodos para el seed y las pruebas.
    expect(toClient(money(18000))).toBe("18000");
    // Un decimal en number ya viene corrompido: aceptarlo sería propagar el
    // error en silencio, que es justo lo que INV-03 prohíbe.
    expect(() => money(0.1 + 0.2)).toThrow(/INV-03/);
    expect(() => money(1234.56)).toThrow(/INV-03/);
  });

  it("suma una lista vacía sin reventar", () => {
    expect(toClient(sum([]))).toBe("0");
  });

  it("conserva la escala de la base al leer y volver a escribir", () => {
    // Postgres devuelve numeric(18,4) como "2850000.0000".
    expect(toClient(money("2850000.0000"))).toBe("2850000");
    expect(toClient(money("0.1500"))).toBe("0.15");
  });
});

describe("lib/money · formato", () => {
  it("formatea USD con símbolo, miles y dos decimales", () => {
    expect(formatUSD("324000")).toBe("$324,000.00");
    expect(formatUSD(money("1234.5"))).toBe("$1,234.50");
    expect(formatUSD("-1234.5")).toBe("-$1,234.50");
    expect(formatUSD("0")).toBe("$0.00");
  });

  it("formatea desde la cadena, no desde number, para no perder precisión", () => {
    // Por encima de 2^53 un number redondea. El formateo debe ir por la cadena.
    expect(formatUSD("9007199254740993.45")).toBe("$9,007,199,254,740,993.45");
  });

  it("formatea la fracción como porcentaje, con la convención en español", () => {
    // RN-07 · 134000 / 324000 = 0.4136 → «41.4 %». Espacio antes del signo.
    expect(formatPercent("0.4136")).toBe("41.4 %");
    expect(formatPercent("0.15")).toBe("15.0 %");
    expect(formatPercent("0.2")).toBe("20.0 %");
    expect(formatPercent("0")).toBe("0.0 %");
  });

  it("permite ajustar los decimales del porcentaje", () => {
    expect(formatPercent("0.4136", 2)).toBe("41.36 %");
    expect(formatPercent("0.4136", 0)).toBe("41 %");
  });
});
