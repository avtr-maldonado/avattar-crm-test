import { describe, expect, it } from "vitest";
import { conservandoActual, normalizarNombre, validarNombre } from "./leadCatalog";

/** Catálogos de prospectos · decisiones §68. Las reglas puras. */
describe("normalizarNombre", () => {
  it("quita espacios en los extremos y junta los repetidos", () => {
    expect(normalizarNombre("  Expo   TI  2027 ")).toBe("Expo TI 2027");
  });
});

describe("validarNombre", () => {
  it("rechaza un nombre vacío o de una letra", () => {
    expect(validarNombre("  ")).toBe("Escribe el nombre.");
    expect(validarNombre("A")).toBe("Escribe el nombre.");
  });

  it("rechaza un nombre de más de 80 caracteres", () => {
    expect(validarNombre("x".repeat(81))).toBe("El nombre admite hasta 80 caracteres.");
  });

  it("acepta un nombre normal", () => {
    expect(validarNombre("LinkedIn")).toBeNull();
  });
});

describe("conservandoActual", () => {
  const activos = [
    { id: "a", name: "Web" },
    { id: "b", name: "Evento" },
  ];

  it("no toca la lista si el valor actual está activo", () => {
    expect(conservandoActual(activos, { id: "a", name: "Web" })).toEqual(activos);
  });

  it("no toca la lista si no hay valor actual", () => {
    expect(conservandoActual(activos, null)).toEqual(activos);
  });

  it("agrega el valor actual inactivo, marcado, para que el formulario lo conserve", () => {
    expect(conservandoActual(activos, { id: "z", name: "Feria 2025" })).toEqual([
      ...activos,
      { id: "z", name: "Feria 2025 (inactivo)" },
    ]);
  });
});
