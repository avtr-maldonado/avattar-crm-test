import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { PALETA } from "@/components/analisis/graficas/paleta";
import { FONDO_OSCURO } from "@/lib/marca";

/**
 * Los colores de la app son los del sistema de diseño AVATTAR v4 · decisiones §74.
 *
 * Los tokens viven en `app/globals.css`. Donde el color no puede ser una variable de CSS (las
 * gráficas de Recharts pintan SVG por atributo; el manifiesto y el `themeColor` son texto) va el hex,
 * y esta prueba lo amarra al token: si alguien cambia uno sin el otro, falla.
 */
const css = readFileSync("app/globals.css", "utf8");

function token(nombre: string): string {
  const m = new RegExp(`--${nombre}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`No existe --${nombre} en globals.css`);
  return m[1]!.trim().toLowerCase();
}

function canales(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

describe("tokens de globals.css con los valores de v4", () => {
  it.each([
    ["avattar-blue", "#5da7e6"],
    ["blue-400", "#5da7e6"],
    ["status-info", "#5da7e6"],
    ["avattar-navy", "#365072"],
    ["navy-600", "#365072"],
    ["avattar-magenta", "#cc27b0"],
    ["avattar-coral", "#ff595a"],
    ["status-danger", "#ff595a"],
    ["navy-900", "#0e1d35"],
    ["navy-50", "#f4f7fb"],
    ["blue-50", "#eaf1f9"],
  ])("--%s es %s", (nombre, valor) => {
    expect(token(nombre)).toBe(valor);
  });

  it("los canales RGB coinciden con su color", () => {
    expect(token("accent-rgb")).toBe(canales(token("avattar-blue")));
    expect(token("avattar-coral-rgb")).toBe(canales(token("avattar-coral")));
  });
});

describe("las copias en hex siguen a su token", () => {
  it("la paleta de las gráficas", () => {
    expect(PALETA.ganado).toBe(token("avattar-blue"));
    expect(PALETA.texto).toBe(token("navy-600"));
    expect(PALETA.peligro).toBe(token("avattar-coral"));
    expect(PALETA.vencida).toBe(token("avattar-magenta"));
  });

  it("el fondo oscuro del manifiesto, del tema y del inicio de sesión", () => {
    expect(FONDO_OSCURO.toLowerCase()).toBe(token("navy-900"));
    expect(manifest().theme_color?.toLowerCase()).toBe(token("navy-900"));
  });
});
