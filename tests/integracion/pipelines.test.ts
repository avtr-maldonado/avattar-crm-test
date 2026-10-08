import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { listPipelines } from "@/lib/scope/pipelines";

/**
 * El alta de oportunidad ofrece **los pipelines de los países que la sesión
 * alcanza** (decisiones §48). El alcance de países es `countryCodes` para todo
 * rol: con un país, solo el de ese país; con varios, los de esos países. Antes
 * Dirección y Administración recibían todos sin mirar sus países.
 */
function sesion(p: Partial<Session> & Pick<Session, "role" | "countryCodes">): Session {
  return {
    userId: "u-prueba",
    email: "x@avattar.com",
    name: "X",
    permissions: new Set(),
    limits: {},
    ...p,
  };
}

describe("listPipelines · países de la sesión", () => {
  it("una administradora con un solo país recibe solo los pipelines de ese país", async () => {
    const pipelines = await listPipelines(sesion({ role: "ADMINISTRADOR", countryCodes: ["CL"] }));
    expect(pipelines.length).toBeGreaterThan(0);
    expect(new Set(pipelines.map((p) => p.countryCode))).toEqual(new Set(["CL"]));
  });

  it("con dos países recibe los de esos dos, y no los del tercero", async () => {
    const pipelines = await listPipelines(sesion({ role: "DIRECCION", countryCodes: ["MX", "CO"] }));
    const paises = new Set(pipelines.map((p) => p.countryCode));
    expect(paises.has("MX")).toBe(true);
    expect(paises.has("CO")).toBe(true);
    expect(paises.has("CL")).toBe(false);
  });

  it("un vendedor sigue recibiendo solo los de su país", async () => {
    const pipelines = await listPipelines(sesion({ role: "VENDEDOR", countryCodes: ["MX"] }));
    expect(new Set(pipelines.map((p) => p.countryCode))).toEqual(new Set(["MX"]));
  });
});
