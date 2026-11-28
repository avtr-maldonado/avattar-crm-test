import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * El tema oscuro · decisiones §76. Lo que afirman: redefine cada token semántico del tema claro (si
 * falta uno, ese color se queda claro sobre fondo oscuro), y el bloque «Sistema» dice exactamente lo
 * mismo que «Oscuro» (son dos copias porque una media query no se combina con un selector).
 */
const css = readFileSync("app/globals.css", "utf8");

function bloque(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`No existe ${selector} en globals.css`);
  const abre = css.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < css.length; j++) {
    if (css[j] === "{") nivel++;
    if (css[j] === "}" && --nivel === 0) return css.slice(abre + 1, j);
  }
  throw new Error(`Bloque sin cerrar: ${selector}`);
}

const variables = (texto: string) => new Set([...texto.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const declaraciones = (texto: string) =>
  [...texto.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => `${m[1]}:${m[2]!.trim()}`).sort();

const SEMANTICOS = [
  "--text-heading", "--text-body", "--text-muted", "--text-subtle", "--text-link", "--text-placeholder",
  "--surface-page", "--surface-subtle", "--surface-card", "--surface-tint", "--surface-muted",
  "--border", "--border-strong", "--on-accent",
];

describe("tema oscuro", () => {
  const oscuro = bloque(':root[data-tema="oscuro"]');

  it.each(SEMANTICOS)("redefine %s", (token) => {
    expect(variables(oscuro).has(token)).toBe(true);
  });

  it("«Sistema» en modo oscuro declara lo mismo que «Oscuro»", () => {
    const media = bloque("@media (prefers-color-scheme: dark)");
    const sistema = bloque.call(null, ':root[data-tema="sistema"]');
    expect(media.includes(':root[data-tema="sistema"]')).toBe(true);
    expect(declaraciones(sistema)).toEqual(declaraciones(oscuro));
  });
});

/**
 * La paleta oscura en toda la app · decisiones §77 (antes solo en el Pipeline): cinco niveles de
 * luminosidad. Fondo, tarjetas (KPI y paneles) y columnas por los alias del tema oscuro; el encabezado
 * (`.barra-superior`) y las tarjetas de los tres Kanban (`.tablero-kanban`) con su propio nivel.
 */
describe("paleta oscura de la app", () => {
  const minus = (sel: string) => declaraciones(bloque(sel)).map((x) => x.toLowerCase());

  it("el tema oscuro usa los niveles pedidos", () => {
    const b = minus(':root[data-tema="oscuro"] {');
    for (const d of ["--surface-page:#0b192b", "--surface-card:#142d49", "--surface-subtle:#193654", "--border:#2c4c6d", "--text-heading:#ffffff", "--text-muted:#a9bed4", "--text-link:#7fb9eb"]) {
      expect(b).toContain(d);
    }
  });

  it("encabezado y tarjetas de los tableros llevan su propio nivel, también en «Sistema»", () => {
    for (const raiz of [':root[data-tema="oscuro"]', ':root[data-tema="sistema"]']) {
      expect(minus(`${raiz} .barra-superior {`)).toContain("--surface-page:#10233d");
      expect(minus(`${raiz} .tablero-kanban {`)).toContain("--surface-card:#203e60");
    }
  });

  it("ya no hay una paleta propia del Pipeline", () => {
    expect(css.includes(".vista-pipeline")).toBe(false);
  });
});
