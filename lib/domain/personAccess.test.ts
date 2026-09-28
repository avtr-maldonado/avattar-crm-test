import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { administraPersona } from "./personAccess";

/**
 * Quién administra a una persona · decisiones §29.
 *
 * Editar, compartir y transferir son la misma pregunta: ¿es mía, o administro
 * a quien la tiene? Compartir da solo lectura, así que quien la recibe no
 * administra nada.
 */
function sesion(p: Partial<Session> & Pick<Session, "role" | "userId">): Session {
  return {
    email: "x@avattar.com",
    name: "X",
    countryCodes: ["MX"],
    permissions: new Set(),
    limits: {},
    ...p,
  };
}

const dePaulina = { ownerId: "u-paulina", owner: { countryCodes: ["MX" as const] } };

describe("administraPersona", () => {
  it("el propietario administra la suya; otro vendedor, no, aunque se la compartan", () => {
    expect(administraPersona(sesion({ role: "VENDEDOR", userId: "u-paulina" }), dePaulina)).toBe(true);
    expect(administraPersona(sesion({ role: "VENDEDOR", userId: "u-rodrigo" }), dePaulina)).toBe(false);
  });

  it("el gerente administra las de los usuarios de su país, no las de otro país", () => {
    expect(administraPersona(sesion({ role: "GERENTE_PAIS", userId: "u-jorge", countryCodes: ["MX"] }), dePaulina)).toBe(true);
    expect(administraPersona(sesion({ role: "GERENTE_PAIS", userId: "u-andes", countryCodes: ["CO", "CL"] }), dePaulina)).toBe(false);
  });

  it("dirección y administración administran todas", () => {
    expect(administraPersona(sesion({ role: "DIRECCION", userId: "u-dir", countryCodes: ["CL"] }), dePaulina)).toBe(true);
    expect(administraPersona(sesion({ role: "ADMINISTRADOR", userId: "u-admin", countryCodes: [] }), dePaulina)).toBe(true);
  });

  it("preventa solo administra lo suyo", () => {
    expect(administraPersona(sesion({ role: "PREVENTA", userId: "u-ivan" }), dePaulina)).toBe(false);
    expect(administraPersona(sesion({ role: "PREVENTA", userId: "u-ivan" }), { ...dePaulina, ownerId: "u-ivan" })).toBe(true);
  });
});
