import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { computeRiskFlags, explainRiskFlags, type RiskInputs } from "./riskFlags";

const HOY = new Date("2026-09-01T12:00:00Z");
const MANANA = new Date("2026-09-02T12:00:00Z");
const AYER = new Date("2026-08-31T12:00:00Z");

const politica = { marginFloor: money("0.20") };
const etapa = { staleAfterDays: 21 };

/** Una oportunidad sana: margen sobre el piso, con actividad futura, recién movida. */
function sana(p: Partial<RiskInputs> = {}): RiskInputs {
  return {
    grossMargin: money("0.31"),
    stageEnteredAt: AYER,
    nextActivityAt: MANANA,
    ...p,
  };
}

describe("computeRiskFlags · RN-13, INV-11", () => {
  it("una oportunidad sana no tiene banderas", () => {
    expect(computeRiskFlags(sana(), etapa, politica, HOY)).toEqual([]);
  });

  it("marca margen bajo cuando queda debajo del piso (RN-05)", () => {
    // Este es el caso que el seed del prototipo pasaba por alto:
    // OPP-2026-00304 tiene 19 % contra un piso de 20 % y solo estaba marcada
    // como estancada.
    const banderas = computeRiskFlags(sana({ grossMargin: money("0.19") }), etapa, politica, HOY);
    expect(banderas).toContain("MARGEN_BAJO");
  });

  it("no marca margen bajo justo EN el piso", () => {
    // «Verde en o sobre el piso, coral debajo» (§13.1). El piso cumple.
    const banderas = computeRiskFlags(sana({ grossMargin: money("0.20") }), etapa, politica, HOY);
    expect(banderas).not.toContain("MARGEN_BAJO");
  });

  it("una oportunidad sin margen calculado todavía no se marca", () => {
    // Sin cotización aún, grossMargin es null. Marcarla seria acusar de margen
    // bajo a algo que no se ha cotizado.
    const banderas = computeRiskFlags(sana({ grossMargin: null }), etapa, politica, HOY);
    expect(banderas).not.toContain("MARGEN_BAJO");
  });

  it("marca sin actividad cuando no hay próxima agendada (RN-10)", () => {
    expect(
      computeRiskFlags(sana({ nextActivityAt: null }), etapa, politica, HOY),
    ).toContain("SIN_ACTIVIDAD");
  });

  it("marca sin actividad cuando la próxima ya venció", () => {
    expect(
      computeRiskFlags(sana({ nextActivityAt: AYER }), etapa, politica, HOY),
    ).toContain("SIN_ACTIVIDAD");
  });

  it("marca estancada al pasar los días de la etapa (RN-03)", () => {
    const hace22Dias = new Date("2026-08-10T12:00:00Z");
    expect(
      computeRiskFlags(sana({ stageEnteredAt: hace22Dias }), etapa, politica, HOY),
    ).toContain("ESTANCADA");
  });

  it("no marca estancada justo en el límite de días", () => {
    const hace21Dias = new Date("2026-08-11T12:00:00Z");
    expect(
      computeRiskFlags(sana({ stageEnteredAt: hace21Dias }), etapa, politica, HOY),
    ).not.toContain("ESTANCADA");
  });

  it("el contador de estancamiento mira la ETAPA, no la última actividad (RN-03)", () => {
    // «El contador se reinicia solo al cambiar de etapa, no al registrar
    // cualquier actividad.» Una oportunidad con actividad de ayer pero sin
    // moverse de etapa en 30 días sigue estancada.
    const hace30Dias = new Date("2026-08-02T12:00:00Z");
    const banderas = computeRiskFlags(
      sana({ stageEnteredAt: hace30Dias, nextActivityAt: MANANA }),
      etapa,
      politica,
      HOY,
    );
    expect(banderas).toContain("ESTANCADA");
    expect(banderas).not.toContain("SIN_ACTIVIDAD");
  });

  it("acumula las tres banderas cuando aplican todas", () => {
    const banderas = computeRiskFlags(
      {
        grossMargin: money("0.05"),
        stageEnteredAt: new Date("2026-07-01T12:00:00Z"),
        nextActivityAt: null,
      },
      etapa,
      politica,
      HOY,
    );
    expect(banderas.sort()).toEqual(["ESTANCADA", "MARGEN_BAJO", "SIN_ACTIVIDAD"]);
  });

  it("los días de estancamiento salen de la etapa, no de una constante (INV-05)", () => {
    const hace12Dias = new Date("2026-08-20T12:00:00Z");
    // Cierre tiene 10 días; Propuesta, 30. La misma oportunidad, distinto veredicto.
    expect(computeRiskFlags(sana({ stageEnteredAt: hace12Dias }), { staleAfterDays: 10 }, politica, HOY))
      .toContain("ESTANCADA");
    expect(computeRiskFlags(sana({ stageEnteredAt: hace12Dias }), { staleAfterDays: 30 }, politica, HOY))
      .not.toContain("ESTANCADA");
  });

  it("el piso de margen sale de la política, no de una constante (INV-05)", () => {
    const conMargen15 = sana({ grossMargin: money("0.15") });
    expect(computeRiskFlags(conMargen15, etapa, { marginFloor: money("0.20") }, HOY))
      .toContain("MARGEN_BAJO");
    expect(computeRiskFlags(conMargen15, etapa, { marginFloor: money("0.10") }, HOY))
      .not.toContain("MARGEN_BAJO");
  });
});

describe("explainRiskFlags · la bandera con el número que la justifica", () => {
  it("la evidencia trae los mismos veredictos que las banderas", () => {
    const entrada = sana({ grossMargin: money("0.05"), nextActivityAt: null });
    expect(explainRiskFlags(entrada, etapa, politica, HOY).map((e) => e.flag)).toEqual(
      computeRiskFlags(entrada, etapa, politica, HOY),
    );
  });

  it("sin actividad dice cuántos días lleva sin contacto", () => {
    const hace34Dias = new Date("2026-07-29T12:00:00Z");
    const [evidencia] = explainRiskFlags(
      sana({ nextActivityAt: null, lastActivityAt: hace34Dias }),
      etapa,
      politica,
      HOY,
    );

    expect(evidencia).toEqual({ flag: "SIN_ACTIVIDAD", diasSinContacto: 34 });
  });

  it("sin actividad y sin historia: los días no se inventan", () => {
    // Una oportunidad recién creada no lleva «0 días sin contacto»: no ha
    // habido ninguno. Nulo, y la frase lo dice de otra manera.
    const [evidencia] = explainRiskFlags(
      sana({ nextActivityAt: null, lastActivityAt: null }),
      etapa,
      politica,
      HOY,
    );

    expect(evidencia).toEqual({ flag: "SIN_ACTIVIDAD", diasSinContacto: null });
  });

  it("estancada trae los días en la etapa y el límite que se pasó", () => {
    const hace26Dias = new Date("2026-08-06T12:00:00Z");
    const evidencia = explainRiskFlags(
      sana({ stageEnteredAt: hace26Dias }),
      { staleAfterDays: 21 },
      politica,
      HOY,
    );

    expect(evidencia).toContainEqual({ flag: "ESTANCADA", diasEnEtapa: 26, limite: 21 });
  });

  it("margen bajo trae el margen y el piso contra el que se comparó", () => {
    const evidencia = explainRiskFlags(
      sana({ grossMargin: money("0.09") }),
      etapa,
      { marginFloor: money("0.20") },
      HOY,
    );

    expect(evidencia).toContainEqual({
      flag: "MARGEN_BAJO",
      margen: money("0.09"),
      piso: money("0.20"),
    });
  });

  it("una oportunidad sana no trae evidencia de nada", () => {
    expect(explainRiskFlags(sana(), etapa, politica, HOY)).toEqual([]);
  });
});
