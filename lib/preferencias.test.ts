import { describe, expect, it } from "vitest";
import { TEMAS, temaDe } from "./preferencias";

/** La preferencia de tema · decisiones §76. */
describe("temaDe", () => {
  it("reconoce los tres temas", () => {
    expect(TEMAS).toEqual(["claro", "oscuro", "sistema"]);
    for (const t of TEMAS) expect(temaDe(t)).toBe(t);
  });

  it("sin cookie o con un valor desconocido es claro: nadie amanece con la app oscura sin pedirlo", () => {
    expect(temaDe(undefined)).toBe("claro");
    expect(temaDe("")).toBe("claro");
    expect(temaDe("morado")).toBe("claro");
  });
});
