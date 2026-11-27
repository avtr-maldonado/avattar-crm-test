import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { config } from "@/middleware";

/**
 * El CRM se instala como app en el teléfono · decisiones §72.
 *
 * Lo que afirman: el manifiesto trae lo que Chrome, Edge y Safari piden para instalar (nombre, inicio,
 * modo standalone, íconos 192 y 512, uno maskable); cada ícono que nombra existe en `public/`; y el
 * middleware no manda el manifiesto a /login: el navegador lo pide sin cookies, y una redirección
 * vuelve la app no instalable sin ningún error visible.
 */
const m = manifest();

describe("manifiesto", () => {
  it("abre la app sola, en la portada, con los colores del ícono", () => {
    expect(m).toMatchObject({ name: "CRM Avattar", short_name: "CRM", start_url: "/", display: "standalone", lang: "es-MX" });
    expect(m.theme_color).toBe("#0E1D35");
    expect(m.background_color).toBe("#0E1D35");
  });

  it("trae íconos de 192 y 512 y uno maskable para Android", () => {
    const iconos = m.icons ?? [];
    expect(iconos.some((i) => i.sizes === "192x192" && i.purpose !== "maskable")).toBe(true);
    expect(iconos.some((i) => i.sizes === "512x512" && i.purpose !== "maskable")).toBe(true);
    expect(iconos.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  it("cada ícono que nombra existe en public/", () => {
    for (const i of m.icons ?? []) {
      expect(existsSync(path.join("public", i.src)), i.src).toBe(true);
    }
  });
});

describe("middleware", () => {
  const pasaPorElMiddleware = (ruta: string) => config.matcher.some((p) => new RegExp(`^${p}$`).test(ruta));

  it("no intercepta el manifiesto ni los íconos", () => {
    expect(pasaPorElMiddleware("/manifest.webmanifest")).toBe(false);
    expect(pasaPorElMiddleware("/pwa/icono-512.png")).toBe(false);
    expect(pasaPorElMiddleware("/apple-icon.png")).toBe(false);
  });

  it("sigue protegiendo las pantallas", () => {
    expect(pasaPorElMiddleware("/oportunidades")).toBe(true);
    expect(pasaPorElMiddleware("/prospectos")).toBe(true);
  });
});
