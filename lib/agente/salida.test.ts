import { describe, expect, it } from "vitest";
import { Analisis, FORMATO_DE_SALIDA } from "./salida";

const VALIDO = {
  estado: { etiqueta: "EN_RIESGO", diagnostico: "La negociación lleva tres semanas sin respuesta del comprador económico." },
  fortalezas: [
    {
      descripcion: "El dolor está identificado y cuantificado.",
      fuente: { activity_id: "act1", cita: "nos vemos la semana que entra" },
    },
  ],
  siguientes_pasos: [
    {
      descripcion: "Reunión con finanzas agendada.",
      fuente: { activity_id: "act1", cita: "nos vemos la semana que entra" },
    },
  ],
  riesgos: [
    {
      descripcion: "El comprador económico no ha confirmado presupuesto.",
      fuente: { activity_id: "act1", cita: "no tenemos presupuesto aprobado todavía" },
    },
  ],
  recomendaciones: [
    {
      descripcion: "Agendar llamada con el director de finanzas antes del viernes.",
      fuente: { activity_id: "act1", cita: "nos vemos la semana que entra" },
    },
    { descripcion: "Identificar al campeón.", fuente: null },
  ],
};

describe("Analisis · la salida del agente es la recomendación del MCP sin opportunity_id ni model (§62)", () => {
  it("acepta una ficha válida", () => {
    expect(Analisis.safeParse(VALIDO).success).toBe(true);
  });

  it("rechaza opportunity_id y model: el agente ya sabe de qué oportunidad habla", () => {
    expect(Analisis.safeParse({ ...VALIDO, opportunity_id: "x" }).success).toBe(false);
    expect(Analisis.safeParse({ ...VALIDO, model: "x" }).success).toBe(false);
  });

  it("aplica los mismos límites: sin recomendaciones no hay ficha, y un diagnóstico de tres letras tampoco", () => {
    expect(Analisis.safeParse({ ...VALIDO, recomendaciones: [] }).success).toBe(false);
    expect(Analisis.safeParse({ ...VALIDO, estado: { ...VALIDO.estado, diagnostico: "ok" } }).success).toBe(false);
  });
});

describe("FORMATO_DE_SALIDA · el JSON Schema que la API impone dice lo mismo que Zod", () => {
  it("tiene las mismas claves de primer nivel, todas obligatorias y sin extras", () => {
    const claves = Object.keys(Analisis.shape).sort();
    expect(Object.keys(FORMATO_DE_SALIDA.schema.properties).sort()).toEqual(claves);
    expect([...FORMATO_DE_SALIDA.schema.required].sort()).toEqual(claves);
    expect(FORMATO_DE_SALIDA.schema.additionalProperties).toBe(false);
  });

  it("cada lista lleva descripción y fuente; la de recomendaciones admite null; el estado lleva la enumeración", () => {
    for (const lista of ["fortalezas", "riesgos", "siguientes_pasos"] as const) {
      const item = FORMATO_DE_SALIDA.schema.properties[lista].items;
      expect(Object.keys(item.properties).sort()).toEqual(["descripcion", "fuente"]);
      expect(Object.keys(item.properties.fuente.properties).sort()).toEqual(["activity_id", "cita"]);
    }
    const rec = FORMATO_DE_SALIDA.schema.properties.recomendaciones.items;
    expect(rec.required).toEqual(["descripcion", "fuente"]);
    expect(JSON.stringify(rec.properties.fuente)).toContain('"null"');
    expect(Object.keys(FORMATO_DE_SALIDA.schema.properties.estado.properties).sort()).toEqual(["diagnostico", "etiqueta"]);
    expect(FORMATO_DE_SALIDA.schema.properties.estado.properties.etiqueta.enum).toEqual([
      "SALUDABLE",
      "EN_RIESGO",
      "CRITICA",
      "SIN_INFORMACION",
    ]);
  });

  it("no lleva límites de longitud ni de cardinalidad: esos los aplica Zod después", () => {
    expect(JSON.stringify(FORMATO_DE_SALIDA)).not.toMatch(/minLength|maxLength|minItems|maxItems/);
  });
});
