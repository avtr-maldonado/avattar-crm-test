import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { hrefDeAnalisis, parseFiltrosDeAnalisis } from "./analisis";

function sesion(p: Partial<Session> & Pick<Session, "role" | "userId">): Session {
  return {
    email: "x@avattar.com",
    name: "X",
    countryCodes: ["MX"],
    permissions: new Set(),
    limits: {},
    ...p,
  } as Session;
}

const gerente = sesion({ role: "GERENTE_PAIS", userId: "u-jorge", countryCodes: ["MX"] });
const direccion = sesion({ role: "DIRECCION", userId: "u-dir", countryCodes: ["MX", "CO", "CL"] });
const params = (qs: string) => new URLSearchParams(qs);
const OPCIONES = { anioActual: 2026 };

describe("parseFiltrosDeAnalisis · el estado vive en la URL (INV-10)", () => {
  it("sin nada: pestaña Ventas, año en curso, sin recortes, agrupaciones por omisión", () => {
    const f = parseFiltrosDeAnalisis(params(""), direccion, OPCIONES);
    expect(f.pestana).toBe("ventas");
    expect(f.anio).toBe(2026);
    expect(f.pais).toBeNull();
    expect(f.vendedor).toBeNull();
    expect(f.producto).toBeNull();
    expect(f.tipo).toBeNull();
    expect(f.g1).toBe("trimestre");
    expect(f.g2).toBe("trimestre");
    expect(f.g3).toBe("producto");
    expect(f.g4).toBe("cliente");
    expect(f.prob).toBeNull();
    expect(f.pron).toEqual([]);
  });

  it("lee cada parámetro cuando es válido", () => {
    const f = parseFiltrosDeAnalisis(
      params("p=forecast&pais=CO&vendedor=u-1&anio=2025&producto=p-9&tipo=RENOVACION&g1=cliente&g2=anio&g3=tipo&g4=vendedor&prob=50&pron=COMPROMISO&pron=MEJOR_CASO"),
      direccion,
      OPCIONES,
    );
    expect(f.pestana).toBe("forecast");
    expect(f.pais).toBe("CO");
    expect(f.vendedor).toBe("u-1");
    expect(f.anio).toBe(2025);
    expect(f.producto).toBe("p-9");
    expect(f.tipo).toBe("RENOVACION");
    expect(f.g1).toBe("cliente");
    expect(f.g2).toBe("anio");
    expect(f.g3).toBe("tipo");
    expect(f.g4).toBe("vendedor");
    expect(f.prob).toBe(50);
    expect(f.pron).toEqual(["COMPROMISO", "MEJOR_CASO"]);
  });

  it("un país fuera del alcance de la sesión no filtra: nunca amplía (AC-25)", () => {
    const f = parseFiltrosDeAnalisis(params("pais=CO"), gerente, OPCIONES);
    expect(f.pais).toBeNull();
  });

  it("lo inválido cae al valor por omisión, no revienta", () => {
    const f = parseFiltrosDeAnalisis(
      params("p=otra&anio=abc&tipo=INVENTADO&g1=nada&prob=150&pron=X"),
      direccion,
      OPCIONES,
    );
    expect(f.pestana).toBe("ventas");
    expect(f.anio).toBe(2026);
    expect(f.tipo).toBeNull();
    expect(f.g1).toBe("trimestre");
    expect(f.prob).toBeNull();
    expect(f.pron).toEqual([]);
  });
});

describe("hrefDeAnalisis · listas", () => {
  it("una lista escribe el parámetro tantas veces como valores; vacía, lo quita", () => {
    const sp = new URLSearchParams("p=forecast&pron=PIPELINE&g4=cliente");
    expect(hrefDeAnalisis(sp, { pron: ["PIPELINE", "COMPROMISO"] })).toBe(
      "/analisis?p=forecast&g4=cliente&pron=PIPELINE&pron=COMPROMISO",
    );
    expect(hrefDeAnalisis(sp, { pron: [] })).toBe("/analisis?p=forecast&g4=cliente");
  });
});
