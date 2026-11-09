import { describe, expect, it } from "vitest";
import { ETAPAS_ABIERTAS, ETAPAS_DE_PROSPECTO, esTerminal, puedeTransitar, type Actor } from "./leadStages";

/**
 * El pipeline de prospectos · decisiones §58.
 *
 * Nueve etapas con comportamiento propio. Entre las cuatro primeras se avanza y
 * retrocede libremente si se gestiona; a Asignado solo con vendedor; de Asignado
 * a Aceptado o Rechazado decide el asignado o quien gestiona; Rechazado solo se
 * reasigna o se descarta; Convertido y Descartado no se mueven.
 */
const marketing: Actor = { gestiona: true, esAsignado: false };
const vendedor: Actor = { gestiona: false, esAsignado: true };
const ajeno: Actor = { gestiona: false, esAsignado: false };

describe("ETAPAS_DE_PROSPECTO", () => {
  it("son nueve en el orden del proceso, y seis abiertas", () => {
    expect(ETAPAS_DE_PROSPECTO).toEqual(["NUEVO", "EN_VALIDACION", "CONTACTADO", "CALIFICADO", "ASIGNADO", "ACEPTADO", "RECHAZADO", "CONVERTIDO", "DESCARTADO"]);
    expect(ETAPAS_ABIERTAS).toEqual(["NUEVO", "EN_VALIDACION", "CONTACTADO", "CALIFICADO", "ASIGNADO", "ACEPTADO"]);
    expect(esTerminal("CONVERTIDO") && esTerminal("DESCARTADO")).toBe(true);
    expect(esTerminal("RECHAZADO")).toBe(false);
  });
});

describe("puedeTransitar", () => {
  it("entre las cuatro primeras, libre para quien gestiona, en los dos sentidos", () => {
    expect(puedeTransitar("NUEVO", "CALIFICADO", marketing, false).ok).toBe(true);
    expect(puedeTransitar("CALIFICADO", "NUEVO", marketing, false).ok).toBe(true);
    expect(puedeTransitar("NUEVO", "EN_VALIDACION", ajeno, false).ok).toBe(false);
  });

  it("a ASIGNADO solo con vendedor", () => {
    expect(puedeTransitar("CALIFICADO", "ASIGNADO", marketing, false)).toMatchObject({ ok: false });
    expect(puedeTransitar("CALIFICADO", "ASIGNADO", marketing, true).ok).toBe(true);
  });

  it("de ASIGNADO a ACEPTADO o RECHAZADO decide el asignado o quien gestiona; un ajeno no", () => {
    expect(puedeTransitar("ASIGNADO", "ACEPTADO", vendedor, true).ok).toBe(true);
    expect(puedeTransitar("ASIGNADO", "RECHAZADO", marketing, true).ok).toBe(true);
    expect(puedeTransitar("ASIGNADO", "ACEPTADO", ajeno, true).ok).toBe(false);
  });

  it("RECHAZADO solo vuelve a ASIGNADO (reasignar); descartarlo va por «Descartar», con motivo", () => {
    expect(puedeTransitar("RECHAZADO", "ASIGNADO", marketing, true).ok).toBe(true);
    expect(puedeTransitar("RECHAZADO", "ASIGNADO", marketing, false).ok).toBe(false);
    expect(puedeTransitar("RECHAZADO", "CALIFICADO", marketing, true).ok).toBe(false);
  });

  it("saltos hacia adelante que se brincan la aceptación no se permiten desde el kanban", () => {
    expect(puedeTransitar("NUEVO", "ACEPTADO", marketing, true).ok).toBe(false);
    expect(puedeTransitar("CALIFICADO", "ACEPTADO", marketing, true).ok).toBe(false);
  });

  it("a CONVERTIDO solo por convertir; a DESCARTADO solo por descartar; los terminales no salen", () => {
    expect(puedeTransitar("ACEPTADO", "CONVERTIDO", marketing, true).ok).toBe(false);
    expect(puedeTransitar("NUEVO", "DESCARTADO", marketing, false).ok).toBe(false);
    expect(puedeTransitar("CONVERTIDO", "NUEVO", marketing, true).ok).toBe(false);
    expect(puedeTransitar("DESCARTADO", "NUEVO", marketing, true).ok).toBe(false);
  });

  it("la misma etapa no es una transición", () => {
    expect(puedeTransitar("NUEVO", "NUEVO", marketing, false).ok).toBe(false);
  });
});
