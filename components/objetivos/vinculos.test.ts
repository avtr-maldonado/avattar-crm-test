import { describe, expect, it } from "vitest";
import { SIN_VINCULO, alternarTodos, alternarUno, estanTodos, teclearConVinculo } from "./vinculos";

/**
 * La regla de los trimestres atados · §53.
 *
 * Pura y probada aparte porque es lo sutil del control: qué se propaga, qué no
 * y qué pasa al soltar un trimestre con el resto atado. Verificarlo a ojo en el
 * navegador se vuelve adivinar en cuanto hay más de dos casos.
 */
describe("teclearConVinculo", () => {
  it("sin vínculos solo cambia el trimestre tecleado", () => {
    expect(teclearConVinculo(["1", "2", "3", "4"], SIN_VINCULO, 0, "99")).toEqual(["99", "2", "3", "4"]);
  });

  it("con los cuatro atados, teclear en Q1 los llena todos", () => {
    const todos = [true, true, true, true];
    expect(teclearConVinculo(["1", "2", "3", "4"], todos, 0, "260000")).toEqual([
      "260000",
      "260000",
      "260000",
      "260000",
    ]);
  });

  it("teclear en cualquiera de los atados propaga igual: el vínculo no tiene cabeza", () => {
    const todos = [true, true, true, true];
    expect(teclearConVinculo(["0", "0", "0", "0"], todos, 2, "500")).toEqual(["500", "500", "500", "500"]);
  });

  it("el trimestre suelto conserva lo suyo y no recibe lo que se teclea en los atados", () => {
    const q3Suelto = [true, true, false, true];
    expect(teclearConVinculo(["1", "1", "777", "1"], q3Suelto, 0, "50")).toEqual(["50", "50", "777", "50"]);
  });

  it("teclear en el suelto no toca a los atados", () => {
    const q3Suelto = [true, true, false, true];
    expect(teclearConVinculo(["1", "1", "777", "1"], q3Suelto, 2, "888")).toEqual(["1", "1", "888", "1"]);
  });
});

describe("alternarTodos", () => {
  it("de nada atado, ata los cuatro", () => {
    expect(alternarTodos(SIN_VINCULO)).toEqual([true, true, true, true]);
  });

  it("de los cuatro atados, los suelta todos", () => {
    expect(alternarTodos([true, true, true, true])).toEqual(SIN_VINCULO);
  });

  it("con algunos sueltos, ata los cuatro: el icono de la fila completa, no deshace", () => {
    expect(alternarTodos([true, false, true, false])).toEqual([true, true, true, true]);
  });
});

describe("alternarUno", () => {
  it("suelta uno y deja el resto", () => {
    expect(alternarUno([true, true, true, true], 2)).toEqual([true, true, false, true]);
  });

  it("vuelve a atarlo sin tocar a los demás", () => {
    expect(alternarUno([true, true, false, true], 2)).toEqual([true, true, true, true]);
  });
});

describe("estanTodos", () => {
  it("distingue los cuatro atados de cualquier otra cosa", () => {
    expect(estanTodos([true, true, true, true])).toBe(true);
    expect(estanTodos([true, true, false, true])).toBe(false);
    expect(estanTodos(SIN_VINCULO)).toBe(false);
  });
});
