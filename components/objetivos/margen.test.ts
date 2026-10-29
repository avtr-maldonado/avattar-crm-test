import { describe, expect, it } from "vitest";
import { conflictosDeMargen, leerCuota } from "./margen";

/**
 * El margen arriba del 100 %, visto desde la hoja · §54.
 *
 * El servidor ya rechaza la utilidad por encima de la venta, pero se entera al
 * guardar y nombra un solo trimestre. Aquí la misma regla se evalúa sobre lo
 * que hay en pantalla, para decir **a quién y en qué trimestres** antes de
 * intentar guardar, y para que el aviso se vaya solo al corregir.
 */
const fila = (
  userId: string,
  nombre: string,
  cuotas: string[],
  contraparte: string[],
) => ({ userId, nombre, cuotas, contraparte });

describe("conflictosDeMargen", () => {
  it("sin conflictos devuelve la lista vacía", () => {
    // Utilidad de 40 contra una venta guardada de 100: margen del 40 %.
    const filas = [fila("u1", "Paulina", ["40", "40", "40", "40"], ["100", "100", "100", "100"])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([]);
  });

  it("la utilidad igual a la venta pasa: es el margen del 100 %, no más", () => {
    const filas = [fila("u1", "Paulina", ["100", "100", "100", "100"], ["100", "100", "100", "100"])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([]);
  });

  it("capturando utilidad, señala los trimestres donde pasa de la venta guardada", () => {
    const filas = [fila("u1", "Paulina Estrada", ["10", "500", "600", "10"], ["100", "100", "100", "100"])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([
      { userId: "u1", nombre: "Paulina Estrada", trimestres: [2, 3] },
    ]);
  });

  it("capturando venta, señala los trimestres donde queda por debajo de la utilidad guardada", () => {
    // La regla es simétrica: bajar la venta deja el mismo margen imposible.
    const filas = [fila("u1", "Paulina", ["100", "30", "100", "100"], ["50", "50", "50", "50"])];
    expect(conflictosDeMargen(filas, "VENTA")).toEqual([
      { userId: "u1", nombre: "Paulina", trimestres: [2] },
    ]);
  });

  it("con la venta en cero no hay conflicto: todavía no se captura", () => {
    // Es la misma excepción del servidor: permite capturar la utilidad antes
    // que la venta sin que la hoja se queje de algo a medio llenar.
    const filas = [fila("u1", "Paulina", ["500", "0", "0", "0"], ["0", "0", "0", "0"])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([]);
  });

  it("lista a cada vendedor con problema, en el orden de la hoja", () => {
    const filas = [
      fila("u1", "Paulina", ["1", "1", "1", "1"], ["10", "10", "10", "10"]),
      fila("u2", "Gabriel", ["99", "1", "1", "1"], ["10", "10", "10", "10"]),
      fila("u3", "Ana", ["5", "5", "99", "5"], ["10", "10", "10", "10"]),
    ];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([
      { userId: "u2", nombre: "Gabriel", trimestres: [1] },
      { userId: "u3", nombre: "Ana", trimestres: [3] },
    ]);
  });

  it("lo vacío cuenta como cero y no inventa conflictos", () => {
    const filas = [fila("u1", "Paulina", ["", "", "", ""], ["", "", "", ""])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([]);
  });

  it("no se traga las comas de la captura", () => {
    // La celda muestra «260,000» en reposo; si eso se leyera como 260, la hoja
    // avisaría de un conflicto que no existe.
    const filas = [fila("u1", "Paulina", ["90,000"], ["260,000"])];
    expect(conflictosDeMargen(filas, "UTILIDAD")).toEqual([]);
  });
});

describe("leerCuota", () => {
  it("lee lo tecleado, con comas o sin ellas", () => {
    expect(leerCuota("260000").toFixed()).toBe("260000");
    expect(leerCuota("260,000").toFixed()).toBe("260000");
    expect(leerCuota(" 1500.50 ").toFixed()).toBe("1500.5");
  });

  it("lo vacío o ilegible es cero, no un error", () => {
    expect(leerCuota("").isZero()).toBe(true);
    expect(leerCuota("   ").isZero()).toBe(true);
    expect(leerCuota("abc").isZero()).toBe(true);
  });
});
