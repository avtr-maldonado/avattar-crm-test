import { describe, expect, it } from "vitest";
import { BLOQUEO_MINUTOS, enCurso } from "./espera";

const AHORA = new Date("2026-11-11T15:00:00Z");

describe("enCurso · el bloqueo «analizando» (§63)", () => {
  it("sin inicio no hay nada en curso; un inicio reciente sí; uno más viejo que el plazo ya no", () => {
    expect(enCurso(null, AHORA)).toBe(false);
    expect(enCurso(new Date("2026-11-11T14:55:00Z"), AHORA)).toBe(true);
    expect(enCurso(new Date(AHORA.getTime() - (BLOQUEO_MINUTOS + 1) * 60_000), AHORA)).toBe(false);
  });
});
