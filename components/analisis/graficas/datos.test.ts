import { describe, expect, it } from "vitest";
import { formatPercent, formatUSD, money } from "@/lib/money";
import type { FilaAgrupada, FilaDeRentabilidad, FilaHistorica } from "@/lib/domain/analisis";
import { filasDeMargen, filasDeRentabilidad, puntosDeAvance, puntosHistoricos } from "./datos";

/**
 * De las filas agregadas (Decimal) a los puntos de las gráficas: número para
 * la geometría, texto ya formateado para el tooltip. Aquí se decide el orden,
 * qué se atenúa y qué dice cada tooltip; la gráfica no calcula nada.
 */
function fila(p: Partial<FilaAgrupada> & { clave: string; etiqueta: string }): FilaAgrupada {
  return { importe: money(0), utilidad: null, cuantas: 0, participacion: money(0), ...p };
}

const EN_CURSO = { fiscalYear: 2026, quarter: 3 };

describe("puntosDeAvance · reporte 1", () => {
  it("por trimestre pinta los cuatro en orden cronológico, aunque tres estén en cero", () => {
    const q3 = fila({ clave: "2026-Q3", etiqueta: "Q3 2026", importe: money("328835"), cuantas: 2, participacion: money(1) });
    const s = puntosDeAvance({ filas: [q3], total: { importe: money("328835"), utilidad: null, cuantas: 2 } }, "trimestre", {
      anio: 2026,
      cuotasPorTrimestre: null,
      trimestreEnCurso: EN_CURSO,
      utilidadVisible: false,
    });
    expect(s.puntos.map((p) => p.etiqueta)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    expect(s.puntos.map((p) => p.valor)).toEqual([0, 0, 328835, 0]);
    // Sin cuota no se inventa una: ni serie ni renglón en el tooltip.
    expect(s.conCuota).toBe(false);
    expect(s.puntos[2]!.cuota).toBeUndefined();
    expect(s.puntos[2]!.detalle.map((d) => d.etiqueta)).not.toContain("Cuota");
    // El que no ha empezado se atenúa y lo dice; el que corre lo dice.
    expect(s.puntos[3]!.tenue).toBe(true);
    expect(s.puntos[3]!.detalle.at(-1)?.texto).toBe("No ha empezado");
    expect(s.puntos[2]!.detalle.at(-1)?.texto).toBe("En curso");
    expect(s.puntos[2]!.detalle.find((d) => d.etiqueta === "Ganado")?.texto).toBe(formatUSD(money("328835")));
  });

  it("con cuota consolidada, cada trimestre lleva su cuota y su cumplimiento", () => {
    const q1 = fila({ clave: "2026-Q1", etiqueta: "Q1 2026", importe: money("120000"), cuantas: 1, participacion: money("0.5") });
    const q3 = fila({ clave: "2026-Q3", etiqueta: "Q3 2026", importe: money("120000"), cuantas: 1, participacion: money("0.5") });
    const s = puntosDeAvance({ filas: [q1, q3], total: { importe: money("240000"), utilidad: null, cuantas: 2 } }, "trimestre", {
      anio: 2026,
      cuotasPorTrimestre: [money("100000"), money("100000"), money("150000"), money("150000")],
      trimestreEnCurso: EN_CURSO,
      utilidadVisible: false,
    });
    expect(s.conCuota).toBe(true);
    expect(s.puntos.map((p) => p.cuota)).toEqual([100000, 100000, 150000, 150000]);
    const q1Detalle = s.puntos[0]!.detalle;
    expect(q1Detalle.find((d) => d.etiqueta === "Cuota")?.texto).toBe(formatUSD(money("100000")));
    expect(q1Detalle.find((d) => d.etiqueta === "Cumplimiento")).toMatchObject({ texto: formatPercent(money("1.2"), 0), tono: "exito" });
    // Un trimestre cerrado por debajo de la cuota se reclama; el que corre, todavía no.
    const q2 = s.puntos[1]!.detalle.find((d) => d.etiqueta === "Cumplimiento");
    expect(q2).toMatchObject({ tono: "peligro" });
    const q3c = s.puntos[2]!.detalle.find((d) => d.etiqueta === "Cumplimiento");
    expect(q3c?.tono).toBeUndefined();
  });

  it("una cuota toda en cero equivale a no tener cuota", () => {
    const s = puntosDeAvance({ filas: [], total: { importe: money(0), utilidad: null, cuantas: 1 } }, "trimestre", {
      anio: 2026,
      cuotasPorTrimestre: [money(0), money(0), money(0), money(0)],
      trimestreEnCurso: EN_CURSO,
      utilidadVisible: false,
    });
    expect(s.conCuota).toBe(false);
  });

  it("por cliente ordena de mayor a menor ganado, sin fila de total, con utilidad solo si se ve", () => {
    const filas = [
      fila({ clave: "o2", etiqueta: "Banco del Norte", importe: money("95000"), utilidad: money("28500"), cuantas: 1, participacion: money("0.2241") }),
      fila({ clave: "o1", etiqueta: "Grupo Andina", importe: money("328835"), utilidad: money("166915"), cuantas: 2, participacion: money("0.7759") }),
    ];
    const total = { importe: money("423835"), utilidad: money("195415"), cuantas: 3 };
    const conUtilidad = puntosDeAvance({ filas, total }, "cliente", { anio: 2026, cuotasPorTrimestre: null, trimestreEnCurso: EN_CURSO, utilidadVisible: true });
    expect(conUtilidad.puntos.map((p) => p.etiqueta)).toEqual(["Grupo Andina", "Banco del Norte"]);
    expect(conUtilidad.puntos[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Ganado", "Negocios", "Participación", "Utilidad"]);
    expect(conUtilidad.puntos[0]!.detalle[1]).toMatchObject({ texto: "2" });

    const sinUtilidad = puntosDeAvance({ filas, total }, "cliente", { anio: 2026, cuotasPorTrimestre: null, trimestreEnCurso: EN_CURSO, utilidadVisible: false });
    expect(sinUtilidad.puntos[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Ganado", "Negocios", "Participación"]);
  });

  it("por producto atenúa «Sin cotización» y trae la nota del reparto por líneas", () => {
    const filas = [
      fila({ clave: "p1", etiqueta: "Capacitación DevSecOps", importe: money("278400"), cuantas: 2, participacion: money("0.9") }),
      fila({ clave: "__sin_cotizacion", etiqueta: "Sin cotización", importe: money("30000"), cuantas: 1, participacion: money("0.1") }),
    ];
    const s = puntosDeAvance({ filas, total: { importe: money("308400"), utilidad: null, cuantas: 3 } }, "producto", {
      anio: 2026,
      cuotasPorTrimestre: null,
      trimestreEnCurso: EN_CURSO,
      utilidadVisible: false,
    });
    expect(s.puntos[1]).toMatchObject({ clave: "__sin_cotizacion", tenue: true });
    expect(s.nota).toMatch(/líneas de su cotización/);
  });

  it("sin ventas no hay puntos, ni por trimestre: la gráfica dice qué falta", () => {
    const s = puntosDeAvance({ filas: [], total: { importe: money(0), utilidad: null, cuantas: 0 } }, "trimestre", {
      anio: 2026,
      cuotasPorTrimestre: [money("100000"), money(0), money(0), money(0)],
      trimestreEnCurso: EN_CURSO,
      utilidadVisible: false,
    });
    expect(s.puntos).toEqual([]);
  });
});

describe("puntosHistoricos · reporte 2", () => {
  const filas: FilaHistorica[] = [
    { clave: "2025", etiqueta: "2025", importe: money("450000"), utilidad: money("200000"), cuantas: 3, participacion: money("0.5779"), variacion: null },
    { clave: "2026", etiqueta: "2026", importe: money("328835"), utilidad: money("166915"), cuantas: 2, participacion: money("0.4221"), variacion: money("-0.2693") },
  ];

  it("ganado y utilidad como series, y el tooltip completo con la variación en por ciento", () => {
    const p = puntosHistoricos({ filas }, true);
    expect(p.map((x) => x.ganado)).toEqual([450000, 328835]);
    expect(p.map((x) => x.utilidad)).toEqual([200000, 166915]);
    expect(p[1]!.detalle.map((d) => d.etiqueta)).toEqual(["Ganado", "Utilidad", "Variación", "Participación", "Negocios"]);
    expect(p[1]!.detalle[2]).toMatchObject({ texto: `−${formatPercent(money("0.2693"), 0)}`, tono: "peligro" });
    expect(p[0]!.detalle[2]).toMatchObject({ texto: "—", tono: "tenue" });
  });

  it("sin VER_COSTO la utilidad no existe: ni serie ni renglón", () => {
    const p = puntosHistoricos({ filas }, false);
    expect(p.every((x) => x.utilidad === null)).toBe(true);
    expect(p[1]!.detalle.map((d) => d.etiqueta)).toEqual(["Ganado", "Variación", "Participación", "Negocios"]);
  });
});

const RENTABILIDAD: FilaDeRentabilidad[] = [
  { clave: "p3", etiqueta: "Licencia Microsoft 365 E3", importe: money("16800"), costo: money("15800"), utilidad: money("1000"), margen: money("0.0595"), cuantas: 1 },
  { clave: "p1", etiqueta: "Capacitación DevSecOps", importe: money("278400"), costo: money("123000"), utilidad: money("155400"), margen: money("0.5582"), cuantas: 2 },
  { clave: "p4", etiqueta: "Hora de Desarrollo a Medida", importe: money("15635"), costo: money("13620"), utilidad: money("2015"), margen: money("0.1289"), cuantas: 2 },
  { clave: "p2", etiqueta: "Consultoría de arquitectura cloud", importe: money("18000"), costo: money("9500"), utilidad: money("8500"), margen: money("0.4722"), cuantas: 1 },
];

describe("filasDeRentabilidad · reporte 3", () => {
  it("ordena por venta de mayor a menor y la barra es costo + utilidad", () => {
    const f = filasDeRentabilidad({ filas: RENTABILIDAD });
    expect(f.map((x) => x.etiqueta)).toEqual([
      "Capacitación DevSecOps",
      "Consultoría de arquitectura cloud",
      "Licencia Microsoft 365 E3",
      "Hora de Desarrollo a Medida",
    ]);
    expect(f[0]).toMatchObject({ costo: 123000, utilidad: 155400, venta: 278400 });
    expect(f[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Venta", "Costo", "Utilidad", "Margen", "Negocios"]);
    expect(f[0]!.detalle[3]?.texto).toBe(formatPercent(money("0.5582")));
  });

  it("una pérdida no dibuja utilidad negativa: la barra es el costo y el tooltip la dice en coral", () => {
    const perdida: FilaDeRentabilidad = { clave: "x", etiqueta: "Mal vendido", importe: money("10000"), costo: money("12000"), utilidad: money("-2000"), margen: money("-0.2"), cuantas: 1 };
    const f = filasDeRentabilidad({ filas: [perdida] });
    expect(f[0]).toMatchObject({ costo: 12000, utilidad: 0, venta: 10000 });
    expect(f[0]!.detalle[2]).toMatchObject({ tono: "peligro" });
  });
});

describe("filasDeMargen · reporte 3b", () => {
  it("ordena por margen de mayor a menor con el por ciento como texto", () => {
    const f = filasDeMargen({ filas: RENTABILIDAD });
    expect(f.map((x) => x.etiqueta)).toEqual([
      "Capacitación DevSecOps",
      "Consultoría de arquitectura cloud",
      "Hora de Desarrollo a Medida",
      "Licencia Microsoft 365 E3",
    ]);
    expect(f[0]).toMatchObject({ margen: 0.5582, margenTexto: formatPercent(money("0.5582")), negativo: false });
    expect(f[0]!.detalle.map((d) => d.etiqueta)).toEqual(["Margen", "Venta", "Utilidad", "Negocios"]);
  });

  it("un margen negativo no se dibuja bajo cero, pero se lee en coral", () => {
    const f = filasDeMargen({ filas: [{ clave: "x", etiqueta: "Mal vendido", importe: money("10000"), costo: money("12000"), utilidad: money("-2000"), margen: money("-0.2"), cuantas: 1 }] });
    expect(f[0]).toMatchObject({ margen: 0, negativo: true });
    expect(f[0]!.margenTexto).toBe(formatPercent(money("-0.2")));
  });
});
