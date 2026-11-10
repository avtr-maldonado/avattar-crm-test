import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { aActividadDeLista, aFichaDeOportunidad, aNota, aOportunidadDeLista, extracto } from "./dto";
import { ActividadDeLista, FichaDeOportunidad, Nota, OportunidadDeLista } from "./esquemas";

/**
 * INV-02 reforzado para el MCP (§61): costo, utilidad y margen nunca salen por
 * aquí, aunque la sesión tenga VER_COSTO y el lector los haya traído.
 */
const PROHIBIDAS = ["grossMargin", "grossProfit", "totalCost", "unitCost", "margen", "costo", "utilidad"];

function clavesProfundas(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => clavesProfundas(x, acc));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      acc.add(k);
      clavesProfundas(x, acc);
    }
  }
  return acc;
}

const lista = {
  id: "opp_1",
  folio: "OPP-2026-00012",
  name: "ERP para Grupo Norte",
  amount: money("125000.0000"),
  grossMargin: money("0.3200"),
  status: "ABIERTA" as const,
  forecastCategory: "PROBABLE" as const,
  expectedCloseDate: new Date("2026-12-20T12:00:00Z"),
  lastActivityAt: new Date("2026-11-09T17:30:00Z"),
  organization: { id: "org_1", name: "Grupo Norte" },
  stage: { id: "st_3", name: "Negociación", probability: money("0.6000") },
  owner: { id: "u_1", name: "Jorge Medina" },
};

describe("aOportunidadDeLista", () => {
  it("traduce al DTO del agente sin margen ni costo", () => {
    const dto = aOportunidadDeLista(lista);
    expect(dto).toEqual({
      opportunity_id: "opp_1",
      folio: "OPP-2026-00012",
      nombre: "ERP para Grupo Norte",
      cuenta: "Grupo Norte",
      etapa: "Negociación",
      probabilidad: "0.6",
      importe_usd: "125000",
      estatus: "ABIERTA",
      pronostico: "PROBABLE",
      cierre_estimado: "2026-12-20",
      propietario: "Jorge Medina",
      ultima_actividad: "2026-11-09T17:30:00.000Z",
    });
    for (const k of PROHIBIDAS) expect(clavesProfundas(dto).has(k)).toBe(false);
    expect(OportunidadDeLista.safeParse(dto)).toMatchObject({ success: true });
  });
});

describe("aFichaDeOportunidad", () => {
  it("lleva etapa, MEDDIC, hitos, banderas y recomendaciones previas, y nada de costo", () => {
    const entrada = {
        ...lista,
        estimatedAmount: money("120000.0000"),
        businessType: "NUEVO",
        countryCode: "MX",
        createdAt: new Date("2026-09-01T10:00:00Z"),
        actualCloseDate: null,
        stageEnteredAt: new Date("2026-10-20T10:00:00Z"),
        nextActivityAt: null,
        meddicScore: 55,
        organization: { id: "org_1", name: "Grupo Norte", industry: "Manufactura", city: "Monterrey" },
        primaryPerson: { name: "Ana Ruiz", jobTitle: "CFO", committeeRole: { name: "Decisor económico" } },
        pipeline: { name: "Ventas México" },
        meddic: [{ component: "METRICAS", status: "CONFIRMADO", evidence: "Ahorro del 12 %", person: null }],
        quotes: [{ netSubtotal: money("125000.0000"), grossProfit: money("40000.0000"), totalCost: money("85000.0000"), _count: { lines: 3 } }],
        milestones: [{ position: 1, description: "Anticipo", dueDate: new Date("2026-12-30T12:00:00Z"), amount: money("50000.0000"), status: "PENDIENTE" }],
        supportUsers: [{ user: { id: "u_2", name: "Luis Preventa", role: "PREVENTA" } }],
    };
    const ficha = aFichaDeOportunidad(entrada, {
        banderas: [{ flag: "ESTANCADA", diasEnEtapa: 26, limite: 21 }],
        totalDeActividades: 7,
        recomendaciones: [{ generatedAt: new Date("2026-11-01T10:00:00Z"), etiqueta: "EN_RIESGO", generatedBy: "Jorge Medina" }],
    });
    expect(ficha).toMatchObject({
      opportunity_id: "opp_1",
      etapa: { nombre: "Negociación", probabilidad: "0.6", desde: "2026-10-20T10:00:00.000Z" },
      importe_usd: "125000",
      cotizacion: { neto_usd: "125000", lineas: 3 },
      meddic: { puntaje: 55, componentes: [{ componente: "METRICAS", estado: "CONFIRMADO", evidencia: "Ahorro del 12 %" }] },
      hitos: [{ descripcion: "Anticipo", vence: "2026-12-30", importe_usd: "50000", estado: "PENDIENTE" }],
      banderas: [{ bandera: "ESTANCADA", dias_en_etapa: 26, limite: 21 }],
      preventa: "Luis Preventa",
      total_de_actividades: 7,
      recomendaciones_previas: [{ fecha: "2026-11-01T10:00:00.000Z", etiqueta: "EN_RIESGO", por: "Jorge Medina" }],
    });
    for (const k of PROHIBIDAS) expect(clavesProfundas(ficha).has(k)).toBe(false);
    // El DTO es exactamente el contrato de salida: ni una clave de más ni de menos.
    expect(FichaDeOportunidad.safeParse(ficha)).toMatchObject({ success: true });
  });
});

describe("actividades", () => {
  const actividad = {
    id: "act_1",
    subject: "Llamada con el patrocinador",
    notes: "Revisamos el presupuesto.\nQueda pendiente la fecha.",
    outcome: "Presupuesto aprobado para Q1.",
    transcript: "Vendedor: ¿Cómo va el presupuesto?\nCliente: Aprobado para Q1.",
    startsAt: new Date("2026-11-09T17:00:00Z"),
    durationMin: 30,
    completedAt: new Date("2026-11-09T17:30:00Z"),
    type: { name: "Llamada" },
    user: { name: "Jorge Medina" },
    opportunity: { id: "opp_1", folio: "OPP-2026-00012" },
  };

  it("la lista lleva metadatos y extracto, nunca el contenido completo", () => {
    const dto = aActividadDeLista(actividad, 20);
    expect(dto).toEqual({
      activity_id: "act_1",
      tipo: "Llamada",
      asunto: "Llamada con el patrocinador",
      fecha: "2026-11-09T17:00:00.000Z",
      duracion_min: 30,
      hecha: true,
      responsable: "Jorge Medina",
      extracto: "Revisamos el presupu…",
      tiene_transcripcion: true,
      longitud_transcripcion: actividad.transcript.length,
    });
    expect(ActividadDeLista.safeParse(dto)).toMatchObject({ success: true });
  });

  it("la nota lleva todo", () => {
    expect(aNota(actividad)).toEqual({
      activity_id: "act_1",
      opportunity_id: "opp_1",
      folio: "OPP-2026-00012",
      tipo: "Llamada",
      asunto: "Llamada con el patrocinador",
      fecha: "2026-11-09T17:00:00.000Z",
      hecha: true,
      responsable: "Jorge Medina",
      notas: actividad.notes,
      resultado: actividad.outcome,
      transcripcion: actividad.transcript,
    });
    expect(Nota.safeParse(aNota(actividad))).toMatchObject({ success: true });
  });

  it("el extracto prefiere el resultado si no hay notas, y no corta lo que cabe", () => {
    expect(extracto({ notes: null, outcome: "Corto.", transcript: null }, 20)).toBe("Corto.");
    expect(extracto({ notes: null, outcome: null, transcript: "Solo transcripción larga de verdad" }, 10)).toBe("Solo trans…");
    expect(extracto({ notes: null, outcome: null, transcript: null }, 10)).toBeNull();
  });
});
