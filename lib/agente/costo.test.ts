import { describe, expect, it } from "vitest";
import { COSTO_APROXIMADO_USD, leyendaDeCosto } from "./costo";

describe("leyendaDeCosto", () => {
  it("dice que se procesa con IA y cuánto cuesta aproximadamente a la organización", () => {
    expect(COSTO_APROXIMADO_USD).toBe("0.08");
    expect(leyendaDeCosto()).toBe(
      "El análisis se procesará con IA y generará un costo aproximado de $0.08 USD a la organización.",
    );
  });
});
