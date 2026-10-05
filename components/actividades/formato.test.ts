import { describe, expect, it } from "vitest";
import { rangoDeSemana } from "./formato";

/**
 * La etiqueta de la semana que se navega (decisiones §44): «28 sep – 4 oct 2026».
 * Si lunes y domingo caen en el mismo mes, el mes se dice una vez.
 */
describe("rangoDeSemana", () => {
  it("dos meses: cada extremo con su mes, el año al final", () => {
    expect(rangoDeSemana("2026-09-28")).toBe("28 sep – 4 oct 2026");
  });

  it("un solo mes: los días y el mes una vez", () => {
    expect(rangoDeSemana("2026-10-05")).toBe("5 – 11 oct 2026");
  });

  it("dos años: cada extremo completo", () => {
    expect(rangoDeSemana("2026-12-28")).toBe("28 dic 2026 – 3 ene 2027");
  });
});
