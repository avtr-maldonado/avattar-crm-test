import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { buildForecast, type OportunidadParaForecast } from "./forecast";

/**
 * La vista Forecast de P-01 · un tablero de columnas por mes o por trimestre
 * fiscal, con las oportunidades dentro de la columna de su cierre estimado.
 *
 * Dos lentes sobre el mismo dinero, y son distintas a propósito:
 *
 *   - **La categoría** es el juicio del vendedor (`RN-15`): compromiso, mejor
 *     caso, pipeline u omitida.
 *   - **El ponderado** es la etapa (`RN-01`): importe × probabilidad.
 *
 * La ventana es fija —seis meses o cuatro trimestres— y se desplaza hacia
 * adelante. Lo que queda fuera se cuenta, no se pierde.
 */
const HOY = new Date("2026-09-17T12:00:00Z");

function abierta(p: Partial<OportunidadParaForecast> = {}): OportunidadParaForecast {
  return {
    amount: money("100"),
    expectedCloseDate: new Date("2026-10-15T00:00:00Z"),
    forecastCategory: "PIPELINE",
    stage: { probability: money("0.5") },
    ...p,
  };
}

const MES = { agrupar: "mes", fiscalYearStartMonth: 1, ahora: HOY } as const;
const TRIMESTRE = { agrupar: "trimestre", fiscalYearStartMonth: 1, ahora: HOY } as const;

describe("buildForecast · la ventana", () => {
  it("por meses arranca en el mes en curso y muestra seis, aunque estén vacíos", () => {
    const { columnas } = buildForecast([], MES);

    expect(columnas).toHaveLength(6);
    expect(columnas[0]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    expect(columnas[5]!.periodo).toEqual({ tipo: "mes", anio: 2027, mes: 2 });
    expect(columnas.every((c) => c.total.isZero())).toBe(true);
  });

  it("por trimestres, con año fiscal calendario, septiembre es T3 y muestra cuatro", () => {
    const { columnas } = buildForecast([], TRIMESTRE);

    expect(columnas).toHaveLength(4);
    expect(columnas[0]!.periodo).toEqual({ tipo: "trimestre", fiscalYear: 2026, quarter: 3 });
    expect(columnas[3]!.periodo).toEqual({ tipo: "trimestre", fiscalYear: 2027, quarter: 2 });
  });

  it("respeta el mes de arranque del año fiscal (INV-05: es dato, no constante)", () => {
    // Con el año fiscal empezando en abril, septiembre es T2 y enero de 2027
    // sigue siendo el año fiscal 2026.
    const { columnas } = buildForecast(
      [abierta({ expectedCloseDate: new Date("2027-01-20T00:00:00Z") })],
      { ...TRIMESTRE, fiscalYearStartMonth: 4 },
    );

    expect(columnas[0]!.periodo).toEqual({ tipo: "trimestre", fiscalYear: 2026, quarter: 2 });
    const enero = columnas.find((c) => c.oportunidades.length === 1)!;
    expect(enero.periodo).toEqual({ tipo: "trimestre", fiscalYear: 2026, quarter: 4 });
  });

  it("se desplaza hacia adelante de periodo en periodo", () => {
    const { columnas } = buildForecast([], { ...MES, desplazamiento: 2 });

    expect(columnas).toHaveLength(6);
    expect(columnas[0]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 11 });
    expect(columnas[5]!.periodo).toEqual({ tipo: "mes", anio: 2027, mes: 4 });
  });

  it("no mira hacia atrás: un desplazamiento negativo vale cero", () => {
    // El pasado del forecast no existe: lo que tenía cierre estimado atrás y
    // sigue abierto está vencido, y eso tiene su propia columna.
    const { columnas } = buildForecast([], { ...MES, desplazamiento: -3 });
    expect(columnas[0]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
  });
});

describe("buildForecast · dónde cae cada oportunidad", () => {
  it("cada oportunidad va en la columna de su cierre estimado, con su importe", () => {
    const a = abierta({ expectedCloseDate: new Date("2026-10-03T00:00:00Z"), amount: money("100") });
    const b = abierta({ expectedCloseDate: new Date("2026-10-28T00:00:00Z"), amount: money("250") });
    const c = abierta({ expectedCloseDate: new Date("2026-12-01T00:00:00Z"), amount: money("40") });
    const { columnas } = buildForecast([a, b, c], MES);

    const octubre = columnas.find((x) => x.clave === "2026-10")!;
    expect(octubre.oportunidades).toEqual([a, b]);
    expect(octubre.total.toString()).toBe("350");
    expect(columnas.find((x) => x.clave === "2026-12")!.total.toString()).toBe("40");
  });

  it("lo que ya venció va en una columna aparte, al principio", () => {
    const vencida = abierta({
      expectedCloseDate: new Date("2026-08-30T00:00:00Z"),
      amount: money("999"),
    });
    const { columnas } = buildForecast([vencida], MES);

    expect(columnas[0]!.periodo).toEqual({ tipo: "vencidas" });
    expect(columnas[0]!.oportunidades).toEqual([vencida]);
    expect(columnas[0]!.total.toString()).toBe("999");
    // El mes en curso sigue siendo la primera columna normal, y la ventana no
    // se achica por la columna extra.
    expect(columnas[1]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    expect(columnas).toHaveLength(7);
  });

  it("sin nada vencido no hay columna de vencidas", () => {
    const { columnas } = buildForecast([abierta()], MES);
    expect(columnas.some((c) => c.periodo.tipo === "vencidas")).toBe(false);
  });

  it("cierre estimado hoy mismo no está vencido", () => {
    const { columnas } = buildForecast(
      [abierta({ expectedCloseDate: new Date("2026-09-17T00:00:00Z") })],
      MES,
    );
    expect(columnas[0]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 9 });
    expect(columnas[0]!.oportunidades).toHaveLength(1);
  });

  it("marca el periodo en curso, nunca la columna de vencidas", () => {
    const { columnas } = buildForecast(
      [abierta({ expectedCloseDate: new Date("2026-01-01T00:00:00Z") })],
      TRIMESTRE,
    );

    expect(columnas[0]!.periodo.tipo).toBe("vencidas");
    expect(columnas[0]!.esActual).toBe(false);
    expect(columnas[1]!.esActual).toBe(true);
    expect(columnas.filter((c) => c.esActual)).toHaveLength(1);
  });
});

describe("buildForecast · lo que queda fuera de la ventana", () => {
  it("cuenta lo que cae después de la última columna", () => {
    const { columnas, fueraDeVentana } = buildForecast(
      [
        abierta({ expectedCloseDate: new Date("2027-08-10T00:00:00Z") }),
        abierta({ expectedCloseDate: new Date("2028-01-10T00:00:00Z") }),
      ],
      MES,
    );

    expect(columnas).toHaveLength(6);
    expect(fueraDeVentana.despues).toBe(2);
    expect(fueraDeVentana.antes).toBe(0);
  });

  it("al desplazarse, lo que quedó atrás se cuenta como «antes», vencidas incluidas", () => {
    const { columnas, fueraDeVentana } = buildForecast(
      [
        abierta({ expectedCloseDate: new Date("2026-08-01T00:00:00Z") }), // vencida
        abierta({ expectedCloseDate: new Date("2026-10-15T00:00:00Z") }), // antes de la ventana
        abierta({ expectedCloseDate: new Date("2027-01-15T00:00:00Z") }), // dentro
      ],
      { ...MES, desplazamiento: 3 },
    );

    // Desplazada, la columna de vencidas no se muestra: lo vencido cuenta atrás.
    expect(columnas.some((c) => c.periodo.tipo === "vencidas")).toBe(false);
    expect(columnas[0]!.periodo).toEqual({ tipo: "mes", anio: 2026, mes: 12 });
    expect(fueraDeVentana.antes).toBe(2);
    expect(fueraDeVentana.despues).toBe(0);
    expect(columnas.find((c) => c.clave === "2027-01")!.oportunidades).toHaveLength(1);
  });

  it("nada se pierde: columnas más fuera de la ventana suman todo lo abierto", () => {
    const todas = [
      abierta({ expectedCloseDate: new Date("2026-08-01T00:00:00Z") }),
      abierta({ expectedCloseDate: new Date("2026-10-01T00:00:00Z") }),
      abierta({ expectedCloseDate: new Date("2027-06-01T00:00:00Z") }),
      abierta({ expectedCloseDate: new Date("2029-06-01T00:00:00Z") }),
    ];
    const { columnas, fueraDeVentana } = buildForecast(todas, MES);
    const enColumnas = columnas.reduce((n, c) => n + c.oportunidades.length, 0);

    expect(enColumnas + fueraDeVentana.antes + fueraDeVentana.despues).toBe(todas.length);
  });
});

describe("buildForecast · las dos lentes", () => {
  it("el ponderado es importe × probabilidad de etapa, sumado (RN-01)", () => {
    const { columnas } = buildForecast(
      [
        abierta({ amount: money("1000"), stage: { probability: money("0.25") } }),
        abierta({ amount: money("400"), stage: { probability: money("0.75") } }),
      ],
      MES,
    );
    expect(columnas.find((c) => c.clave === "2026-10")!.ponderado.toString()).toBe("550");
  });

  it("reparte el importe por categoría de pronóstico, incluida la omitida", () => {
    const { columnas } = buildForecast(
      [
        abierta({ amount: money("100"), forecastCategory: "COMPROMISO" }),
        abierta({ amount: money("200"), forecastCategory: "MEJOR_CASO" }),
        abierta({ amount: money("300"), forecastCategory: "PIPELINE" }),
        abierta({ amount: money("50"), forecastCategory: "OMITIDA" }),
      ],
      MES,
    );

    const octubre = columnas.find((c) => c.clave === "2026-10")!;
    expect(octubre.porCategoria.COMPROMISO.toString()).toBe("100");
    expect(octubre.porCategoria.MEJOR_CASO.toString()).toBe("200");
    expect(octubre.porCategoria.PIPELINE.toString()).toBe("300");
    expect(octubre.porCategoria.OMITIDA.toString()).toBe("50");
    // El total abierto sí la incluye: es dinero que existe, solo que no se
    // pronostica. Cuadra con «Valor abierto» del encabezado.
    expect(octubre.total.toString()).toBe("650");
  });

  it("no pierde centavos (INV-03)", () => {
    const { columnas } = buildForecast(
      [abierta({ amount: money("0.10"), stage: { probability: money("0.3") } })],
      MES,
    );
    expect(columnas.find((c) => c.clave === "2026-10")!.ponderado.toString()).toBe("0.03");
  });
});

describe("buildForecast · las cerradas se ven, pero no suman · RN-12", () => {
  it("una ganada o perdida en la columna no entra al total ni al ponderado", () => {
    // Con el filtro de estatus se pueden mostrar cerradas en el tablero (§25).
    // Se acomodan en su columna para verlas; el dinero del forecast sigue
    // siendo solo lo abierto, que es lo que cuadra con «Valor abierto».
    const { columnas } = buildForecast(
      [
        abierta({ status: "ABIERTA", amount: money("100") }),
        abierta({ status: "GANADA", amount: money("1000") }),
        abierta({ status: "PERDIDA", amount: money("10000") }),
      ],
      MES,
    );
    const octubre = columnas.find((c) => c.periodo.tipo === "mes" && c.periodo.mes === 10)!;
    expect(octubre.oportunidades).toHaveLength(3);
    expect(octubre.total.toFixed(0)).toBe("100");
    expect(octubre.ponderado.toFixed(0)).toBe("50");
  });

  it("sin estatus en la entrada, todo cuenta como hasta hoy", () => {
    const { columnas } = buildForecast([abierta({ amount: money("100") }), abierta({ amount: money("200") })], MES);
    const octubre = columnas.find((c) => c.periodo.tipo === "mes" && c.periodo.mes === 10)!;
    expect(octubre.total.toFixed(0)).toBe("300");
  });
});
