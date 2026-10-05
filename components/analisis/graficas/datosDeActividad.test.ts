import { describe, expect, it } from "vitest";
import { formatUSD, money } from "@/lib/money";
import type { ActividadDeVendedor, ActividadHecha, OportunidadAbierta, SaludPorEtapa } from "@/lib/domain/analisis";
import { rangoDeAnioFiscal, rangoDeTrimestre } from "@/lib/filters/dates";
import { abiertasYSinPaso, actividadPorMes, actividadPorTipo, saludPorEtapaGrafica } from "./datosDeActividad";

/**
 * De `actividadPorVendedor` y `saludMeddic` a los puntos de la pestaña
 * Actividad y MEDDIC (decisiones §38). Lo que importa aquí: los tipos de
 * actividad son datos, los doce meses del año fiscal aparecen aunque estén
 * vacíos, no se divide entre cero y «sin datos» nunca se dibuja como cero.
 */
const VENDEDORES: ActividadDeVendedor[] = [
  { clave: "u2", etiqueta: "Miguel Maldonado", hechas: 4, porTipo: { "Correo enviado": 1, Demostración: 1, Llamada: 2 }, abiertas: 5, sinSiguientePaso: 5, ids: { porTipo: {}, abiertas: [], sinSiguientePaso: [] } },
  { clave: "u3", etiqueta: "Alejandro Salazar", hechas: 3, porTipo: { "Correo enviado": 2, Llamada: 1 }, abiertas: 1, sinSiguientePaso: 1, ids: { porTipo: {}, abiertas: [], sinSiguientePaso: [] } },
  { clave: "u1", etiqueta: "Alejandro Lerma", hechas: 1, porTipo: { "Correo enviado": 1 }, abiertas: 0, sinSiguientePaso: 0, ids: { porTipo: {}, abiertas: [], sinSiguientePaso: [] } },
];
const TIPOS = ["Correo enviado", "Demostración", "Llamada"];

describe("actividadPorTipo · reporte 8", () => {
  it("una serie por tipo de actividad y una fila por vendedor, con cero donde no hizo de ese tipo", () => {
    const { series, filas } = actividadPorTipo({ tipos: TIPOS, porVendedor: VENDEDORES }, []);
    expect(series.map((s) => s.clave)).toEqual(TIPOS);
    expect(filas.map((f) => f.etiqueta)).toEqual(["Miguel Maldonado", "Alejandro Salazar", "Alejandro Lerma"]);
    expect(filas[1]!.valores).toEqual({ "Correo enviado": 2, Demostración: 0, Llamada: 1 });
    // El tooltip lleva cada tipo y el total; «Hechas» no es una serie.
    expect(filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Correo enviado=1", "Demostración=1", "Llamada=2", "Hechas=4"]);
  });

  it("sin actividades no hay series ni filas", () => {
    expect(actividadPorTipo({ tipos: [], porVendedor: [] }, [])).toEqual({ series: [], filas: [] });
  });
});

describe("actividadPorMes · reporte 8b", () => {
  it("los doce meses del año fiscal, en orden, con cero atenuado donde no hubo nada", () => {
    const p = actividadPorMes([{ clave: "2026-09", etiqueta: "sep 2026", hechas: 8, ids: [] }], rangoDeAnioFiscal(2026, 1), []);
    expect(p).toHaveLength(12);
    expect(p[0]!.etiqueta).toBe("ene 2026");
    expect(p[11]!.etiqueta).toBe("dic 2026");
    expect(p[8]).toMatchObject({ clave: "2026-09", etiqueta: "sep 2026", valor: 8 });
    expect(p[8]!.tenue).toBeUndefined();
    expect(p[0]).toMatchObject({ valor: 0, tenue: true });
    expect(p[8]!.detalle).toEqual([{ etiqueta: "Actividades hechas", texto: "8" }]);
  });

  it("un año fiscal que empieza en abril corre de abril a marzo del siguiente", () => {
    const p = actividadPorMes([], rangoDeAnioFiscal(2026, 4), []);
    expect(p[0]!.etiqueta).toBe("abr 2026");
    expect(p[11]!.etiqueta).toBe("mar 2027");
    expect(p[11]!.clave).toBe("2027-03");
  });
});

describe("abiertasYSinPaso · reporte 8c", () => {
  it("dos series por vendedor y el porcentaje sin dividir entre cero", () => {
    const { series, filas } = abiertasYSinPaso(VENDEDORES, []);
    expect(series.map((s) => s.clave)).toEqual(["abiertas", "sinSiguientePaso"]);
    expect(filas[0]!.valores).toEqual({ abiertas: 5, sinSiguientePaso: 5 });
    expect(filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Abiertas=5", "Sin siguiente paso=5", "Sin siguiente paso sobre abiertas=100.0 %"]);
    expect(filas[0]!.detalle[1]).toMatchObject({ tono: "peligro" });
    expect(filas[2]!.detalle[2]).toMatchObject({ texto: "—", tono: "tenue" });
  });
});

const ETAPAS: SaludPorEtapa[] = [
  { clave: "Calificación", etiqueta: "Calificación", cuantas: 2, promedio: null, bajoMinimo: 0, sinCalificar: 2, ids: [] },
  { clave: "Descubrimiento", etiqueta: "Descubrimiento", cuantas: 2, promedio: 26, bajoMinimo: 2, sinCalificar: 0, ids: [] },
  { clave: "Propuesta", etiqueta: "Propuesta", cuantas: 1, promedio: 83, bajoMinimo: 0, sinCalificar: 0, ids: [] },
];

describe("saludPorEtapaGrafica · reporte 9", () => {
  it("promedio por etapa con el mínimo como referencia; sin datos no es cero", () => {
    const { filas, referencia } = saludPorEtapaGrafica(ETAPAS, 70, []);
    expect(referencia).toEqual({ valor: 70, etiqueta: "Mínimo: 70" });
    expect(filas.map((f) => [f.etiqueta, f.valor, f.etiquetaDeValor, f.tono])).toEqual([
      ["Calificación", 0, "Sin datos", "tenue"],
      ["Descubrimiento", 26, "26", "peligro"],
      ["Propuesta", 83, "83", "exito"],
    ]);
    expect(filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Abiertas=2", "MEDDIC promedio=Sin datos", "Bajo el mínimo=0", "Sin calificar=2"]);
    expect(filas[1]!.detalle[1]).toMatchObject({ texto: "26", tono: "peligro" });
    expect(filas[2]!.detalle[1]).toMatchObject({ texto: "83", tono: "exito" });
  });
});

// ═══════════════════════════ Los ítems detrás de cada barra (decisiones §43)

function hecha(id: string, p: Partial<ActividadHecha> = {}): ActividadHecha {
  return {
    id,
    subject: `Actividad ${id}`,
    completedAt: new Date("2026-09-06T12:00:00Z"),
    tipo: "Llamada",
    usuario: { id: "u2", name: "Miguel Maldonado" },
    opportunity: { id: "opp1", folio: "OPP-2026-00501", name: "Desarrollo de App Movil" },
    ...p,
  };
}

function abierta(id: string, p: Partial<OportunidadAbierta> = {}): OportunidadAbierta {
  return {
    id,
    folio: `OPP-2026-${id}`,
    name: `Proyecto ${id}`,
    amount: money("100000"),
    expectedCloseDate: new Date("2026-11-15T12:00:00Z"),
    createdAt: new Date("2026-08-01T12:00:00Z"),
    stageEnteredAt: new Date("2026-09-20T12:00:00Z"),
    lastActivityAt: null,
    nextActivityAt: null,
    forecastCategory: "PIPELINE",
    meddicScore: 60,
    businessType: "NUEVO",
    organization: { id: "o1", name: "Nubacom" },
    owner: { id: "u2", name: "Miguel Maldonado" },
    stage: { name: "Propuesta", position: 3, probability: money("0.5"), staleAfterDays: 21, isClosing: false },
    ...p,
  };
}

describe("los ítems de Actividad y MEDDIC (§43)", () => {
  const actividades = [hecha("a1"), hecha("a2", { tipo: "Demostración", opportunity: null, completedAt: new Date("2026-09-07T12:00:00Z") })];
  const vendedor: ActividadDeVendedor = {
    ...VENDEDORES[0]!,
    ids: { porTipo: { Llamada: ["a1"], Demostración: ["a2"] }, abiertas: ["x", "y"], sinSiguientePaso: ["y"] },
  };

  it("actividadPorTipo · la barra de un tipo lista esas actividades, con la oportunidad y la fecha", () => {
    const { filas } = actividadPorTipo({ tipos: TIPOS, porVendedor: [vendedor] }, actividades);
    const porSerie = filas[0]!.itemsPorSerie;
    expect(porSerie.Llamada).toEqual([
      {
        clave: "a1",
        href: "/oportunidades/opp1",
        titulo: "Actividad a1",
        subtitulo: "OPP-2026-00501 · Desarrollo de App Movil",
        cifra: "6 sep 2026",
        nota: "Llamada · Miguel Maldonado",
      },
    ]);
    // Una actividad suelta no tiene ficha a la que enlazar.
    expect(porSerie.Demostración![0]).toMatchObject({ clave: "a2", subtitulo: "Sin oportunidad" });
    expect(porSerie.Demostración![0]!.href).toBeUndefined();
    expect(porSerie["Correo enviado"]).toEqual([]);
  });

  it("actividadPorMes · el mes lista sus actividades; un mes vacío, nada", () => {
    const p = actividadPorMes([{ clave: "2026-09", etiqueta: "sep 2026", hechas: 2, ids: ["a1", "a2"] }], rangoDeAnioFiscal(2026, 1), actividades);
    expect(p[8]!.items.map((i) => i.clave)).toEqual(["a1", "a2"]);
    expect(p[0]!.items).toEqual([]);
  });

  it("abiertasYSinPaso · abiertas y sin siguiente paso por separado; la nota dice qué falta", () => {
    const x = abierta("x", { nextActivityAt: new Date("2026-12-01T12:00:00Z") });
    const y = abierta("y", { nextActivityAt: new Date("2026-09-01T12:00:00Z") });
    const { filas } = abiertasYSinPaso([vendedor], [x, y]);
    expect(filas[0]!.itemsPorSerie.abiertas!.map((i) => i.clave)).toEqual(["x", "y"]);
    expect(filas[0]!.itemsPorSerie.sinSiguientePaso![0]).toMatchObject({ clave: "y", nota: "Propuesta · agendada 1 sep 2026, ya vencida", tono: "peligro" });
    const sinNada = abiertasYSinPaso([{ ...vendedor, ids: { ...vendedor.ids, sinSiguientePaso: ["z"] } }], [abierta("z")]);
    expect(sinNada.filas[0]!.itemsPorSerie.sinSiguientePaso![0]).toMatchObject({ nota: "Propuesta · sin actividad agendada" });
  });

  it("saludPorEtapaGrafica · cada abierta con su MEDDIC: coral bajo el mínimo, gris sin calificar", () => {
    const etapas: SaludPorEtapa[] = [{ clave: "Propuesta", etiqueta: "Propuesta", cuantas: 3, promedio: 60, bajoMinimo: 1, sinCalificar: 1, ids: ["a", "b", "c"] }];
    const { filas } = saludPorEtapaGrafica(etapas, 70, [abierta("a", { meddicScore: 85 }), abierta("b", { meddicScore: 35 }), abierta("c", { meddicScore: null })]);
    expect(filas[0]!.items.map((i) => [i.clave, i.cifra, i.tono ?? null, i.nota])).toEqual([
      ["a", "85", "exito", formatUSD(money("100000"))],
      ["b", "35", "peligro", formatUSD(money("100000"))],
      ["c", "Sin calificar", "tenue", formatUSD(money("100000"))],
    ]);
  });
});


describe("actividadPorMes · los meses del lapso, no siempre doce (§45)", () => {
  it("un trimestre fiscal son tres meses; un rango, los meses que toca", () => {
    const q3 = actividadPorMes([{ clave: "2026-08", etiqueta: "ago 2026", hechas: 3, ids: [] }], rangoDeTrimestre(2026, 3, 1), []);
    expect(q3.map((p) => p.etiqueta)).toEqual(["jul 2026", "ago 2026", "sep 2026"]);
    expect(q3[1]).toMatchObject({ valor: 3 });
    const rango = actividadPorMes([], { from: new Date("2026-11-20T00:00:00Z"), to: new Date("2027-01-05T00:00:00Z") }, []);
    expect(rango.map((p) => p.clave)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
