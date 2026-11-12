import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import { LIMITE_TRANSCRIPCION, actividadesCitables, textoDeExpediente, type Expediente } from "./expediente";

const d = (s: string) => new Decimal(s);

function expediente(extra: Partial<Expediente> = {}): Expediente {
  return {
    id: "op1",
    folio: "OPP-2026-00042",
    name: "Migración a la nube",
    status: "ABIERTA",
    amount: d("125000.0000"),
    estimatedAmount: d("120000.0000"),
    forecastCategory: "PIPELINE",
    businessType: "NUEVO",
    expectedCloseDate: new Date("2026-12-15T00:00:00Z"),
    stageEnteredAt: new Date("2026-10-20T00:00:00Z"),
    lastActivityAt: new Date("2026-11-01T00:00:00Z"),
    nextActivityAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    meddicScore: 55,
    organization: { name: "Grupo Andino", industry: "Retail", city: "Bogotá" },
    primaryPerson: { name: "Laura Pérez", jobTitle: "CIO", committeeRole: { name: "Comprador económico" } },
    stage: { name: "Negociación", probability: d("0.6000"), staleAfterDays: 14, isClosing: false },
    country: { timezone: "America/Bogota", name: "Colombia" },
    owner: { name: "Jorge Medina" },
    supportUsers: [{ user: { name: "Paula Preventa" } }],
    meddic: [
      { component: "METRICAS", status: "CONFIRMADO", evidence: "Ahorro del 30 % en licencias", person: null },
      { component: "DECISOR_ECONOMICO", status: "PARCIAL", evidence: null, person: { name: "Laura Pérez" } },
    ],
    milestones: [{ position: 1, description: "Anticipo", dueDate: new Date("2026-12-20T00:00:00Z"), amount: d("50000.0000"), status: "PENDIENTE" }],
    quote: {
      netSubtotal: d("125000.0000"),
      lines: [{ description: "Consultoría cloud", quantity: d("10"), unitPrice: d("12500.0000"), discountRate: d("0.0000") }],
    },
    activities: [
      {
        id: "act2",
        subject: "Llamada de seguimiento",
        startsAt: new Date("2026-11-01T15:00:00Z"),
        completedAt: new Date("2026-11-01T15:30:00Z"),
        notes: "Pidieron bajar el precio",
        outcome: "Esperan propuesta revisada",
        transcript: null,
        type: { name: "Llamada" },
        user: { name: "Jorge Medina" },
      },
      {
        id: "act1",
        subject: "Demo",
        startsAt: new Date("2026-10-25T15:00:00Z"),
        completedAt: new Date("2026-10-25T16:00:00Z"),
        notes: null,
        outcome: null,
        transcript: "Laura: no tenemos presupuesto aprobado todavía. Jorge: entendido.",
        type: { name: "Videollamada" },
        user: { name: "Jorge Medina" },
      },
    ],
    insights: [],
    banderas: ["ESTANCADA"],
    ...extra,
  };
}

describe("textoDeExpediente · lo que lee el modelo (§62)", () => {
  it("nombra la oportunidad, la cuenta, la etapa, el MEDDIC, los hitos, la cotización y cada actividad con su id", () => {
    const texto = textoDeExpediente(expediente());
    expect(texto).toContain("OPP-2026-00042");
    expect(texto).toContain("Grupo Andino");
    expect(texto).toContain("Negociación");
    expect(texto).toContain("Comprador económico");
    expect(texto).toContain("Anticipo");
    expect(texto).toContain("Consultoría cloud");
    expect(texto).toContain("activity_id: act1");
    expect(texto).toContain("activity_id: act2");
    expect(texto).toContain("no tenemos presupuesto aprobado todavía");
    expect(texto).toContain("Estancada");
  });

  it("nunca menciona costo, utilidad ni margen (INV-02): la ficha la lee el vendedor", () => {
    const texto = textoDeExpediente(expediente()).toLowerCase();
    expect(texto).not.toMatch(/costo|utilidad|margen|cost|profit/);
  });

  it("las actividades van de la más reciente a la más antigua y las hechas se distinguen de las pendientes", () => {
    const texto = textoDeExpediente(
      expediente({
        activities: [
          ...expediente().activities,
          {
            id: "act3",
            subject: "Reunión de cierre",
            startsAt: new Date("2026-12-01T15:00:00Z"),
            completedAt: null,
            notes: null,
            outcome: null,
            transcript: null,
            type: { name: "Reunión" },
            user: { name: "Jorge Medina" },
          },
        ],
      }),
    );
    expect(texto.indexOf("act3")).toBeLessThan(texto.indexOf("act2"));
    expect(texto.indexOf("act2")).toBeLessThan(texto.indexOf("act1"));
    expect(texto).toMatch(/· pendiente · [^\n]*\nactivity_id: act3/);
    expect(texto).toMatch(/· hecha · [^\n]*\nactivity_id: act2/);
  });

  it("recorta una transcripción larga y lo dice", () => {
    const larga = "x".repeat(LIMITE_TRANSCRIPCION + 500);
    const texto = textoDeExpediente(
      expediente({ activities: [{ ...expediente().activities[1]!, transcript: larga }] }),
    );
    expect(texto).toContain("[…recortada]");
    expect(texto).not.toContain("x".repeat(LIMITE_TRANSCRIPCION + 1));
  });

  it("incluye el análisis anterior para que el modelo diga qué cambió", () => {
    const texto = textoDeExpediente(
      expediente({
        insights: [
          {
            generatedAt: new Date("2026-11-05T00:00:00Z"),
            payload: { estado: { etiqueta: "EN_RIESGO", resumen: "Sin respuesta del comprador." }, riesgos: [], acciones: [], huecos: [] },
          },
        ],
      }),
    );
    expect(texto).toContain("EN_RIESGO");
    expect(texto).toContain("Sin respuesta del comprador.");
  });
});

describe("actividadesCitables · lo que validarFuentes recibe", () => {
  it("devuelve cada actividad con su texto citable y la oportunidad a la que pertenece", () => {
    const citables = actividadesCitables(expediente());
    expect(citables.map((a) => a.id)).toEqual(["act2", "act1"]);
    expect(citables[1]).toMatchObject({ opportunityId: "op1", transcript: expect.stringContaining("presupuesto") });
  });
});
