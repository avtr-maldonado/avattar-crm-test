import { describe, expect, it } from "vitest";
import { leerFicha } from "./ficha";

/**
 * Leer una ficha guardada · decisiones §64. La forma nueva (diagnóstico y
 * cuatro cuadrantes) se lee tal cual; la anterior (resumen, riesgos, acciones,
 * huecos) se traduce para que las fichas viejas se sigan viendo.
 */
const fuente = { activity_id: "a1", cita: "Aprobado para Q1" };

describe("leerFicha", () => {
  it("lee la forma nueva con sus cuatro cuadrantes y la cita de cada punto", () => {
    const f = leerFicha({
      estado: { etiqueta: "SALUDABLE", diagnostico: "Avanza con patrocinio y fecha." },
      fortalezas: [{ descripcion: "Presupuesto aprobado", fuente }],
      riesgos: [],
      siguientes_pasos: [{ descripcion: "Demo el jueves", fuente }],
      recomendaciones: [{ descripcion: "Confirmar asistentes", fuente: null }],
    });
    expect(f).toEqual({
      etiqueta: "SALUDABLE",
      diagnostico: "Avanza con patrocinio y fecha.",
      fortalezas: [{ descripcion: "Presupuesto aprobado", cita: "Aprobado para Q1" }],
      riesgos: [],
      siguientesPasos: [{ descripcion: "Demo el jueves", cita: "Aprobado para Q1" }],
      recomendaciones: [{ descripcion: "Confirmar asistentes", cita: null }],
    });
  });

  it("traduce la forma anterior: resumen es el diagnóstico; acciones y huecos, recomendaciones", () => {
    const f = leerFicha({
      estado: { etiqueta: "EN_RIESGO", resumen: "Sin fecha de firma." },
      riesgos: [{ descripcion: "Sin fecha", fuente }],
      acciones: [{ descripcion: "Pedir fecha", fuente }],
      huecos: [{ descripcion: "Proceso de compra desconocido" }],
    });
    expect(f).toEqual({
      etiqueta: "EN_RIESGO",
      diagnostico: "Sin fecha de firma.",
      fortalezas: [],
      riesgos: [{ descripcion: "Sin fecha", cita: "Aprobado para Q1" }],
      siguientesPasos: [],
      recomendaciones: [
        { descripcion: "Pedir fecha", cita: "Aprobado para Q1" },
        { descripcion: "Proceso de compra desconocido", cita: null },
      ],
    });
  });

  it("devuelve null si no hay etiqueta válida o no es un objeto", () => {
    expect(leerFicha(null)).toBeNull();
    expect(leerFicha({ estado: { etiqueta: "REGULAR", diagnostico: "x" } })).toBeNull();
    expect(leerFicha("texto")).toBeNull();
  });
});
