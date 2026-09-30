import { describe, expect, it } from "vitest";
import type { ActividadDeVendedor, SaludPorEtapa } from "@/lib/domain/analisis";
import { abiertasYSinPaso, actividadPorMesFiscal, actividadPorTipo, saludPorEtapaGrafica } from "./datosDeActividad";

/**
 * De `actividadPorVendedor` y `saludMeddic` a los puntos de la pestaña
 * Actividad y MEDDIC (decisiones §38). Lo que importa aquí: los tipos de
 * actividad son datos, los doce meses del año fiscal aparecen aunque estén
 * vacíos, no se divide entre cero y «sin datos» nunca se dibuja como cero.
 */
const VENDEDORES: ActividadDeVendedor[] = [
  { clave: "u2", etiqueta: "Miguel Maldonado", hechas: 4, porTipo: { "Correo enviado": 1, Demostración: 1, Llamada: 2 }, abiertas: 5, sinSiguientePaso: 5 },
  { clave: "u3", etiqueta: "Alejandro Salazar", hechas: 3, porTipo: { "Correo enviado": 2, Llamada: 1 }, abiertas: 1, sinSiguientePaso: 1 },
  { clave: "u1", etiqueta: "Alejandro Lerma", hechas: 1, porTipo: { "Correo enviado": 1 }, abiertas: 0, sinSiguientePaso: 0 },
];
const TIPOS = ["Correo enviado", "Demostración", "Llamada"];

describe("actividadPorTipo · reporte 8", () => {
  it("una serie por tipo de actividad y una fila por vendedor, con cero donde no hizo de ese tipo", () => {
    const { series, filas } = actividadPorTipo({ tipos: TIPOS, porVendedor: VENDEDORES });
    expect(series.map((s) => s.clave)).toEqual(TIPOS);
    expect(filas.map((f) => f.etiqueta)).toEqual(["Miguel Maldonado", "Alejandro Salazar", "Alejandro Lerma"]);
    expect(filas[1]!.valores).toEqual({ "Correo enviado": 2, Demostración: 0, Llamada: 1 });
    // El tooltip lleva cada tipo y el total; «Hechas» no es una serie.
    expect(filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Correo enviado=1", "Demostración=1", "Llamada=2", "Hechas=4"]);
  });

  it("sin actividades no hay series ni filas", () => {
    expect(actividadPorTipo({ tipos: [], porVendedor: [] })).toEqual({ series: [], filas: [] });
  });
});

describe("actividadPorMesFiscal · reporte 8b", () => {
  it("los doce meses del año fiscal, en orden, con cero atenuado donde no hubo nada", () => {
    const p = actividadPorMesFiscal([{ clave: "2026-09", etiqueta: "sep 2026", hechas: 8 }], 2026, 1);
    expect(p).toHaveLength(12);
    expect(p[0]!.etiqueta).toBe("ene 2026");
    expect(p[11]!.etiqueta).toBe("dic 2026");
    expect(p[8]).toMatchObject({ clave: "2026-09", etiqueta: "sep 2026", valor: 8 });
    expect(p[8]!.tenue).toBeUndefined();
    expect(p[0]).toMatchObject({ valor: 0, tenue: true });
    expect(p[8]!.detalle).toEqual([{ etiqueta: "Actividades hechas", texto: "8" }]);
  });

  it("un año fiscal que empieza en abril corre de abril a marzo del siguiente", () => {
    const p = actividadPorMesFiscal([], 2026, 4);
    expect(p[0]!.etiqueta).toBe("abr 2026");
    expect(p[11]!.etiqueta).toBe("mar 2027");
    expect(p[11]!.clave).toBe("2027-03");
  });
});

describe("abiertasYSinPaso · reporte 8c", () => {
  it("dos series por vendedor y el porcentaje sin dividir entre cero", () => {
    const { series, filas } = abiertasYSinPaso(VENDEDORES);
    expect(series.map((s) => s.clave)).toEqual(["abiertas", "sinSiguientePaso"]);
    expect(filas[0]!.valores).toEqual({ abiertas: 5, sinSiguientePaso: 5 });
    expect(filas[0]!.detalle.map((d) => `${d.etiqueta}=${d.texto}`)).toEqual(["Abiertas=5", "Sin siguiente paso=5", "Sin siguiente paso sobre abiertas=100.0 %"]);
    expect(filas[0]!.detalle[1]).toMatchObject({ tono: "peligro" });
    expect(filas[2]!.detalle[2]).toMatchObject({ texto: "—", tono: "tenue" });
  });
});

const ETAPAS: SaludPorEtapa[] = [
  { clave: "Calificación", etiqueta: "Calificación", cuantas: 2, promedio: null, bajoMinimo: 0, sinCalificar: 2 },
  { clave: "Descubrimiento", etiqueta: "Descubrimiento", cuantas: 2, promedio: 26, bajoMinimo: 2, sinCalificar: 0 },
  { clave: "Propuesta", etiqueta: "Propuesta", cuantas: 1, promedio: 83, bajoMinimo: 0, sinCalificar: 0 },
];

describe("saludPorEtapaGrafica · reporte 9", () => {
  it("promedio por etapa con el mínimo como referencia; sin datos no es cero", () => {
    const { filas, referencia } = saludPorEtapaGrafica(ETAPAS, 70);
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
