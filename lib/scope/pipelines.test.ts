import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { pipelinePorOmision, type PipelineConEtapas } from "./pipelines";

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

/**
 * Los pipelines **en el orden en que `listPipelines` los devuelve**: por
 * `isRenewal` y luego por nombre. Ese orden alfabético es el corazón del
 * defecto que estas pruebas cubren, así que reproducirlo importa.
 */
function pipelines(): PipelineConEtapas[] {
  return [
    { id: "p-cl", name: "Ventas Chile", countryCode: "CL", isRenewal: false, stages: [] },
    { id: "p-co", name: "Ventas Colombia", countryCode: "CO", isRenewal: false, stages: [] },
    { id: "p-mx", name: "Ventas México", countryCode: "MX", isRenewal: false, stages: [] },
    { id: "p-ren", name: "Renovaciones MX", countryCode: "MX", isRenewal: true, stages: [] },
  ] as unknown as PipelineConEtapas[];
}

describe("pipelinePorOmision", () => {
  it("un gerente de un solo país ve el de su país", () => {
    const jorge = sesion({ role: "GERENTE_PAIS", userId: "u-jorge", countryCodes: ["MX"] });
    expect(pipelinePorOmision(pipelines(), jorge, "MX")?.name).toBe("Ventas México");
  });

  it("nunca abre en el de renovaciones: ahí no está el trabajo diario", () => {
    const soloRenovaciones = pipelines().filter((p) => p.isRenewal || p.countryCode !== "MX");
    const jorge = sesion({ role: "GERENTE_PAIS", userId: "u-jorge", countryCodes: ["MX"] });
    // Con solo Renovaciones MX disponible para su país, prefiere cualquier
    // pipeline de venta antes que el de renovaciones.
    expect(pipelinePorOmision(soloRenovaciones, jorge, "MX")?.isRenewal).toBe(false);
  });

  it("con varios países abre en el ACTIVO, no en el primero del alfabeto", () => {
    // El defecto: `listPipelines` ordena por nombre, y entre los de venta
    // «Ventas Chile» va antes que «Ventas México». Dirección y Administración
    // llevan MX, CO y CL, así que abrían en Chile —donde no hay una sola
    // oportunidad— y el tablero salía vacío con la base llena.
    const direccion = sesion({
      role: "DIRECCION",
      userId: "u-dir",
      countryCodes: ["MX", "CO", "CL"],
    });
    expect(pipelinePorOmision(pipelines(), direccion, "MX")?.name).toBe("Ventas México");
  });

  it("respeta el país activo cuando no es el primero del usuario", () => {
    // Es lo que hará el selector de país de la barra superior: cambiar de país
    // tiene que cambiar el tablero.
    const direccion = sesion({
      role: "DIRECCION",
      userId: "u-dir",
      countryCodes: ["MX", "CO", "CL"],
    });
    expect(pipelinePorOmision(pipelines(), direccion, "CO")?.name).toBe("Ventas Colombia");
  });

  it("si el país activo no tiene pipeline, cae en uno de venta antes que en ninguno", () => {
    // Una pantalla en blanco no le dice nada a nadie. Mejor mostrar un pipeline
    // real y que el encabezado diga de qué país es.
    const sinChile = pipelines().filter((p) => p.countryCode !== "CL");
    const admin = sesion({
      role: "ADMINISTRADOR",
      userId: "u-admin",
      countryCodes: ["MX", "CO", "CL"],
    });
    const elegido = pipelinePorOmision(sinChile, admin, "CL");
    expect(elegido).toBeDefined();
    expect(elegido?.isRenewal).toBe(false);
  });

  it("sin pipelines no inventa nada", () => {
    const admin = sesion({ role: "ADMINISTRADOR", userId: "u-admin" });
    expect(pipelinePorOmision([], admin, "MX")).toBeUndefined();
  });
});
