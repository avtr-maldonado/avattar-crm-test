import { describe, expect, it } from "vitest";
import { ETIQUETA_BANDERA, ETIQUETA_ROL, NOMBRE_PAIS, iniciales } from "./etiquetas";

describe("iniciales", () => {
  it("toma nombre y primer apellido", () => {
    expect(iniciales("Miguel Maldonado")).toBe("MM");
    expect(iniciales("Jorge Medina")).toBe("JM");
    expect(iniciales("Ana Lucía Ríos")).toBe("AL");
  });

  it("aguanta un solo nombre", () => {
    expect(iniciales("Dirección")).toBe("D");
  });

  it("aguanta espacios de sobra sin producir letras vacías", () => {
    expect(iniciales("  Paulina   Estrada  ")).toBe("PE");
  });

  it("respeta acentos y mayúsculas", () => {
    expect(iniciales("Óscar Villareal")).toBe("ÓV");
  });
});

describe("etiquetas · INV-14", () => {
  it("los cinco roles tienen texto en español", () => {
    for (const [clave, texto] of Object.entries(ETIQUETA_ROL)) {
      expect(texto, `${clave} sin etiqueta`).toBeTruthy();
      // Un valor visible que sea el enum en crudo es lo que INV-14 prohíbe.
      expect(texto).not.toBe(clave);
    }
    expect(Object.keys(ETIQUETA_ROL)).toHaveLength(5);
  });

  it("las tres banderas de riesgo tienen texto", () => {
    expect(Object.keys(ETIQUETA_BANDERA)).toHaveLength(3);
    expect(ETIQUETA_BANDERA.MARGEN_BAJO).toBe("Margen bajo");
  });

  it("los tres países tienen nombre completo", () => {
    expect(NOMBRE_PAIS.MX).toBe("México");
    expect(Object.keys(NOMBRE_PAIS)).toHaveLength(3);
  });
});

/**
 * La regla del marcador activo, extraída para poder probarla sin navegador.
 *
 * `RubrosNavegacion` la aplica con `usePathname`. Vive replicada aquí porque el
 * caso que importa —el detalle de una oportunidad mantiene encendido
 * «Oportunidades»— es fácil de romper y difícil de notar a ojo.
 */
function estaActivo(ruta: string, href: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`);
}

describe("marcador de rubro activo", () => {
  it("enciende el rubro de la ruta exacta", () => {
    expect(estaActivo("/oportunidades", "/oportunidades")).toBe(true);
  });

  it("sigue encendido dentro del detalle", () => {
    // El detalle no es otro lugar: es más adentro del mismo.
    expect(estaActivo("/oportunidades/OPP-2026-00417", "/oportunidades")).toBe(true);
    expect(estaActivo("/contactos/organizaciones/abc", "/contactos")).toBe(true);
  });

  it("no enciende un rubro cuyo nombre es prefijo de otro", () => {
    // El error clásico: `/actividades` encendiendo `/actividad`. La barra debe
    // comparar segmentos completos, no cadenas.
    expect(estaActivo("/actividades", "/actividad")).toBe(false);
    expect(estaActivo("/oportunidades-archivadas", "/oportunidades")).toBe(false);
  });

  it("solo un rubro queda encendido a la vez", () => {
    const rubros = [
      "/oportunidades",
      "/contactos",
      "/productos",
      "/actividades",
      "/objetivos",
      "/analisis",
      "/autorizaciones",
      "/admin",
    ];
    for (const ruta of ["/oportunidades", "/actividades/hoy", "/admin"]) {
      const encendidos = rubros.filter((r) => estaActivo(ruta, r));
      expect(encendidos, `${ruta} enciende ${encendidos.length} rubros`).toHaveLength(1);
    }
  });
});
