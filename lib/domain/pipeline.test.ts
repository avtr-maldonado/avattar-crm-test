import { describe, expect, it } from "vitest";
import { money, toClient } from "@/lib/money";
import { openTotal, weightedAmount, weightedTotal, wonInPeriod } from "./pipeline";

describe("weightedAmount · RN-01", () => {
  it("es importe por probabilidad de etapa", () => {
    // OPP-2026-00417 · Negociación al 75 %.
    expect(toClient(weightedAmount(money("2850000"), money("0.75")))).toBe("2137500");
  });

  it("reproduce el ponderado de cada etapa del seed (§15)", () => {
    const casos: [string, string, string][] = [
      ["1240000", "0.90", "1116000"], // Cierre
      ["1975000", "0.50", "987500"], // Propuesta
      ["918000", "0.25", "229500"], // Descubrimiento
      ["430000", "0.10", "43000"], // Calificación
    ];
    for (const [importe, probabilidad, esperado] of casos) {
      expect(toClient(weightedAmount(money(importe), money(probabilidad)))).toBe(esperado);
    }
  });

  it("MEDDIC no aparece en la fórmula (§2.1)", () => {
    // «MEDDIC gatea, no pondera.» La firma solo acepta importe y probabilidad:
    // no hay por dónde colar el puntaje. Dos mecanismos moviendo el pronóstico
    // hacen imposible explicar un número en el comité comercial.
    expect(weightedAmount.length).toBe(2);
  });

  it("no pierde centavos con probabilidades de cuatro decimales", () => {
    // 333333.33 × 0.3333 = 111099.998889 exacto. Con float daría
    // 111099.99888900001, y ese sufijo se propaga al total del kanban.
    expect(toClient(weightedAmount(money("333333.33"), money("0.3333")))).toBe("111099.998889");
  });

  it("el total ponderado del seed cuadra con la cifra del prototipo (§15)", () => {
    // Las 14 oportunidades abiertas de México, con la probabilidad de su etapa.
    const abiertas: [string, string][] = [
      ["2850000", "0.75"],
      ["1975000", "0.50"],
      ["1240000", "0.90"],
      ["918000", "0.25"],
      ["615000", "0.50"],
      ["588000", "0.75"],
      ["430000", "0.10"],
      ["386000", "0.10"],
      ["297000", "0.25"],
      ["245000", "0.10"],
      ["1105000", "0.90"],
      ["760000", "0.25"],
      ["522000", "0.50"],
      ["690000", "0.75"],
    ];

    const oportunidades = abiertas.map(([amount, probability]) => ({
      amount: money(amount),
      stage: { probability: money(probability) },
    }));

    expect(toClient(openTotal(oportunidades))).toBe("12621000");
    expect(toClient(weightedTotal(oportunidades))).toBe("7362350");
  });
});

describe("wonInPeriod · lo ganado del periodo, por actualCloseDate", () => {
  const periodo = { from: new Date("2026-01-01"), to: new Date("2026-12-31T23:59:59.999Z") };
  const ganada = (cierre: string | null) => ({
    status: "GANADA" as const,
    actualCloseDate: cierre ? new Date(cierre) : null,
    amount: money(100),
  });

  it("toma solo GANADA con cierre real dentro del periodo", () => {
    const r = wonInPeriod(
      [
        ganada("2026-03-15"),
        { ...ganada("2026-03-15"), status: "ABIERTA" as const },
        { ...ganada("2026-03-15"), status: "PERDIDA" as const },
        ganada("2025-12-31"),
      ],
      periodo,
    );
    expect(r).toHaveLength(1);
  });

  it("una GANADA sin cierre real no cuenta: es un dato roto, no un cero", () => {
    expect(wonInPeriod([ganada(null)], periodo)).toHaveLength(0);
  });

  it("sin límite inferior, todo lo cerrado hasta `to` cuenta", () => {
    const r = wonInPeriod([ganada("2019-01-01"), ganada("2027-01-01")], { from: null, to: periodo.to });
    expect(r).toHaveLength(1);
  });
});
