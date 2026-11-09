import { describe, expect, it } from "vitest";
import { estadoDeSla, venceEn } from "./leadSla";

/**
 * El SLA de primer contacto · decisiones §58. Horas corridas desde el alta;
 * el plazo lo fija la política del país (INV-05) y el estado se calcula (INV-11).
 */
const alta = new Date("2026-11-09T10:00:00Z");
const vence = venceEn(alta, 24);

describe("venceEn", () => {
  it("suma las horas del país al alta", () => {
    expect(vence.toISOString()).toBe("2026-11-10T10:00:00.000Z");
  });
});

describe("estadoDeSla", () => {
  const sin = { createdAt: alta, firstContactDueAt: vence, contactedAt: null };

  it("con primer contacto está cumplido, aunque haya sido tarde", () => {
    expect(estadoDeSla({ ...sin, contactedAt: new Date("2026-11-12T00:00:00Z") }, new Date("2026-11-13T00:00:00Z"))).toBe("cumplido");
  });

  it("en tiempo mientras queda más del 25 % del plazo", () => {
    expect(estadoDeSla(sin, new Date("2026-11-09T20:00:00Z"))).toBe("en_tiempo");
  });

  it("por vencer cuando queda el 25 % o menos", () => {
    expect(estadoDeSla(sin, new Date("2026-11-10T04:00:00Z"))).toBe("por_vencer");
    expect(estadoDeSla(sin, new Date("2026-11-10T09:59:00Z"))).toBe("por_vencer");
  });

  it("vencido pasado el plazo", () => {
    expect(estadoDeSla(sin, new Date("2026-11-10T10:00:01Z"))).toBe("vencido");
  });
});
