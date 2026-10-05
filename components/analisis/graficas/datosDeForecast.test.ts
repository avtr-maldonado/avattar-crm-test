import { describe, expect, it } from "vitest";
import { formatPercent, formatUSD, money } from "@/lib/money";
import type {
  DetalleDeAntiguedad,
  OportunidadAbierta,
  PromedioDeCiclo,
  SubgrupoDeEmbudo,
  TrimestreDeEmbudo,
  VentaGanada,
} from "@/lib/domain/analisis";
import {
  barrasDeCiclo,
  distribucionDelPipeline,
  estadoDeEtapa,
  estadoPorVendedor,
  puntosDeAntiguedad,
  puntosDeEmbudo,
  serieDeCiclo,
} from "./datosDeForecast";

/**
 * De las agregaciones del forecast (Decimal) a los puntos de las gráficas:
 * número para la geometría y texto formateado para el tooltip. La regla de
 * estado de etapa (decisiones §37) vive aquí y la usan la dispersión y la tabla.
 */
function sub(clave: string, etiqueta: string, total: number, ponderado: number, cuantas: number): SubgrupoDeEmbudo {
  return { clave, etiqueta, total: money(total), ponderado: money(ponderado), cuantas, ids: [] };
}

const NUBACOM = (t: number, p: number, c: number) => sub("o1", "Nubacom", t, p, c);
const SANTANDER = (t: number, p: number, c: number) => sub("o2", "Santander", t, p, c);

const EMBUDO: { trimestres: TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo } = {
  trimestres: [
    { ...sub("2026-Q3", "Q3 2026", 68000, 26000, 2), subgrupos: [NUBACOM(68000, 26000, 2)] },
    { ...sub("2026-Q4", "Q4 2026", 170000, 44500, 3), subgrupos: [SANTANDER(170000, 44500, 3)] },
    { ...sub("2027-Q1", "Q1 2027", 4200, 1050, 1), subgrupos: [NUBACOM(4200, 1050, 1)] },
  ],
  total: sub("total", "Total", 242200, 71550, 6),
};

describe("estadoDeEtapa · la regla del 75 % y el 100 %", () => {
  it("clasifica por días en la etapa contra su límite", () => {
    expect(estadoDeEtapa(8, 21)).toBe("en_tiempo");
    expect(estadoDeEtapa(15, 30)).toBe("en_tiempo");
    expect(estadoDeEtapa(16, 20)).toBe("en_riesgo");
    expect(estadoDeEtapa(21, 21)).toBe("en_riesgo");
    expect(estadoDeEtapa(15, 14)).toBe("estancada");
  });

  it("sin límite no hay nada que reclamar", () => {
    expect(estadoDeEtapa(40, 0)).toBe("en_tiempo");
  });
});

describe("puntosDeEmbudo · reporte 4", () => {
  it("una barra por trimestre: la altura es el importe y el ponderado es el segmento de abajo", () => {
    const p = puntosDeEmbudo(EMBUDO, []);
    expect(p.map((x) => x.etiqueta)).toEqual(["Q3 2026", "Q4 2026", "Q1 2027"]);
    expect(p[1]).toMatchObject({ importe: 170000, ponderado: 44500, resto: 125500 });
    expect(p[1]!.detalle.map((d) => d.etiqueta)).toEqual(["Oportunidades", "Importe", "Ponderado", "Peso en el pipeline"]);
    expect(p[1]!.detalle[1]?.texto).toBe(formatUSD(money(170000)));
    expect(p[1]!.detalle[3]?.texto).toBe(formatPercent(money(170000).div(money(242200))));
  });

  it("sin abiertas no hay puntos", () => {
    expect(puntosDeEmbudo({ trimestres: [], total: sub("total", "Total", 0, 0, 0) }, [])).toEqual([]);
  });
});

describe("distribucionDelPipeline · reporte 4b", () => {
  it("suma cada cliente a lo largo de los trimestres y ordena de mayor a menor con su peso", () => {
    const f = distribucionDelPipeline(EMBUDO, []);
    expect(f.map((x) => x.etiqueta)).toEqual(["Santander", "Nubacom"]);
    expect(f[0]).toMatchObject({ valor: 170000 });
    expect(f[1]).toMatchObject({ valor: 72200 });
    expect(f[1]!.etiquetaDeValor).toBe(`$72.2K · ${formatPercent(money(72200).div(money(242200)))}`);
    expect(f[1]!.detalle.map((d) => d.etiqueta)).toEqual(["Importe", "Ponderado", "Oportunidades", "Peso en el pipeline"]);
    expect(f[1]!.detalle[0]?.texto).toBe(formatUSD(money(72200)));
    expect(f[1]!.detalle[2]?.texto).toBe("3");
  });
});

const CICLO = {
  promedioDias: 17,
  medianaDias: 17,
  cuantas: 2,
  porVendedor: [
    { clave: "u2", etiqueta: "Miguel Maldonado", promedioDias: 20, cuantas: 1, cierres: [] },
    { clave: "u1", etiqueta: "Alejandro Lerma", promedioDias: 14, cuantas: 1, cierres: [] },
  ] as PromedioDeCiclo[],
  porTrimestre: [{ clave: "2026-Q3", etiqueta: "Q3 2026", promedioDias: 17, cuantas: 2, cierres: [] }] as PromedioDeCiclo[],
};

describe("barrasDeCiclo y serieDeCiclo · reporte 5", () => {
  it("una barra por vendedor con la mediana como referencia", () => {
    const b = barrasDeCiclo(CICLO, []);
    expect(b.filas.map((f) => [f.etiqueta, f.valor, f.etiquetaDeValor])).toEqual([
      ["Miguel Maldonado", 20, "20 días"],
      ["Alejandro Lerma", 14, "14 días"],
    ]);
    expect(b.referencia).toEqual({ valor: 17, etiqueta: "Mediana: 17 días" });
    expect(b.filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Cierres=1", "Días promedio=20 días", "Mediana=17 días"]);
  });

  it("la evolución por trimestre es una serie cronológica con cierres y promedio", () => {
    const s = serieDeCiclo(CICLO, []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ etiqueta: "Q3 2026", valor: 17 });
    expect(s[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Cierres", "Días promedio"]);
  });

  it("sin cierres no hay barras ni referencia", () => {
    const b = barrasDeCiclo({ ...CICLO, promedioDias: null, medianaDias: null, cuantas: 0, porVendedor: [], porTrimestre: [] }, []);
    expect(b.filas).toEqual([]);
    expect(b.referencia).toBeNull();
  });
});

function abierta(p: Partial<DetalleDeAntiguedad> & { id: string; folio: string }): DetalleDeAntiguedad {
  return {
    nombre: "Pruebas",
    cliente: "Santander",
    vendedor: "Miguel Maldonado",
    etapa: "Propuesta",
    importe: money(50000),
    diasEnEtapa: 8,
    limite: 21,
    edadDias: 11,
    estancada: false,
    sinActividad: false,
    vencida: false,
    ...p,
  };
}

const ANTIGUEDAD = {
  resumen: { cuantas: 6, estancadas: 2, sinActividad: 6, vencidas: 2, importeEstancado: money(100000), edadPromedioDias: 12 },
  porVendedor: [
    { clave: "u2", etiqueta: "Miguel Maldonado", cuantas: 5, estancadas: 1, sinActividad: 5, vencidas: 1, edadPromedioDias: 12, ids: { abiertas: [], estancadas: [], sinActividad: [], vencidas: [] } },
    { clave: "u3", etiqueta: "Alejandro Salazar", cuantas: 1, estancadas: 1, sinActividad: 1, vencidas: 1, edadPromedioDias: 15, ids: { abiertas: [], estancadas: [], sinActividad: [], vencidas: [] } },
  ],
  detalle: [
    abierta({ id: "a", folio: "OPP-2026-00501", nombre: "Desarrollo de App Movil", importe: money(80000), diasEnEtapa: 15, limite: 14, edadDias: 15, estancada: true }),
    abierta({ id: "b", folio: "OPP-2026-00502", nombre: "Pruebas", importe: money(50000), diasEnEtapa: 8, limite: 21, edadDias: 11 }),
    abierta({ id: "c", folio: "OPP-2026-00503", nombre: "Póliza", importe: money(40000), diasEnEtapa: 17, limite: 21, edadDias: 5 }),
  ],
};

describe("estadoPorVendedor y puntosDeAntiguedad · reporte 6", () => {
  it("barras agrupadas por vendedor: las cuatro cuentas, nunca apiladas", () => {
    const e = estadoPorVendedor(ANTIGUEDAD, []);
    expect(e.series.map((s) => s.clave)).toEqual(["abiertas", "estancadas", "sinActividad", "vencidas"]);
    expect(e.filas[0]).toMatchObject({ etiqueta: "Miguel Maldonado", valores: { abiertas: 5, estancadas: 1, sinActividad: 5, vencidas: 1 } });
    expect(e.filas[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Abiertas", "Estancadas", "Sin actividad", "Vencidas", "Edad promedio"]);
    expect(e.filas[0]!.detalle[4]?.texto).toBe("12 días");
  });

  it("cada abierta es un punto edad × importe con su estado de etapa y el tooltip completo", () => {
    const { puntos, edadPromedio } = puntosDeAntiguedad(ANTIGUEDAD);
    expect(edadPromedio).toBe(12);
    expect(puntos.map((p) => [p.edad, p.importe, p.estado])).toEqual([
      [15, 80000, "estancada"],
      [11, 50000, "en_tiempo"],
      [5, 40000, "en_riesgo"],
    ]);
    expect(puntos[0]!.etiqueta).toBe("OPP-2026-00501 · Desarrollo de App Movil");
    expect(puntos[0]!.detalle.map((d) => d.etiqueta)).toEqual([
      "Folio", "Oportunidad", "Cliente", "Etapa", "Edad", "Días en etapa", "Límite de etapa", "Importe", "Vendedor", "Estado",
    ]);
    expect(puntos[0]!.detalle.at(-1)).toMatchObject({ texto: "Fuera del límite de etapa", tono: "peligro" });
    expect(puntos[2]!.detalle.at(-1)).toMatchObject({ texto: "En riesgo" });
    expect(puntos[0]!.detalle[7]?.texto).toBe(formatUSD(money(80000)));
  });
});

// ═══════════════════════════ Los ítems detrás de cada punto (decisiones §43)

function abiertaReal(id: string, p: Partial<OportunidadAbierta> = {}): OportunidadAbierta {
  return {
    id,
    folio: `OPP-2026-${id}`,
    name: `Proyecto ${id}`,
    amount: money("100000"),
    expectedCloseDate: new Date("2026-11-15T12:00:00Z"),
    createdAt: new Date("2026-08-01T12:00:00Z"),
    stageEnteredAt: new Date("2026-09-20T12:00:00Z"),
    lastActivityAt: new Date("2026-09-20T12:00:00Z"),
    nextActivityAt: null,
    forecastCategory: "PIPELINE",
    meddicScore: 60,
    businessType: "NUEVO",
    organization: { id: "o1", name: "Nubacom" },
    owner: { id: "u2", name: "Miguel Maldonado" },
    stage: { name: "Negociación", position: 4, probability: money("0.75"), staleAfterDays: 21, isClosing: false },
    ...p,
  };
}

function ventaReal(id: string, p: Partial<VentaGanada> = {}): VentaGanada {
  return {
    id,
    folio: `OPP-2026-${id}`,
    name: `Proyecto ${id}`,
    amount: money("80000"),
    actualCloseDate: new Date("2026-08-15T12:00:00Z"),
    createdAt: new Date("2026-07-26T12:00:00Z"),
    businessType: "NUEVO",
    organization: { id: "o1", name: "Nubacom" },
    owner: { id: "u2", name: "Miguel Maldonado" },
    cotizacion: null,
    ...p,
  };
}

describe("los ítems de la pestaña Forecast (§43)", () => {
  const abiertas = [abiertaReal("x"), abiertaReal("y", { amount: money("50000") })];
  const conIds = {
    trimestres: [{ ...sub("2026-Q4", "Q4 2026", 150000, 112500, 2), ids: ["x", "y"], subgrupos: [{ ...NUBACOM(150000, 112500, 2), ids: ["x", "y"] }] }],
    total: { ...sub("total", "Total", 150000, 112500, 2), ids: ["x", "y"] },
  };

  it("puntosDeEmbudo · cada trimestre lista sus abiertas con importe, etapa y ponderado", () => {
    const p = puntosDeEmbudo(conIds, abiertas);
    expect(p[0]!.items[0]).toEqual({
      clave: "x",
      href: "/oportunidades/x",
      titulo: "OPP-2026-x · Proyecto x",
      subtitulo: "Nubacom · Miguel Maldonado",
      cifra: formatUSD(money("100000")),
      nota: `Negociación · 75 % · ponderado ${formatUSD(money("75000"))}`,
    });
  });

  it("distribucionDelPipeline · un cliente junta las abiertas de todos sus trimestres", () => {
    const dos = {
      trimestres: [
        { ...sub("2026-Q4", "Q4 2026", 100000, 75000, 1), ids: ["x"], subgrupos: [{ ...NUBACOM(100000, 75000, 1), ids: ["x"] }] },
        { ...sub("2027-Q1", "Q1 2027", 50000, 37500, 1), ids: ["y"], subgrupos: [{ ...NUBACOM(50000, 37500, 1), ids: ["y"] }] },
      ],
      total: { ...sub("total", "Total", 150000, 112500, 2), ids: ["x", "y"] },
    };
    const f = distribucionDelPipeline(dos, abiertas);
    expect(f[0]!.items.map((i) => i.clave)).toEqual(["x", "y"]);
  });

  it("barrasDeCiclo y serieDeCiclo · cada cierre con sus días, su importe y su fecha", () => {
    const ventas = [ventaReal("a"), ventaReal("b", { createdAt: new Date("2026-07-01T12:00:00Z") })];
    const ciclo = {
      ...CICLO,
      porVendedor: [{ clave: "u2", etiqueta: "Miguel Maldonado", promedioDias: 32, cuantas: 2, cierres: [{ id: "a", dias: 20 }, { id: "b", dias: 45 }] }],
      porTrimestre: [{ clave: "2026-Q3", etiqueta: "Q3 2026", promedioDias: 32, cuantas: 2, cierres: [{ id: "a", dias: 20 }, { id: "b", dias: 45 }] }],
    };
    const b = barrasDeCiclo(ciclo, ventas);
    expect(b.filas[0]!.items.map((i) => [i.clave, i.cifra, i.nota])).toEqual([
      ["a", "20 días", `${formatUSD(money("80000"))} · cerrada 15 ago 2026`],
      ["b", "45 días", `${formatUSD(money("80000"))} · cerrada 15 ago 2026`],
    ]);
    expect(serieDeCiclo(ciclo, ventas)[0]!.items.map((i) => i.clave)).toEqual(["a", "b"]);
  });

  it("estadoPorVendedor · los ítems van por serie, y cada serie dice lo que le importa", () => {
    const estancada = abiertaReal("e", { stageEnteredAt: new Date("2026-08-01T12:00:00Z") });
    const vencida = abiertaReal("v", { expectedCloseDate: new Date("2026-09-01T12:00:00Z") });
    const sinActividad = abiertaReal("s", { lastActivityAt: null });
    const a = {
      ...ANTIGUEDAD,
      porVendedor: [
        {
          ...ANTIGUEDAD.porVendedor[0]!,
          ids: { abiertas: ["e", "v", "s"], estancadas: ["e"], sinActividad: ["s"], vencidas: ["v"] },
        },
      ],
    };
    const e = estadoPorVendedor(a, [estancada, vencida, sinActividad]);
    const series = e.filas[0]!.itemsPorSerie;
    expect(series.abiertas!.map((i) => i.clave)).toEqual(["e", "v", "s"]);
    expect(series.estancadas![0]).toMatchObject({ clave: "e", nota: "Negociación · en etapa desde 1 ago 2026" });
    expect(series.vencidas![0]).toMatchObject({ clave: "v", nota: "Cierre estimado 1 sep 2026", tono: "peligro" });
    expect(series.sinActividad![0]).toMatchObject({ clave: "s", nota: "Sin actividad registrada" });
    expect(e.filas[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Abiertas", "Estancadas", "Sin actividad", "Vencidas", "Edad promedio"]);
  });

  it("puntosDeAntiguedad · el punto es una oportunidad: un ítem con su enlace", () => {
    const { puntos } = puntosDeAntiguedad(ANTIGUEDAD);
    expect(puntos[0]!.items).toEqual([
      {
        clave: "a",
        href: "/oportunidades/a",
        titulo: "OPP-2026-00501 · Desarrollo de App Movil",
        subtitulo: "Santander · Miguel Maldonado",
        cifra: formatUSD(money(80000)),
        nota: "Propuesta · 15 / 14 días en etapa",
        tono: "peligro",
      },
    ]);
    expect(puntos[1]!.items[0]!.tono).toBeUndefined();
  });
});
