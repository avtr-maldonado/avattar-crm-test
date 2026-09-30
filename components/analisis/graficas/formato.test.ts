import { describe, expect, it } from "vitest";
import { acortar, formatoCompacto, formatoDeEje, formatoDePorcentaje } from "./formato";

/**
 * El formato corto de los ejes y las etiquetas de barra: «$328.8K». Vive en
 * el cliente porque Recharts entrega números para los ticks; el importe exacto
 * («$328,835.00») lo formatea el servidor con Decimal y viaja en el tooltip.
 */
describe("formatoCompacto · $328.8K en ejes y etiquetas", () => {
  it("bajo mil va entero, con signo de dólar", () => {
    expect(formatoCompacto(0)).toBe("$0");
    expect(formatoCompacto(835)).toBe("$835");
  });

  it("de mil a un millón va en K con un decimal", () => {
    expect(formatoCompacto(18000)).toBe("$18.0K");
    expect(formatoCompacto(328835)).toBe("$328.8K");
    expect(formatoCompacto(166915)).toBe("$166.9K");
    expect(formatoCompacto(999950)).toBe("$1.0M");
  });

  it("de un millón en adelante va en M", () => {
    expect(formatoCompacto(1200000)).toBe("$1.2M");
    expect(formatoCompacto(15000000)).toBe("$15.0M");
  });

  it("un negativo lleva el signo menos tipográfico", () => {
    expect(formatoCompacto(-1200)).toBe("−$1.2K");
  });
});

describe("formatoDePorcentaje · el eje de margen", () => {
  it("una fracción se lee como por ciento, sin decimales en el eje", () => {
    expect(formatoDePorcentaje(0)).toBe("0 %");
    expect(formatoDePorcentaje(0.558)).toBe("56 %");
    expect(formatoDePorcentaje(1)).toBe("100 %");
  });
});

describe("formatoDeEje · los ticks no cargan el .0", () => {
  it("quita el decimal en cero y conserva el que dice algo", () => {
    expect(formatoDeEje(85000)).toBe("$85K");
    expect(formatoDeEje(340000)).toBe("$340K");
    expect(formatoDeEje(1000000)).toBe("$1M");
    expect(formatoDeEje(328835)).toBe("$328.8K");
    expect(formatoDeEje(0)).toBe("$0");
  });
});

describe("acortar · etiquetas de eje que no caben", () => {
  it("corta con puntos suspensivos y deja la corta como está", () => {
    expect(acortar("Grupo Andina", 16)).toBe("Grupo Andina");
    expect(acortar("Consultoría de arquitectura cloud", 16)).toBe("Consultoría de…");
  });
});

