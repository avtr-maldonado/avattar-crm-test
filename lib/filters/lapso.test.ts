import { describe, expect, it } from "vitest";
import {
  anioFiscalDeLapso,
  enElLapso,
  etiquetaDeLapso,
  parametrosDeLapso,
  parseLapso,
  rangoDeLapso,
  trimestresDelLapso,
  type Lapso,
} from "./lapso";

/**
 * El lapso de Análisis (decisiones §45): un año fiscal, un trimestre fiscal,
 * un mes calendario o un rango de fechas. Vive en la URL y lo inválido cae al
 * año fiscal en curso, sin romper.
 */
const sp = (qs: string) => new URLSearchParams(qs);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("parseLapso · de la URL al lapso", () => {
  it("sin nada, el año fiscal en curso; con anio=, ese año", () => {
    expect(parseLapso(sp(""), 2026)).toEqual({ tipo: "anio", fiscalYear: 2026 });
    expect(parseLapso(sp("anio=2025"), 2026)).toEqual({ tipo: "anio", fiscalYear: 2025 });
  });

  it("q= es un trimestre fiscal; mes= un mes calendario; desde= y hasta= un rango", () => {
    expect(parseLapso(sp("q=2026-Q3"), 2026)).toEqual({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 });
    expect(parseLapso(sp("mes=2026-09"), 2026)).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    expect(parseLapso(sp("desde=2026-07-01&hasta=2026-09-30"), 2026)).toEqual({ tipo: "rango", desde: "2026-07-01", hasta: "2026-09-30" });
  });

  it("el más específico manda si vienen varios", () => {
    expect(parseLapso(sp("anio=2025&q=2026-Q2"), 2026).tipo).toBe("trimestre");
    expect(parseLapso(sp("q=2026-Q2&mes=2026-05"), 2026).tipo).toBe("mes");
    expect(parseLapso(sp("mes=2026-05&desde=2026-05-01&hasta=2026-05-15"), 2026).tipo).toBe("rango");
  });

  it("lo inválido cae al año en curso: trimestre 5, mes 13, fecha que no existe, rango al revés o a medias", () => {
    const actual: Lapso = { tipo: "anio", fiscalYear: 2026 };
    expect(parseLapso(sp("q=2026-Q5"), 2026)).toEqual(actual);
    expect(parseLapso(sp("mes=2026-13"), 2026)).toEqual(actual);
    expect(parseLapso(sp("desde=2026-02-30&hasta=2026-03-01"), 2026)).toEqual(actual);
    expect(parseLapso(sp("desde=2026-09-30&hasta=2026-07-01"), 2026)).toEqual(actual);
    expect(parseLapso(sp("desde=2026-07-01"), 2026)).toEqual(actual);
    expect(parseLapso(sp("anio=abc"), 2026)).toEqual(actual);
  });
});

describe("rangoDeLapso · del lapso a las fechas que recortan", () => {
  it("un año fiscal que arranca en abril va de abril a marzo", () => {
    const r = rangoDeLapso({ tipo: "anio", fiscalYear: 2026 }, 4);
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("un trimestre fiscal usa el calendario fiscal; un mes es calendario", () => {
    const q3 = rangoDeLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 }, 1);
    expect([iso(q3.from), iso(q3.to)]).toEqual(["2026-07-01", "2026-09-30"]);
    const q1Abril = rangoDeLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 1 }, 4);
    expect([iso(q1Abril.from), iso(q1Abril.to)]).toEqual(["2026-04-01", "2026-06-30"]);
    const feb = rangoDeLapso({ tipo: "mes", anio: 2028, mes: 2 }, 4);
    expect([iso(feb.from), iso(feb.to)]).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("un rango es tal cual, con el último día incluido", () => {
    const r = rangoDeLapso({ tipo: "rango", desde: "2026-07-15", hasta: "2026-08-02" }, 1);
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-07-15", "2026-08-02"]);
  });
});

describe("etiquetas, año fiscal y trimestres del lapso", () => {
  it("se nombra corto y se lee en prosa", () => {
    expect(etiquetaDeLapso({ tipo: "anio", fiscalYear: 2026 })).toBe("Año fiscal 2026");
    expect(etiquetaDeLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 })).toBe("Q3 2026");
    expect(etiquetaDeLapso({ tipo: "mes", anio: 2026, mes: 9 })).toBe("sep 2026");
    expect(etiquetaDeLapso({ tipo: "rango", desde: "2026-07-01", hasta: "2026-09-30" })).toBe("1 jul – 30 sep 2026");
    expect(enElLapso({ tipo: "anio", fiscalYear: 2026 })).toBe("en el año fiscal 2026");
    expect(enElLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 })).toBe("en el Q3 2026");
    expect(enElLapso({ tipo: "mes", anio: 2026, mes: 9 })).toBe("en sep 2026");
    expect(enElLapso({ tipo: "rango", desde: "2025-12-01", hasta: "2026-01-31" })).toBe("del 1 dic 2025 al 31 ene 2026");
  });

  it("el año fiscal del lapso es el de su inicio; el mes y el rango dependen del calendario fiscal", () => {
    expect(anioFiscalDeLapso({ tipo: "anio", fiscalYear: 2025 }, 1)).toBe(2025);
    expect(anioFiscalDeLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 4 }, 4)).toBe(2026);
    expect(anioFiscalDeLapso({ tipo: "mes", anio: 2026, mes: 2 }, 4)).toBe(2025);
    expect(anioFiscalDeLapso({ tipo: "rango", desde: "2026-03-15", hasta: "2026-04-15" }, 4)).toBe(2025);
  });

  it("la cuota se compara solo con un año o un trimestre fiscal completos: los demás no tienen trimestres", () => {
    expect(trimestresDelLapso({ tipo: "anio", fiscalYear: 2026 })).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    expect(trimestresDelLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 })).toEqual(["2026-Q3"]);
    expect(trimestresDelLapso({ tipo: "mes", anio: 2026, mes: 9 })).toBeNull();
    expect(trimestresDelLapso({ tipo: "rango", desde: "2026-07-01", hasta: "2026-09-30" })).toBeNull();
  });

  it("parametrosDeLapso escribe solo lo suyo y anula el resto, para que la URL no mezcle modos", () => {
    expect(parametrosDeLapso({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 })).toEqual({ anio: null, q: "2026-Q3", mes: null, desde: null, hasta: null });
    expect(parametrosDeLapso({ tipo: "rango", desde: "2026-07-01", hasta: "2026-09-30" })).toEqual({ anio: null, q: null, mes: null, desde: "2026-07-01", hasta: "2026-09-30" });
    expect(parametrosDeLapso({ tipo: "anio", fiscalYear: 2026 })).toEqual({ anio: "2026", q: null, mes: null, desde: null, hasta: null });
    expect(parametrosDeLapso({ tipo: "mes", anio: 2026, mes: 9 })).toEqual({ anio: null, q: null, mes: "2026-09", desde: null, hasta: null });
  });
});
