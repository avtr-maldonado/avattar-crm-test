import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { convierteProspecto, decideComoVentas, etapasQueVe, gestionaProspecto } from "./leadAccess";

/**
 * Quién hace qué con un prospecto · decisiones §58. Pura: recibe la sesión con
 * sus permisos y el prospecto que el lector ya trajo.
 */
function sesion(p: Partial<Session> & Pick<Session, "role">): Session {
  return { userId: "u-x", email: "x@avattar.com", name: "X", countryCodes: ["MX"], permissions: new Set(), limits: {}, ...p };
}
const con = (s: Session, ...codigos: string[]) => ({ ...s, permissions: new Set([...s.permissions, ...codigos]) });

const deMX = { countryCode: "MX" as const, assignedToId: "u-paulina" };
const deCO = { countryCode: "CO" as const, assignedToId: null };

describe("gestionaProspecto", () => {
  it("exige el permiso y que el país esté al alcance; Dirección y Administración alcanzan todos", () => {
    const marketing = con(sesion({ role: "MARKETING", userId: "u-mk" }), "GESTIONAR_PROSPECTOS");
    expect(gestionaProspecto(marketing, deMX)).toBe(true);
    expect(gestionaProspecto(marketing, deCO)).toBe(false);
    expect(gestionaProspecto(sesion({ role: "MARKETING", userId: "u-mk" }), deMX)).toBe(false);
    expect(gestionaProspecto(con(sesion({ role: "ADMINISTRADOR", countryCodes: [] }), "GESTIONAR_PROSPECTOS"), deCO)).toBe(true);
  });
});

describe("decideComoVentas", () => {
  it("el asignado decide; quien gestiona también; otro vendedor no", () => {
    expect(decideComoVentas(sesion({ role: "VENDEDOR", userId: "u-paulina" }), deMX)).toBe(true);
    expect(decideComoVentas(sesion({ role: "VENDEDOR", userId: "u-otro" }), deMX)).toBe(false);
    expect(decideComoVentas(con(sesion({ role: "GERENTE_PAIS", userId: "u-jorge" }), "GESTIONAR_PROSPECTOS"), deMX)).toBe(true);
  });
});

describe("convierteProspecto", () => {
  it("exige CONVERTIR_PROSPECTO y ser el asignado o gestionar", () => {
    const paulina = con(sesion({ role: "VENDEDOR", userId: "u-paulina" }), "CONVERTIR_PROSPECTO");
    expect(convierteProspecto(paulina, deMX)).toBe(true);
    expect(convierteProspecto(sesion({ role: "VENDEDOR", userId: "u-paulina" }), deMX)).toBe(false);
    const marketing = con(sesion({ role: "MARKETING", userId: "u-mk" }), "GESTIONAR_PROSPECTOS");
    expect(convierteProspecto(marketing, deMX)).toBe(false);
    const gerente = con(sesion({ role: "GERENTE_PAIS", userId: "u-jorge" }), "GESTIONAR_PROSPECTOS", "CONVERTIR_PROSPECTO");
    expect(convierteProspecto(gerente, deMX)).toBe(true);
  });
});

describe("etapasQueVe", () => {
  it("el vendedor ve desde Asignado; los demás roles ven todas las etapas", () => {
    expect(etapasQueVe("VENDEDOR")).toEqual(["ASIGNADO", "ACEPTADO", "RECHAZADO", "CONVERTIDO", "DESCARTADO"]);
    expect(etapasQueVe("MARKETING")).toHaveLength(9);
    expect(etapasQueVe("ADMINISTRADOR")).toContain("NUEVO");
  });
});
