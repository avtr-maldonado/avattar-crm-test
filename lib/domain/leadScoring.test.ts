import { describe, expect, it } from "vitest";
import { puntajeDe, sePuedeCalificar, validarRubrica } from "./leadScoring";

/** La rúbrica de calificación de prospectos · decisiones §71. Las reglas puras. */
const BASE = [
  { name: "Presupuesto", weight: 25, active: true },
  { name: "Autoridad", weight: 20, active: true },
  { name: "Necesidad", weight: 25, active: true },
  { name: "Plazo", weight: 15, active: true },
  { name: "Perfil", weight: 15, active: true },
];

describe("validarRubrica", () => {
  it("acepta una rúbrica cuyos activos suman 100", () => {
    expect(validarRubrica(BASE)).toEqual([]);
  });

  it("dice cuánto falta cuando los activos no llegan a 100", () => {
    const r = validarRubrica([...BASE.slice(0, 4)]);
    expect(r).toContainEqual({ campo: "weight", mensaje: "Los criterios activos suman 85: faltan 15 para 100." });
  });

  it("dice cuánto sobra cuando pasan de 100", () => {
    const r = validarRubrica([...BASE, { name: "Urgencia", weight: 10, active: true }]);
    expect(r).toContainEqual({ campo: "weight", mensaje: "Los criterios activos suman 110: sobran 10." });
  });

  it("un inactivo no cuenta para la suma", () => {
    expect(validarRubrica([...BASE, { name: "Urgencia", weight: 10, active: false }])).toEqual([]);
  });

  it("rechaza nombres repetidos sin importar mayúsculas ni espacios, y lo nombra", () => {
    const r = validarRubrica([...BASE.slice(0, 4), { name: "  presupuesto ", weight: 15, active: true }]);
    expect(r).toContainEqual({ campo: "name", mensaje: "El criterio «presupuesto» está repetido." });
  });

  it("rechaza un nombre vacío", () => {
    const r = validarRubrica([...BASE.slice(0, 4), { name: " ", weight: 15, active: true }]);
    expect(r).toContainEqual({ campo: "name", mensaje: "Cada criterio necesita un nombre." });
  });

  it("rechaza un peso que no es entero entre 1 y 100", () => {
    const r = validarRubrica([{ name: "Todo", weight: 0, active: true }, { name: "Medio", weight: 2.5, active: true }]);
    expect(r).toContainEqual({ campo: "weight", mensaje: "El peso de «Todo» debe ser un entero entre 1 y 100." });
    expect(r).toContainEqual({ campo: "weight", mensaje: "El peso de «Medio» debe ser un entero entre 1 y 100." });
  });

  it("exige al menos un criterio activo", () => {
    const r = validarRubrica(BASE.map((c) => ({ ...c, active: false })));
    expect(r).toContainEqual({ campo: "weight", mensaje: "La rúbrica necesita al menos un criterio activo." });
  });
});

describe("puntajeDe", () => {
  it("suma los pesos de lo que se marcó", () => {
    expect(puntajeDe([{ weight: 25, met: true }, { weight: 20, met: false }, { weight: 15, met: true }])).toBe(40);
  });

  it("nada marcado da cero, no nulo: se calificó y no cumple nada", () => {
    expect(puntajeDe([{ weight: 50, met: false }, { weight: 50, met: false }])).toBe(0);
  });
});

describe("sePuedeCalificar", () => {
  it("solo en En validación y Contactado", () => {
    expect(sePuedeCalificar("EN_VALIDACION")).toBe(true);
    expect(sePuedeCalificar("CONTACTADO")).toBe(true);
    for (const e of ["NUEVO", "CALIFICADO", "ASIGNADO", "ACEPTADO", "RECHAZADO", "CONVERTIDO", "DESCARTADO"] as const) {
      expect(sePuedeCalificar(e)).toBe(false);
    }
  });
});
