import { describe, expect, it } from "vitest";
import { can, type Session } from "./permissions";

function sesion(parcial: Partial<Session> & Pick<Session, "role">): Session {
  return {
    userId: "u-prueba",
    email: "prueba@avattar.com",
    name: "Usuario de prueba",
    countryCodes: ["MX"],
    permissions: new Set(),
    limits: {},
    ...parcial,
  };
}

const vendedor = sesion({
  role: "VENDEDOR",
  userId: "u-vendedor",
  permissions: new Set(["VER_MARGEN"]),
});

const gerente = sesion({
  role: "GERENTE_PAIS",
  userId: "u-gerente",
  permissions: new Set([
    "VER_OPORTUNIDADES_OFICINA",
    "VER_MARGEN",
    "VER_COSTO",
    "VER_ANALISIS",
  ]),
});

describe("can · §5.2", () => {
  it("ver margen y ver costo son permisos independientes (RN-09)", () => {
    expect(can(vendedor, "VER_MARGEN")).toBe(true);
    expect(can(vendedor, "VER_COSTO")).toBe(false);
    expect(can(gerente, "VER_COSTO")).toBe(true);
  });

  it("el vendedor no ve análisis ni los objetivos del equipo (§2.3)", () => {
    expect(can(vendedor, "VER_ANALISIS")).toBe(false);
    expect(can(vendedor, "VER_OBJETIVOS_EQUIPO")).toBe(false);
    expect(can(gerente, "VER_ANALISIS")).toBe(true);
  });

  it("un permiso que no está en el conjunto se niega, no se asume", () => {
    // Un permiso desconocido o mal escrito falla cerrado.
    expect(can(vendedor, "EDITAR_CATALOGOS")).toBe(false);
    expect(can(gerente, "REABRIR_OPORTUNIDAD")).toBe(false);
  });
});

