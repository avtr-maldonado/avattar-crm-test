import { describe, expect, it } from "vitest";
import { citaAparece, validarFuentes, type ActividadCitable } from "./insightFuentes";

/**
 * El servidor valida las fuentes de una recomendación, no el modelo (§61):
 * cada activity_id citado existe al alcance, es de esa oportunidad y la cita
 * aparece textual en la actividad.
 */
const actividades: ActividadCitable[] = [
  {
    id: "act_1",
    opportunityId: "opp_1",
    subject: "Llamada con el patrocinador",
    notes: "Revisamos   el presupuesto.\nQueda pendiente la fecha.",
    outcome: null,
    transcript: "Vendedor: ¿Cómo va el presupuesto?\nCliente: Aprobado para Q1, pero sin fecha de firma.",
  },
  { id: "act_2", opportunityId: "opp_2", subject: "Correo", notes: null, outcome: "Enviada la propuesta.", transcript: null },
];

const folios = { opp_1: "OPP-2026-00012", opp_2: "OPP-2026-00007" };

const VACIA = { fortalezas: [], riesgos: [], siguientes_pasos: [], recomendaciones: [] };

describe("citaAparece", () => {
  it("compara con espacios normalizados y sin distinguir mayúsculas", () => {
    expect(citaAparece("revisamos el presupuesto", actividades[0]!)).toBe(true);
    expect(citaAparece("Aprobado para Q1,\n  pero sin fecha", actividades[0]!)).toBe(true);
    expect(citaAparece("Aprobado para Q2", actividades[0]!)).toBe(false);
  });
});

describe("validarFuentes", () => {
  it("todo en orden: sin problemas y con los ids citados sin repetir", () => {
    const r = validarFuentes(
      "opp_1",
      {
        ...VACIA,
        riesgos: [{ descripcion: "Sin fecha de firma", fuente: { activity_id: "act_1", cita: "sin fecha de firma" } }],
        recomendaciones: [{ descripcion: "Pedir fecha", fuente: { activity_id: "act_1", cita: "Queda pendiente la fecha" } }],
      },
      actividades,
      folios,
    );
    expect(r).toEqual({ problemas: [], idsCitados: ["act_1"] });
  });

  it("una actividad que no está al alcance se señala con su índice, sin confirmar si existe", () => {
    const r = validarFuentes(
      "opp_1",
      { ...VACIA, recomendaciones: [{ descripcion: "x", fuente: { activity_id: "act_9", cita: "lo que sea" } }] },
      actividades,
      folios,
    );
    expect(r.problemas).toEqual([
      {
        campo: "recomendaciones.0.fuente.activity_id",
        mensaje: "«act_9» no existe o no está a tu alcance. Cita solo actividades que te devolvió listar_actividades de OPP-2026-00012.",
      },
    ]);
  });

  it("una actividad de otra oportunidad dice de cuál es", () => {
    const r = validarFuentes(
      "opp_1",
      { ...VACIA, riesgos: [{ descripcion: "x", fuente: { activity_id: "act_2", cita: "Enviada la propuesta" } }] },
      actividades,
      folios,
    );
    expect(r.problemas[0]).toEqual({
      campo: "riesgos.0.fuente.activity_id",
      mensaje: "«act_2» pertenece a OPP-2026-00007, no a OPP-2026-00012. Cita solo actividades de listar_actividades de esta oportunidad.",
    });
  });

  it("una cita que no aparece en la actividad se rechaza pidiendo copiarla de obtener_nota", () => {
    const r = validarFuentes(
      "opp_1",
      { ...VACIA, recomendaciones: [{ descripcion: "x", fuente: { activity_id: "act_1", cita: "El cliente firmó el contrato" } }] },
      actividades,
      folios,
    );
    expect(r.problemas[0]).toEqual({
      campo: "recomendaciones.0.fuente.cita",
      mensaje: "la cita no aparece en la actividad «act_1» (asunto, notas, resultado ni transcripción). Copia el fragmento tal cual de obtener_nota.",
    });
  });

  it("devuelve todos los problemas juntos, no solo el primero", () => {
    const r = validarFuentes(
      "opp_1",
      {
        ...VACIA,
        riesgos: [{ descripcion: "a", fuente: { activity_id: "act_9", cita: "x" } }],
        recomendaciones: [{ descripcion: "b", fuente: { activity_id: "act_1", cita: "no está" } }],
      },
      actividades,
      folios,
    );
    expect(r.problemas.map((p) => p.campo)).toEqual(["riesgos.0.fuente.activity_id", "recomendaciones.0.fuente.cita"]);
  });
});

describe("validarFuentes · las cuatro listas (§64)", () => {
  it("revisa fortalezas y siguientes pasos, y una recomendación sin fuente no se revisa", () => {
    const r = validarFuentes(
      "opp_1",
      {
        fortalezas: [{ descripcion: "a", fuente: { activity_id: "act_1", cita: "Aprobado para Q1" } }],
        riesgos: [],
        siguientes_pasos: [{ descripcion: "b", fuente: { activity_id: "act_1", cita: "no aparece" } }],
        recomendaciones: [{ descripcion: "c", fuente: null }, { descripcion: "d" }],
      },
      actividades,
      folios,
    );
    expect(r.problemas.map((p) => p.campo)).toEqual(["siguientes_pasos.0.fuente.cita"]);
    expect(r.idsCitados).toEqual(["act_1"]);
  });
});
