import { describe, expect, it } from "vitest";
import { BuscarOportunidades, GuardarRecomendacion, ListarActividades, LIMITES } from "./esquemas";

/** Los esquemas Zod son la fuente única de lo que el agente puede mandar (§61). */

const fuente = { activity_id: "act_1", cita: "Presupuesto aprobado para Q1." };
const buena = {
  opportunity_id: "opp_1",
  estado: { etiqueta: "EN_RIESGO", resumen: "Hay patrocinio pero no hay fecha de decisión." },
  riesgos: [{ descripcion: "Sin fecha de decisión", fuente }],
  acciones: [{ descripcion: "Pedir fecha al patrocinador", fuente }],
  huecos: [{ descripcion: "No se conoce el proceso de compra" }],
};

function problemas(r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) {
  return r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("GuardarRecomendacion", () => {
  it("acepta una recomendación completa", () => {
    expect(GuardarRecomendacion.safeParse(buena).success).toBe(true);
  });

  it("exige al menos una acción", () => {
    const p = problemas(GuardarRecomendacion.safeParse({ ...buena, acciones: [] }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^acciones: /);
    expect(p[0]).toMatch(/al menos una/);
  });

  it("no acepta más riesgos que el límite, y lo dice con el número", () => {
    const riesgos = Array.from({ length: LIMITES.riesgos + 1 }, () => buena.riesgos[0]);
    const p = problemas(GuardarRecomendacion.safeParse({ ...buena, riesgos }));
    expect(p[0]).toMatch(new RegExp(`^riesgos: .*${LIMITES.riesgos}`));
  });

  it("acota la cita y señala la fuente exacta", () => {
    const larga = { ...buena, acciones: [{ ...buena.acciones[0], fuente: { ...fuente, cita: "x".repeat(LIMITES.cita + 1) } }] };
    const p = problemas(GuardarRecomendacion.safeParse(larga));
    expect(p[0]).toMatch(new RegExp(`^acciones.0.fuente.cita: .*${LIMITES.cita}`));
  });

  it("la etiqueta del estado es cerrada", () => {
    const p = problemas(GuardarRecomendacion.safeParse({ ...buena, estado: { ...buena.estado, etiqueta: "REGULAR" } }));
    expect(p[0]).toMatch(/^estado.etiqueta: .*SALUDABLE.*EN_RIESGO.*CRITICA.*SIN_INFORMACION/);
  });

  it("no acepta campos que no existen: el agente debe usar los del esquema", () => {
    const p = problemas(GuardarRecomendacion.safeParse({ ...buena, notas: "extra" }));
    expect(p[0]).toMatch(/notas/);
  });
});

describe("BuscarOportunidades", () => {
  it("abiertas por omisión", () => {
    const r = BuscarOportunidades.safeParse({});
    expect(r.success && r.data.estatus).toBe("ABIERTA");
  });

  it("un rango de fechas siempre dice sobre qué campo aplica", () => {
    const p = problemas(BuscarOportunidades.safeParse({ desde: "2026-10-01" }));
    expect(p[0]).toMatch(/^campo_fecha: .*CIERRE_ESTIMADO.*CIERRE_REAL.*CREACION.*ULTIMA_ACTIVIDAD/);
  });

  it("las fechas van como AAAA-MM-DD", () => {
    const p = problemas(BuscarOportunidades.safeParse({ campo_fecha: "CREACION", desde: "01/10/2026" }));
    expect(p[0]).toMatch(/^desde: .*AAAA-MM-DD/);
  });

  it("el importe mínimo no supera al máximo", () => {
    const p = problemas(BuscarOportunidades.safeParse({ importe_min: 100, importe_max: 50 }));
    expect(p[0]).toMatch(/^importe_min: /);
  });
});

describe("ListarActividades", () => {
  it("límite por omisión y tope", () => {
    const r = ListarActividades.safeParse({ opportunity_id: "opp_1" });
    expect(r.success && r.data.limit).toBe(LIMITES.actividadesPorOmision);
    const p = problemas(ListarActividades.safeParse({ opportunity_id: "opp_1", limit: LIMITES.actividadesMax + 1 }));
    expect(p[0]).toMatch(new RegExp(`^limit: .*${LIMITES.actividadesMax}`));
  });
});
