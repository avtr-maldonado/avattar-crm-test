import { describe, expect, it } from "vitest";
import { CAMPO_PRISMA, resolvePeriod, trimestreDe } from "./dates";

/** `from` es nulo solo en VENCIDAS, que no tiene piso. */
const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
const AHORA = new Date("2026-09-01T12:00:00Z");

describe("trimestreDe · §10.1", () => {
  it("con año fiscal = calendario, septiembre cae en T3", () => {
    // El supuesto Q-02, inferido del prototipo que muestra septiembre en T3.
    expect(trimestreDe(AHORA, 1)).toEqual({ fiscalYear: 2026, quarter: 3 });
  });

  it("mapea los cuatro trimestres del año calendario", () => {
    const casos: [string, number][] = [
      ["2026-01-15", 1],
      ["2026-03-31", 1],
      ["2026-04-01", 2],
      ["2026-06-30", 2],
      ["2026-07-01", 3],
      ["2026-09-30", 3],
      ["2026-10-01", 4],
      ["2026-12-31", 4],
    ];
    for (const [fecha, trimestre] of casos) {
      expect(trimestreDe(new Date(`${fecha}T12:00:00Z`), 1).quarter, fecha).toBe(trimestre);
    }
  });

  it("respeta un año fiscal que no empieza en enero", () => {
    // Está parametrizado por si Avattar cambia (Q-02). Con inicio en abril,
    // septiembre cae en T2 del año fiscal, no en T3.
    expect(trimestreDe(AHORA, 4)).toEqual({ fiscalYear: 2026, quarter: 2 });
    // Y enero pertenece al año fiscal anterior.
    expect(trimestreDe(new Date("2026-01-15T12:00:00Z"), 4)).toEqual({
      fiscalYear: 2025,
      quarter: 4,
    });
  });
});

describe("resolvePeriod · §9.3, AC-26", () => {
  it("ESTE_TRIMESTRE resuelve contra el año fiscal configurado", () => {
    const r = resolvePeriod("ESTE_TRIMESTRE", 1, AHORA);
    expect(iso(r!.from)).toBe("2026-07-01");
    expect(iso(r!.to)).toBe("2026-09-30");
  });

  it("TRIMESTRE_ANTERIOR y PROXIMO_TRIMESTRE se mueven de tres en tres", () => {
    const anterior = resolvePeriod("TRIMESTRE_ANTERIOR", 1, AHORA)!;
    expect([iso(anterior.from), iso(anterior.to)]).toEqual(["2026-04-01", "2026-06-30"]);

    const proximo = resolvePeriod("PROXIMO_TRIMESTRE", 1, AHORA)!;
    expect([iso(proximo.from), iso(proximo.to)]).toEqual(["2026-10-01", "2026-12-31"]);
  });

  it("cruza el fin de año sin equivocarse", () => {
    const enDiciembre = new Date("2026-12-15T12:00:00Z");
    const proximo = resolvePeriod("PROXIMO_TRIMESTRE", 1, enDiciembre)!;
    expect([iso(proximo.from), iso(proximo.to)]).toEqual(["2027-01-01", "2027-03-31"]);
  });

  it("ESTE_ANIO y ANIO_ANTERIOR cubren el año fiscal completo", () => {
    const esteAnio = resolvePeriod("ESTE_ANIO", 1, AHORA)!;
    expect([iso(esteAnio.from), iso(esteAnio.to)]).toEqual(["2026-01-01", "2026-12-31"]);

    const anterior = resolvePeriod("ANIO_ANTERIOR", 1, AHORA)!;
    expect([iso(anterior.from), iso(anterior.to)]).toEqual(["2025-01-01", "2025-12-31"]);
  });

  it("con año fiscal en abril, ESTE_ANIO va de abril a marzo", () => {
    const r = resolvePeriod("ESTE_ANIO", 4, AHORA)!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("ULTIMOS_30_DIAS y ULTIMOS_90_DIAS miran hacia atrás desde hoy", () => {
    const treinta = resolvePeriod("ULTIMOS_30_DIAS", 1, AHORA)!;
    expect([iso(treinta.from), iso(treinta.to)]).toEqual(["2026-08-02", "2026-09-01"]);

    const noventa = resolvePeriod("ULTIMOS_90_DIAS", 1, AHORA)!;
    expect(iso(noventa.from)).toBe("2026-06-03");
  });

  it("VENCIDAS es todo lo anterior a hoy, sin piso", () => {
    const r = resolvePeriod("VENCIDAS", 1, AHORA)!;
    expect(iso(r.to)).toBe("2026-08-31");
    expect(r.from).toBeNull();
  });

  it("PERSONALIZADO no resuelve nada: las fechas las pone el usuario", () => {
    expect(resolvePeriod("PERSONALIZADO", 1, AHORA)).toBeNull();
  });
});

describe("CAMPO_PRISMA · §9.3", () => {
  it("cada campo de fecha apunta a una columna distinta", () => {
    expect(CAMPO_PRISMA.CIERRE_ESTIMADO).toBe("expectedCloseDate");
    expect(CAMPO_PRISMA.CIERRE_REAL).toBe("actualCloseDate");
    expect(CAMPO_PRISMA.CREACION).toBe("createdAt");
    expect(CAMPO_PRISMA.ULTIMA_ACTIVIDAD).toBe("lastActivityAt");
  });

  it("son cuatro, y ninguno se repite", () => {
    const columnas = Object.values(CAMPO_PRISMA);
    expect(columnas).toHaveLength(4);
    expect(new Set(columnas).size).toBe(4);
  });
});
