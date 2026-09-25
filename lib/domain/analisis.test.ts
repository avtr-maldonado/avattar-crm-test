import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import {
  actividadPorVendedor,
  agruparVentas,
  antiguedadYEstancamiento,
  cicloDeVenta,
  completarTrimestres,
  embudoDeForecast,
  historicoDeVentas,
  rentabilidad,
  saludMeddic,
  type OportunidadAbierta,
  type VentaGanada,
} from "./analisis";

/**
 * Los reportes de P-09 · todo puro, con `Decimal` (INV-03).
 *
 * Fechas que mandan (§10.2): las ventas se agrupan por `actualCloseDate`; el
 * forecast, por `expectedCloseDate`; el ciclo de venta va del alta al cierre
 * real; la antigüedad se mide hoy.
 */
const HOY = new Date("2026-09-25T12:00:00Z");
const FISCAL = { fiscalYearStartMonth: 1 };
const TIPOS = { NUEVO: "Cliente nuevo", EXPANSION: "Expansión", RENOVACION: "Renovación" };

const ANDINA = { id: "o1", name: "Grupo Andina" };
const NORTE = { id: "o2", name: "Banco del Norte" };
const JORGE = { id: "u1", name: "Jorge Medina" };
const PAULINA = { id: "u2", name: "Paulina Estrada" };

function ganada(p: Partial<VentaGanada> & { id: string }): VentaGanada {
  return {
    amount: money("100000"),
    actualCloseDate: new Date("2026-08-15T12:00:00Z"),
    createdAt: new Date("2026-06-01T12:00:00Z"),
    businessType: "NUEVO",
    organization: ANDINA,
    owner: JORGE,
    cotizacion: null,
    ...p,
  };
}

const CON_LINEAS: VentaGanada["cotizacion"] = {
  netSubtotal: money("100000"),
  totalCost: money("60000"),
  grossProfit: money("40000"),
  lineas: [
    { productId: "p1", descripcion: "Servicios administrados", importe: money("70000"), costo: money("45000") },
    { productId: "p2", descripcion: "Bolsa de horas", importe: money("30000"), costo: money("15000") },
  ],
};

describe("agruparVentas · avance contra objetivo, por dimensión", () => {
  const ventas = [
    ganada({ id: "a", actualCloseDate: new Date("2026-02-10T12:00:00Z"), amount: money("100000"), cotizacion: CON_LINEAS }),
    ganada({ id: "b", actualCloseDate: new Date("2026-08-15T12:00:00Z"), amount: money("300000"), organization: NORTE, businessType: "RENOVACION" }),
    ganada({ id: "c", actualCloseDate: new Date("2026-09-01T12:00:00Z"), amount: money("100000"), owner: PAULINA }),
  ];

  it("por trimestre fiscal, en orden, con participación sobre el total", () => {
    const r = agruparVentas(ventas, "trimestre", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Q1 2026", "Q3 2026"]);
    expect(r.filas[1]!.importe.toFixed(0)).toBe("400000");
    expect(r.filas[1]!.cuantas).toBe(2);
    expect(r.filas[1]!.participacion.toFixed(2)).toBe("0.80");
    expect(r.total.importe.toFixed(0)).toBe("500000");
    expect(r.total.cuantas).toBe(3);
  });

  it("por cliente, de mayor a menor importe", () => {
    const r = agruparVentas(ventas, "cliente", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Banco del Norte", "Grupo Andina"]);
    expect(r.filas[1]!.cuantas).toBe(2);
  });

  it("por tipo de negocio, con la etiqueta en español", () => {
    const r = agruparVentas(ventas, "tipo", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Renovación", "Cliente nuevo"]);
  });

  it("por producto reparte cada venta entre sus líneas; sin cotización, va aparte", () => {
    const r = agruparVentas(ventas, "producto", { ...FISCAL, etiquetaDeTipo: TIPOS });
    const porEtiqueta = Object.fromEntries(r.filas.map((f) => [f.etiqueta, f]));
    expect(porEtiqueta["Servicios administrados"]!.importe.toFixed(0)).toBe("70000");
    expect(porEtiqueta["Bolsa de horas"]!.importe.toFixed(0)).toBe("30000");
    expect(porEtiqueta["Sin cotización"]!.importe.toFixed(0)).toBe("400000");
    expect(porEtiqueta["Sin cotización"]!.cuantas).toBe(2);
  });

  it("la utilidad se suma solo donde llegó costo; sin ninguno, es nula (INV-02)", () => {
    const con = agruparVentas(ventas, "cliente", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(con.filas.find((f) => f.etiqueta === "Grupo Andina")!.utilidad?.toFixed(0)).toBe("40000");
    const sin = agruparVentas([ganada({ id: "x" })], "cliente", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(sin.filas[0]!.utilidad).toBeNull();
    expect(sin.total.utilidad).toBeNull();
  });

  it("sin ventas devuelve filas vacías y total en cero, para que la pantalla diga «sin datos»", () => {
    const r = agruparVentas([], "trimestre", { ...FISCAL, etiquetaDeTipo: TIPOS });
    expect(r.filas).toEqual([]);
    expect(r.total.importe.isZero()).toBe(true);
  });
});

describe("completarTrimestres · los cuatro trimestres del año, con su cuota", () => {
  it("pone en cero el trimestre sin ventas, une la cuota y calcula el cumplimiento", () => {
    const filas = [
      { clave: "2026-Q1", etiqueta: "Q1 2026", importe: money("120000"), utilidad: null, cuantas: 2, participacion: money("0.6") },
      { clave: "2026-Q3", etiqueta: "Q3 2026", importe: money("80000"), utilidad: null, cuantas: 1, participacion: money("0.4") },
    ];
    const cuotas = [money("100000"), money("100000"), money("100000"), money("0")];
    const r = completarTrimestres(filas, 2026, cuotas, { fiscalYear: 2026, quarter: 3 });
    expect(r.map((f) => f.etiqueta)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    // Un trimestre que no ha empezado no se mide: no se le puede reclamar la cuota.
    expect(r.map((f) => f.estado)).toEqual(["cerrado", "cerrado", "en_curso", "futuro"]);
    expect(r[1]!.importe.toString()).toBe("0");
    expect(r[1]!.cuantas).toBe(0);
    expect(r[0]!.cumplimiento!.toString()).toBe("1.2");
    expect(r[1]!.cumplimiento!.toString()).toBe("0");
    // Sin cuota no hay cumplimiento que calcular: nulo, no cero (C-02).
    expect(r[3]!.cuota.toString()).toBe("0");
    expect(r[3]!.cumplimiento).toBeNull();
  });

  it("un año pasado está todo cerrado; uno por venir, todo futuro", () => {
    const enCurso = { fiscalYear: 2026, quarter: 3 };
    expect(completarTrimestres([], 2025, [], enCurso).map((f) => f.estado)).toEqual(["cerrado", "cerrado", "cerrado", "cerrado"]);
    expect(completarTrimestres([], 2027, [], enCurso).map((f) => f.estado)).toEqual(["futuro", "futuro", "futuro", "futuro"]);
  });
});

describe("historicoDeVentas · por año y por trimestre, cronológico", () => {
  it("cada periodo trae su variación contra el anterior; el primero, nula", () => {
    const ventas = [
      ganada({ id: "a", actualCloseDate: new Date("2025-11-10T12:00:00Z"), amount: money("100000") }),
      ganada({ id: "b", actualCloseDate: new Date("2026-03-15T12:00:00Z"), amount: money("150000") }),
      ganada({ id: "c", actualCloseDate: new Date("2026-09-01T12:00:00Z"), amount: money("75000") }),
    ];
    const { filas } = historicoDeVentas(ventas, "trimestre", FISCAL.fiscalYearStartMonth);
    expect(filas.map((f) => f.variacion?.toString() ?? null)).toEqual([null, "0.5", "-0.5"]);
  });

  const ventas = [
    ganada({ id: "a", actualCloseDate: new Date("2025-11-10T12:00:00Z"), amount: money("50000") }),
    ganada({ id: "b", actualCloseDate: new Date("2026-02-10T12:00:00Z"), amount: money("100000") }),
    ganada({ id: "c", actualCloseDate: new Date("2026-08-15T12:00:00Z"), amount: money("300000") }),
  ];

  it("por año fiscal", () => {
    const r = historicoDeVentas(ventas, "anio", FISCAL.fiscalYearStartMonth);
    expect(r.filas.map((f) => [f.etiqueta, f.importe.toFixed(0)])).toEqual([
      ["2025", "50000"],
      ["2026", "400000"],
    ]);
  });

  it("por trimestre, sin saltarse el año", () => {
    const r = historicoDeVentas(ventas, "trimestre", FISCAL.fiscalYearStartMonth);
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Q4 2025", "Q1 2026", "Q3 2026"]);
  });
});

describe("rentabilidad · importe, costo, utilidad y margen", () => {
  const ventas = [
    ganada({ id: "a", cotizacion: CON_LINEAS }),
    ganada({
      id: "b",
      organization: NORTE,
      businessType: "RENOVACION",
      cotizacion: {
        netSubtotal: money("50000"),
        totalCost: money("45000"),
        grossProfit: money("5000"),
        lineas: [{ productId: "p1", descripcion: "Servicios administrados", importe: money("50000"), costo: money("45000") }],
      },
    }),
    // Sin costo (INV-02) no entra a rentabilidad: no hay con qué calcularla.
    ganada({ id: "c", cotizacion: { netSubtotal: money("10"), lineas: [] } }),
  ];

  it("por producto, con las líneas de cada cotización", () => {
    const r = rentabilidad(ventas, "producto", TIPOS);
    const sa = r.filas.find((f) => f.etiqueta === "Servicios administrados")!;
    expect(sa.importe.toFixed(0)).toBe("120000");
    expect(sa.costo.toFixed(0)).toBe("90000");
    expect(sa.utilidad.toFixed(0)).toBe("30000");
    expect(sa.margen.toFixed(2)).toBe("0.25");
    expect(sa.cuantas).toBe(2);
  });

  it("por cliente y por tipo, con los totales de la cotización", () => {
    const porCliente = rentabilidad(ventas, "cliente", TIPOS);
    expect(porCliente.filas.find((f) => f.etiqueta === "Banco del Norte")!.margen.toFixed(2)).toBe("0.10");
    const porTipo = rentabilidad(ventas, "tipo", TIPOS);
    expect(porTipo.filas.map((f) => f.etiqueta)).toEqual(["Cliente nuevo", "Renovación"]);
    expect(porTipo.total.utilidad.toFixed(0)).toBe("45000");
    expect(porTipo.total.margen.toFixed(2)).toBe("0.30");
  });

  it("un importe en cero no es una división por cero", () => {
    const r = rentabilidad([ganada({ id: "z", cotizacion: { netSubtotal: money("0"), totalCost: money("0"), grossProfit: money("0"), lineas: [] } })], "cliente", TIPOS);
    expect(r.filas[0]!.margen.isZero()).toBe(true);
  });
});

function abierta(p: Partial<OportunidadAbierta> & { id: string }): OportunidadAbierta {
  return {
    folio: `OPP-${p.id}`,
    name: `Oportunidad ${p.id}`,
    amount: money("100000"),
    expectedCloseDate: new Date("2026-11-15T12:00:00Z"),
    createdAt: new Date("2026-08-01T12:00:00Z"),
    stageEnteredAt: new Date("2026-09-20T12:00:00Z"),
    lastActivityAt: new Date("2026-09-20T12:00:00Z"),
    nextActivityAt: new Date("2026-09-30T12:00:00Z"),
    forecastCategory: "PIPELINE",
    meddicScore: 60,
    businessType: "NUEVO",
    organization: ANDINA,
    owner: JORGE,
    stage: { name: "Propuesta", position: 3, probability: money("0.5"), staleAfterDays: 21, isClosing: false },
    meddic: [],
    ...p,
  };
}

describe("embudoDeForecast · abiertas por trimestre de cierre estimado y una segunda agrupación", () => {
  const abiertas = [
    abierta({ id: "a", amount: money("100000"), expectedCloseDate: new Date("2026-10-10T12:00:00Z") }),
    abierta({ id: "b", amount: money("200000"), expectedCloseDate: new Date("2026-12-10T12:00:00Z"), organization: NORTE, owner: PAULINA, forecastCategory: "COMPROMISO", stage: { name: "Negociación", position: 4, probability: money("0.75"), staleAfterDays: 21, isClosing: false } }),
    abierta({ id: "c", amount: money("50000"), expectedCloseDate: new Date("2027-02-01T12:00:00Z"), forecastCategory: "OMITIDA" }),
  ];

  it("agrupa por trimestre y dentro por cliente, con total y ponderado (RN-01)", () => {
    const r = embudoDeForecast(abiertas, { segunda: "cliente", probabilidadMinima: null, categorias: new Set(), ...FISCAL });
    expect(r.trimestres.map((t) => t.etiqueta)).toEqual(["Q4 2026", "Q1 2027"]);
    const q4 = r.trimestres[0]!;
    expect(q4.total.toFixed(0)).toBe("300000");
    expect(q4.ponderado.toFixed(0)).toBe("200000");
    expect(q4.subgrupos.map((s) => s.etiqueta)).toEqual(["Banco del Norte", "Grupo Andina"]);
    expect(r.total.cuantas).toBe(3);
  });

  it("la segunda agrupación puede ser por vendedor", () => {
    const r = embudoDeForecast(abiertas, { segunda: "vendedor", probabilidadMinima: null, categorias: new Set(), ...FISCAL });
    expect(r.trimestres[0]!.subgrupos.map((s) => s.etiqueta)).toEqual(["Paulina Estrada", "Jorge Medina"]);
  });

  it("filtra por probabilidad mínima de etapa y por categoría de pronóstico", () => {
    const porProb = embudoDeForecast(abiertas, { segunda: "cliente", probabilidadMinima: money("0.6"), categorias: new Set(), ...FISCAL });
    expect(porProb.total.cuantas).toBe(1);
    const porCat = embudoDeForecast(abiertas, { segunda: "cliente", probabilidadMinima: null, categorias: new Set(["OMITIDA"]), ...FISCAL });
    expect(porCat.trimestres.map((t) => t.etiqueta)).toEqual(["Q1 2027"]);
  });
});

describe("cicloDeVenta · del alta al cierre real", () => {
  it("promedio y mediana en días, y por vendedor", () => {
    const ventas = [
      ganada({ id: "a", createdAt: new Date("2026-01-01T12:00:00Z"), actualCloseDate: new Date("2026-01-31T12:00:00Z") }), // 30
      ganada({ id: "b", createdAt: new Date("2026-01-01T12:00:00Z"), actualCloseDate: new Date("2026-03-02T12:00:00Z") }), // 60
      ganada({ id: "c", createdAt: new Date("2026-01-01T12:00:00Z"), actualCloseDate: new Date("2026-04-01T12:00:00Z"), owner: PAULINA }), // 90
    ];
    const r = cicloDeVenta(ventas, FISCAL.fiscalYearStartMonth);
    expect(r.promedioDias).toBe(60);
    expect(r.medianaDias).toBe(60);
    expect(r.cuantas).toBe(3);
    expect(r.porVendedor.map((v) => [v.etiqueta, v.promedioDias])).toEqual([["Jorge Medina", 45], ["Paulina Estrada", 90]]);
    expect(r.porTrimestre.map((t) => t.etiqueta)).toEqual(["Q1 2026", "Q2 2026"]);
  });

  it("sin ventas no inventa un cero: promedio nulo", () => {
    const r = cicloDeVenta([], FISCAL.fiscalYearStartMonth);
    expect(r.promedioDias).toBeNull();
    expect(r.medianaDias).toBeNull();
  });
});

describe("antiguedadYEstancamiento · lo que se está quedando, hoy", () => {
  const abiertas = [
    abierta({ id: "sana" }),
    abierta({ id: "estancada", stageEnteredAt: new Date("2026-08-01T12:00:00Z"), amount: money("500000") }),
    abierta({ id: "sinActividad", nextActivityAt: null, lastActivityAt: new Date("2026-08-20T12:00:00Z"), owner: PAULINA }),
    abierta({ id: "vencida", expectedCloseDate: new Date("2026-09-01T12:00:00Z"), createdAt: new Date("2026-01-01T12:00:00Z") }),
  ];

  it("cuenta estancadas, sin actividad y vencidas, y suma lo estancado", () => {
    const r = antiguedadYEstancamiento(abiertas, HOY);
    expect(r.resumen.cuantas).toBe(4);
    expect(r.resumen.estancadas).toBe(1);
    expect(r.resumen.sinActividad).toBe(1);
    expect(r.resumen.vencidas).toBe(1);
    expect(r.resumen.importeEstancado.toFixed(0)).toBe("500000");
  });

  it("por vendedor y con detalle ordenado por importe", () => {
    const r = antiguedadYEstancamiento(abiertas, HOY);
    expect(r.porVendedor.map((v) => [v.etiqueta, v.cuantas, v.sinActividad])).toEqual([["Jorge Medina", 3, 0], ["Paulina Estrada", 1, 1]]);
    expect(r.detalle[0]!.folio).toBe("OPP-estancada");
    expect(r.detalle[0]!.diasEnEtapa).toBe(55);
    expect(r.detalle[0]!.limite).toBe(21);
    expect(r.detalle.find((d) => d.folio === "OPP-vencida")!.edadDias).toBe(267);
  });
});

describe("actividadPorVendedor · quién trabaja el pipeline", () => {
  const actividades = [
    { completedAt: new Date("2026-08-05T12:00:00Z"), tipo: "Llamada", usuario: JORGE },
    { completedAt: new Date("2026-08-06T12:00:00Z"), tipo: "Reunión", usuario: JORGE },
    { completedAt: new Date("2026-09-06T12:00:00Z"), tipo: "Llamada", usuario: PAULINA },
  ];
  const abiertas = [abierta({ id: "a" }), abierta({ id: "b", nextActivityAt: null }), abierta({ id: "c", owner: PAULINA })];

  it("hechas por tipo, abiertas y sin siguiente paso, de más a menos activo", () => {
    const r = actividadPorVendedor(actividades, abiertas, HOY);
    expect(r.tipos).toEqual(["Llamada", "Reunión"]);
    expect(r.porVendedor.map((v) => [v.etiqueta, v.hechas, v.abiertas, v.sinSiguientePaso])).toEqual([
      ["Jorge Medina", 2, 2, 1],
      ["Paulina Estrada", 1, 1, 0],
    ]);
    expect(r.porVendedor[0]!.porTipo).toEqual({ Llamada: 1, Reunión: 1 });
  });

  it("por mes, cronológico", () => {
    const r = actividadPorVendedor(actividades, abiertas, HOY);
    expect(r.porMes.map((m) => [m.clave, m.hechas])).toEqual([["2026-08", 2], ["2026-09", 1]]);
  });
});

describe("saludMeddic · qué tan calificado está lo que se pronostica", () => {
  const cierre = { name: "Cierre", position: 5, probability: money("0.9"), staleAfterDays: 10, isClosing: true };
  const abiertas = [
    abierta({ id: "a", meddicScore: 80, meddic: [{ component: "METRICAS", status: "PARCIAL", conEvidencia: false }] }),
    abierta({ id: "b", meddicScore: 40, meddic: [{ component: "CAMPEON", status: "CONFIRMADO", conEvidencia: true }] }),
    abierta({ id: "c", meddicScore: 55, stage: cierre }),
    abierta({ id: "d", meddicScore: null, stage: cierre }),
  ];

  it("por etapa: promedio, bajo el mínimo y sin calificar; y quién está en Cierre sin llegar", () => {
    const r = saludMeddic(abiertas, 70);
    expect(r.porEtapa.map((e) => [e.etiqueta, e.cuantas, e.promedio, e.bajoMinimo, e.sinCalificar])).toEqual([
      ["Propuesta", 2, 60, 1, 0],
      ["Cierre", 2, 55, 1, 1],
    ]);
    expect(r.sinEvidencia).toBe(1);
    expect(r.enCierreBajoMinimo.map((o) => o.folio)).toEqual(["OPP-c", "OPP-d"]);
  });
});
