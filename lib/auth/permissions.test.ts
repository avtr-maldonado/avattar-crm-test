import { describe, expect, it } from "vitest";
import { can, limitFor, type Session } from "./permissions";

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
  permissions: new Set(["VER_OPORTUNIDADES_PROPIAS", "VER_MARGEN"]),
});

const gerente = sesion({
  role: "GERENTE_PAIS",
  userId: "u-gerente",
  permissions: new Set([
    "VER_OPORTUNIDADES_PROPIAS",
    "VER_OPORTUNIDADES_OFICINA",
    "VER_MARGEN",
    "VER_COSTO",
    "AUTORIZAR_DESCUENTO",
    "VER_ANALISIS",
  ]),
  limits: { AUTORIZAR_DESCUENTO: "0.3000" },
});

const direccion = sesion({
  role: "DIRECCION",
  userId: "u-direccion",
  countryCodes: ["MX", "CO", "CL"],
  permissions: new Set(["AUTORIZAR_DESCUENTO", "VER_COSTO", "VER_ANALISIS"]),
  // Sin límite: Dirección autoriza cualquier descuento (§5.2).
  limits: { AUTORIZAR_DESCUENTO: null },
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

describe("limitFor · RN-04", () => {
  it("el gerente autoriza hasta su límite", () => {
    expect(limitFor(gerente, "AUTORIZAR_DESCUENTO")?.toString()).toBe("0.3");
  });

  it("dirección autoriza sin límite: permiso concedido, tope nulo", () => {
    expect(can(direccion, "AUTORIZAR_DESCUENTO")).toBe(true);
    expect(limitFor(direccion, "AUTORIZAR_DESCUENTO")).toBeNull();
  });

  it("sin el permiso no hay límite que consultar", () => {
    expect(limitFor(vendedor, "AUTORIZAR_DESCUENTO")).toBeNull();
  });

  it("distingue «sin permiso» de «permiso sin tope»", () => {
    // Los dos devuelven null en limitFor, así que la diferencia tiene que
    // preguntarse con can(). Confundirlas dejaría a un vendedor autorizando
    // descuentos ilimitados.
    expect(can(vendedor, "AUTORIZAR_DESCUENTO")).toBe(false);
    expect(can(direccion, "AUTORIZAR_DESCUENTO")).toBe(true);
  });
});
