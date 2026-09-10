import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { filtrosVisibles, parseFilters, toWhere } from "./opportunities";

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

const vendedor = sesion({ role: "VENDEDOR", userId: "u-paulina" });
const gerente = sesion({ role: "GERENTE_PAIS", userId: "u-jorge" });
const direccion = sesion({
  role: "DIRECCION",
  userId: "u-dir",
  countryCodes: ["MX", "CO", "CL"],
});

const AHORA = new Date("2026-09-01T12:00:00Z");
const opciones = { fiscalYearStartMonth: 1, ahora: AHORA };

const params = (qs: string) => new URLSearchParams(qs);

describe("parseFilters · valores por omisión", () => {
  it("abre SIN restringir: se ven todas las oportunidades del alcance", () => {
    /**
     * Diverge de §9.3, que abría en `ESTE_TRIMESTRE` y `ABIERTA`.
     *
     * Decisión del negocio del 9-sep-2026, después de que una oportunidad
     * recién creada con cierre en octubre desapareciera de la pantalla estando
     * el usuario en septiembre: el tablero decía «0 abiertas» y no había forma
     * de ver que estaba filtrando, porque la barra de filtros de §9 todavía no
     * existe. Un valor por omisión invisible que esconde datos es peor que no
     * tener valor por omisión.
     *
     * `dateField` sigue siendo `CIERRE_ESTIMADO`: AC-23 exige que el campo no
     * quede implícito **cuando hay rango**, y en cuanto alguien elija un
     * preajuste este es el que aplica.
     */
    const p = parseFilters(params(""), vendedor);
    expect(p.dateField).toBe("CIERRE_ESTIMADO");
    expect(p.period).toBe("PERSONALIZADO");
    expect(p.status).toEqual([]);
  });

  it("sin preajuste ni rango, no se arma cláusula de fecha", () => {
    const where = toWhere(parseFilters(params(""), vendedor), vendedor, opciones);
    expect(JSON.stringify(where)).not.toContain("expectedCloseDate");
  });

  it("elegir un preajuste sí filtra: lo que se quitó es el valor por omisión", () => {
    const where = toWhere(
      parseFilters(params("period=ESTE_TRIMESTRE"), vendedor),
      vendedor,
      opciones,
    );
    expect(JSON.stringify(where)).toContain("expectedCloseDate");
  });

  it("AC-23 · un rango sin dateField usa CIERRE_ESTIMADO y lo hace visible", () => {
    const p = parseFilters(params("from=2026-07-01&to=2026-09-30"), vendedor);
    expect(p.dateField).toBe("CIERRE_ESTIMADO");
    // No basta aplicarlo: la barra tiene que mostrarlo, o el reporte no se
    // puede reproducir. `visibles` es lo que la UI usa para pintarlo.
    expect(p.visibles).toContain("dateField");
  });

  it("un dateField explícito también queda visible", () => {
    const p = parseFilters(params("dateField=CIERRE_REAL&period=ESTE_ANIO"), gerente);
    expect(p.dateField).toBe("CIERRE_REAL");
    expect(p.visibles).toContain("dateField");
  });

  it("ignora valores de enum que no existen, en vez de romper", () => {
    // La URL es entrada del usuario: puede venir editada a mano.
    const p = parseFilters(params("dateField=INVENTADO&status=OTRO"), vendedor);
    expect(p.dateField).toBe("CIERRE_ESTIMADO");
    expect(p.status).toEqual([]);
  });
});

describe("filtrosVisibles · AC-24", () => {
  it("el filtro Vendedor NO aparece para el rol VENDEDOR", () => {
    // «Solo hay una opción posible y revelaría la lista de compañeros» (§9.1).
    expect(filtrosVisibles(vendedor)).not.toContain("owner");
    expect(filtrosVisibles(gerente)).toContain("owner");
    expect(filtrosVisibles(direccion)).toContain("owner");
  });

  it("el filtro País no aparece para quien tiene un solo país", () => {
    expect(filtrosVisibles(gerente)).not.toContain("country");
    expect(filtrosVisibles(direccion)).toContain("country");
  });
});

describe("toWhere · AC-25, INV-01", () => {
  it("el alcance del rol va PRIMERO, siempre", () => {
    const where = toWhere(parseFilters(params(""), vendedor), vendedor, opciones);
    expect(Array.isArray(where.AND)).toBe(true);
    const [alcance] = where.AND as object[];
    expect(alcance).toEqual({ deletedAt: null, ownerId: "u-paulina" });
  });

  it("un vendedor que pide otro propietario obtiene cero, no los del otro", () => {
    // El filtro `owner` está oculto para él, pero la URL se puede editar.
    const where = toWhere(parseFilters(params("owner=u-gabriel"), vendedor), vendedor, opciones);
    const serializado = JSON.stringify(where);
    expect(serializado).toContain('"ownerId":"u-paulina"');
    // El AND con su propio alcance hace que el conjunto quede vacío.
    expect(serializado).toContain("u-gabriel");
  });

  it("un vendedor que pide otro país tampoco lo obtiene", () => {
    const where = toWhere(parseFilters(params("country=CO"), vendedor), vendedor, opciones);
    expect(JSON.stringify(where)).toContain('"ownerId":"u-paulina"');
  });

  it("un gerente de México no alcanza Colombia por ningún filtro (AC-05)", () => {
    const where = toWhere(parseFilters(params("country=CO"), gerente), gerente, opciones);
    const [alcance] = where.AND as object[];
    expect(alcance).toEqual({ deletedAt: null, countryCode: { in: ["MX"] } });
  });
});

describe("toWhere · traducción de cada filtro", () => {
  it("traduce el rango de fechas al campo elegido (§9.3)", () => {
    const p = parseFilters(params("dateField=CIERRE_REAL&period=ESTE_TRIMESTRE"), gerente);
    const serializado = JSON.stringify(toWhere(p, gerente, opciones));
    expect(serializado).toContain("actualCloseDate");
    expect(serializado).not.toContain("expectedCloseDate");
  });

  it("el mismo rango sobre otro campo produce otra consulta", () => {
    // §9.3 · «un rango de fechas sin decir sobre qué campo aplica produce
    // números que nadie puede reproducir». El preajuste va explícito porque ya
    // no hay uno por omisión: sin rango no hay nada que atribuir a un campo.
    const estimado = JSON.stringify(
      toWhere(
        parseFilters(params("dateField=CIERRE_ESTIMADO&period=ESTE_TRIMESTRE"), gerente),
        gerente,
        opciones,
      ),
    );
    const creacion = JSON.stringify(
      toWhere(
        parseFilters(params("dateField=CREACION&period=ESTE_TRIMESTRE"), gerente),
        gerente,
        opciones,
      ),
    );
    expect(estimado).not.toBe(creacion);
  });

  it("la búsqueda libre cubre nombre, folio y organización (§9.2)", () => {
    const where = toWhere(parseFilters(params("q=aceros"), gerente), gerente, opciones);
    const serializado = JSON.stringify(where);
    expect(serializado).toContain("folio");
    expect(serializado).toContain("organization");
    expect(serializado).toContain("insensitive");
  });

  it("el rango de importe se traduce a gte y lte", () => {
    const where = toWhere(parseFilters(params("amountMin=100000&amountMax=500000"), gerente), gerente, opciones);
    const serializado = JSON.stringify(where);
    expect(serializado).toContain("gte");
    expect(serializado).toContain("lte");
  });

  it("el rango de MEDDIC filtra por puntaje", () => {
    const where = toWhere(parseFilters(params("meddicMin=70"), gerente), gerente, opciones);
    expect(JSON.stringify(where)).toContain("meddicScore");
  });

  it("sin filtros del usuario, solo queda el alcance", () => {
    // Ya sin valores por omisión: la única cláusula es la del rol. Eso es lo
    // que hace que la pantalla muestre todo lo que el usuario puede ver.
    const where = toWhere(parseFilters(params(""), direccion), direccion, opciones);
    expect((where.AND as object[]).length).toBe(1);
  });
});

describe("AC-22 · la vista es reproducible desde la URL", () => {
  it("los mismos parámetros producen la misma consulta", () => {
    const qs = "q=nube&stage=s1&stage=s2&status=ABIERTA&dateField=CREACION&period=ULTIMOS_90_DIAS";
    const a = toWhere(parseFilters(params(qs), gerente), gerente, opciones);
    const b = toWhere(parseFilters(params(qs), gerente), gerente, opciones);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("el orden de los parámetros en la URL no cambia el resultado", () => {
    const a = toWhere(parseFilters(params("q=nube&status=GANADA"), gerente), gerente, opciones);
    const b = toWhere(parseFilters(params("status=GANADA&q=nube"), gerente), gerente, opciones);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
