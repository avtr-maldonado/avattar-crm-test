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
const OPCIONES = { anioActual: 2026, fiscalYearStartMonth: 1 };

describe("parseFiltrosDeAnalisis · el estado vive en la URL (INV-10)", () => {
  it("sin nada: pestaña Ventas, año en curso, sin recortes, agrupaciones por omisión", () => {
    const f = parseFiltrosDeAnalisis(params(""), direccion, OPCIONES);
    expect(f.pestana).toBe("ventas");
    expect(f.anio).toBe(2026);
    expect(f.pais).toEqual([]);
    expect(f.vendedor).toEqual([]);
    // Producto y tipo de negocio dejaron de ser filtros (§36): ni por la URL.
    expect(f).not.toHaveProperty("producto");
    expect(f).not.toHaveProperty("tipo");
    expect(f.g1).toBe("trimestre");
    expect(f.g2).toBe("trimestre");
    expect(f.g3).toBe("producto");
    expect(f.g4).toBe("cliente");
    // Reporte 5 · el ciclo de venta se ve por vendedor salvo que la URL diga trimestre (§37).
    expect(f.g5).toBe("vendedor");
    expect(f.prob).toBeNull();
    expect(f.pron).toEqual([]);
  });

  it("lee cada parámetro cuando es válido", () => {
    const f = parseFiltrosDeAnalisis(
      params("p=forecast&pais=CO&pais=CL&vendedor=u-1&vendedor=u-2&anio=2025&g1=cliente&g2=anio&g3=tipo&g4=vendedor&g5=trimestre&prob=50&pron=COMPROMISO&pron=MEJOR_CASO"),
      direccion,
      OPCIONES,
    );
    expect(f.pestana).toBe("forecast");
    expect(f.pais).toEqual(["CO", "CL"]);
    expect(f.vendedor).toEqual(["u-1", "u-2"]);
    expect(f.anio).toBe(2025);
    expect(f.g1).toBe("cliente");
    expect(f.g2).toBe("anio");
    expect(f.g3).toBe("tipo");
    expect(f.g4).toBe("vendedor");
    expect(f.g5).toBe("trimestre");
    expect(f.prob).toBe(50);
    expect(f.pron).toEqual(["COMPROMISO", "MEJOR_CASO"]);
  });

  it("un país fuera del alcance de la sesión se descarta: nunca amplía (AC-25)", () => {
    expect(parseFiltrosDeAnalisis(params("pais=CO"), gerente, OPCIONES).pais).toEqual([]);
    expect(parseFiltrosDeAnalisis(params("pais=CO&pais=MX"), gerente, OPCIONES).pais).toEqual(["MX"]);
  });

  it("un valor repetido o vacío no cuenta dos veces ni cuenta en blanco", () => {
    const f = parseFiltrosDeAnalisis(params("vendedor=u-1&vendedor=u-1&vendedor="), direccion, OPCIONES);
    expect(f.vendedor).toEqual(["u-1"]);
  });

  it("lo inválido cae al valor por omisión, no revienta", () => {
    const f = parseFiltrosDeAnalisis(
      params("p=otra&anio=abc&g1=nada&g5=mes&prob=150&pron=X"),
      direccion,
      OPCIONES,
    );
    expect(f.pestana).toBe("ventas");
    expect(f.anio).toBe(2026);
    expect(f.g1).toBe("trimestre");
    expect(f.g5).toBe("vendedor");
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

describe("parseFiltrosDeAnalisis · el lapso (decisiones §45)", () => {
  it("sin nada, el lapso es el año fiscal en curso y `anio` lo refleja", () => {
    const f = parseFiltrosDeAnalisis(params(""), direccion, OPCIONES);
    expect(f.lapso).toEqual({ tipo: "anio", fiscalYear: 2026 });
    expect(f.anio).toBe(2026);
  });

  it("un trimestre o un mes dan su año fiscal en `anio`, según el calendario fiscal", () => {
    expect(parseFiltrosDeAnalisis(params("q=2025-Q2"), direccion, OPCIONES).lapso).toEqual({ tipo: "trimestre", fiscalYear: 2025, quarter: 2 });
    expect(parseFiltrosDeAnalisis(params("q=2025-Q2"), direccion, OPCIONES).anio).toBe(2025);
    const abril = parseFiltrosDeAnalisis(params("mes=2026-02"), direccion, { ...OPCIONES, fiscalYearStartMonth: 4 });
    expect(abril.lapso).toEqual({ tipo: "mes", anio: 2026, mes: 2 });
    expect(abril.anio).toBe(2025);
  });
});
