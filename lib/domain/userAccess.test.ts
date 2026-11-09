import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { administraUsuario, paisesQueAdministra, rolesQueAdministra } from "./userAccess";

/**
 * Quién administra a un usuario · decisiones §55.
 *
 * Administración y Dirección administran a cualquiera. Gerencia administra a
 * **su equipo**: vendedores y preventas de sus países, nunca otro rol ni otro
 * país, porque dar de alta a un administrador o mover a alguien a otra oficina
 * es ampliar el alcance de quien lo hace. El permiso `ADMINISTRAR_USUARIOS`
 * es otra pregunta y la hace el dominio antes; esto decide **a quién**.
 */
function sesion(p: Partial<Session> & Pick<Session, "role">): Session {
  return {
    userId: "u-x",
    email: "x@avattar.com",
    name: "X",
    countryCodes: ["MX"],
    permissions: new Set(),
    limits: {},
    ...p,
  };
}

const vendedorMX = { role: "VENDEDOR" as const, countryCodes: ["MX" as const] };
const preventaMX = { role: "PREVENTA" as const, countryCodes: ["MX" as const] };
const vendedorCO = { role: "VENDEDOR" as const, countryCodes: ["CO" as const] };
const vendedorMXCO = { role: "VENDEDOR" as const, countryCodes: ["MX" as const, "CO" as const] };
const gerenteMX = { role: "GERENTE_PAIS" as const, countryCodes: ["MX" as const] };
const admin = { role: "ADMINISTRADOR" as const, countryCodes: ["MX" as const, "CO" as const, "CL" as const] };

describe("administraUsuario", () => {
  it("administración y dirección administran a cualquiera, de cualquier país", () => {
    const direccion = sesion({ role: "DIRECCION", countryCodes: ["CL"] });
    expect(administraUsuario(sesion({ role: "ADMINISTRADOR" }), admin)).toBe(true);
    expect(administraUsuario(sesion({ role: "ADMINISTRADOR" }), vendedorCO)).toBe(true);
    expect(administraUsuario(direccion, gerenteMX)).toBe(true);
  });

  it("gerencia administra a vendedores y preventas de sus países", () => {
    const jorge = sesion({ role: "GERENTE_PAIS", countryCodes: ["MX"] });
    expect(administraUsuario(jorge, vendedorMX)).toBe(true);
    expect(administraUsuario(jorge, preventaMX)).toBe(true);
  });

  it("gerencia no administra otros roles ni a quien opere fuera de sus países", () => {
    const jorge = sesion({ role: "GERENTE_PAIS", countryCodes: ["MX"] });
    expect(administraUsuario(jorge, gerenteMX)).toBe(false);
    expect(administraUsuario(jorge, admin)).toBe(false);
    expect(administraUsuario(jorge, vendedorCO)).toBe(false);
    // Con un pie fuera ya no es «de sus países»: todos los países del usuario deben ser suyos.
    expect(administraUsuario(jorge, vendedorMXCO)).toBe(false);
    expect(administraUsuario(sesion({ role: "GERENTE_PAIS", countryCodes: ["MX", "CO"] }), vendedorMXCO)).toBe(true);
  });

  it("vendedor y preventa no administran a nadie, ni a sí mismos", () => {
    expect(administraUsuario(sesion({ role: "VENDEDOR" }), vendedorMX)).toBe(false);
    expect(administraUsuario(sesion({ role: "PREVENTA" }), preventaMX)).toBe(false);
  });
});

describe("rolesQueAdministra y paisesQueAdministra · lo que el formulario ofrece", () => {
  it("para administración, los cinco roles y los tres países", () => {
    expect(rolesQueAdministra(sesion({ role: "ADMINISTRADOR" }))).toEqual(["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA", "MARKETING"]);
    expect(paisesQueAdministra(sesion({ role: "ADMINISTRADOR", countryCodes: ["MX"] }))).toEqual(["MX", "CO", "CL"]);
  });

  it("para gerencia, vendedor y preventa en sus países", () => {
    const jorge = sesion({ role: "GERENTE_PAIS", countryCodes: ["MX", "CL"] });
    expect(rolesQueAdministra(jorge)).toEqual(["VENDEDOR", "PREVENTA"]);
    expect(paisesQueAdministra(jorge)).toEqual(["MX", "CL"]);
  });

  it("para los demás, nada; Marketing tampoco administra a nadie (§58)", () => {
    expect(rolesQueAdministra(sesion({ role: "VENDEDOR" }))).toEqual([]);
    expect(paisesQueAdministra(sesion({ role: "PREVENTA" }))).toEqual([]);
    expect(rolesQueAdministra(sesion({ role: "MARKETING" }))).toEqual([]);
    expect(administraUsuario(sesion({ role: "MARKETING" }), vendedorMX)).toBe(false);
  });
  it("administración ofrece también el rol Marketing", () => {
    expect(rolesQueAdministra(sesion({ role: "ADMINISTRADOR" }))).toContain("MARKETING");
  });
});
