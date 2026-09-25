import { describe, expect, it } from "vitest";
import { computeRiskFlags, explainRiskFlags, type RiskInputs } from "./riskFlags";

const HOY = new Date("2026-09-01T12:00:00Z");
const MANANA = new Date("2026-09-02T12:00:00Z");
const AYER = new Date("2026-08-31T12:00:00Z");

const etapa = { staleAfterDays: 21 };

/** Una oportunidad sana: con actividad futura, recién movida. */
function sana(p: Partial<RiskInputs> = {}): RiskInputs {
  return {
    stageEnteredAt: AYER,
    nextActivityAt: MANANA,
    ...p,
  };
}

describe("computeRiskFlags · RN-13, INV-11", () => {
  it("una oportunidad sana no tiene banderas", () => {
    expect(computeRiskFlags(sana(), etapa, HOY)).toEqual([]);
  });

  it("el margen bajo NO es una bandera de riesgo (decisiones §27)", () => {
    // Antes lo era (RN-13). El negocio lo quitó el 24-sep-2026: el margen ya
    // se ve en la tarjeta, verde o coral (§13.1), y como bandera duplicaba la
    // señal y llenaba la cola de riesgo de cosas que no son de seguimiento.
    const banderas = computeRiskFlags(sana(), etapa, HOY);
    expect(banderas).toEqual([]);
  });



  it("marca sin actividad cuando no hay próxima agendada (RN-10)", () => {
    expect(
      computeRiskFlags(sana({ nextActivityAt: null }), etapa, HOY),
    ).toContain("SIN_ACTIVIDAD");
  });

  it("marca sin actividad cuando la próxima ya venció", () => {
    expect(
      computeRiskFlags(sana({ nextActivityAt: AYER }), etapa, HOY),
    ).toContain("SIN_ACTIVIDAD");
  });

  it("marca estancada al pasar los días de la etapa (RN-03)", () => {
    const hace22Dias = new Date("2026-08-10T12:00:00Z");
    expect(
      computeRiskFlags(sana({ stageEnteredAt: hace22Dias }), etapa, HOY),
    ).toContain("ESTANCADA");
  });

  it("no marca estancada justo en el límite de días", () => {
    const hace21Dias = new Date("2026-08-11T12:00:00Z");
    expect(
      computeRiskFlags(sana({ stageEnteredAt: hace21Dias }), etapa, HOY),
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
      HOY,
    );
    expect(banderas).toContain("ESTANCADA");
    expect(banderas).not.toContain("SIN_ACTIVIDAD");
  });

  it("acumula las dos banderas cuando aplican las dos", () => {
    const banderas = computeRiskFlags(
      {
        stageEnteredAt: new Date("2026-07-01T12:00:00Z"),
        nextActivityAt: null,
      },
      etapa,
      HOY,
    );
    expect(banderas.sort()).toEqual(["ESTANCADA", "SIN_ACTIVIDAD"]);
  });

  it("los días de estancamiento salen de la etapa, no de una constante (INV-05)", () => {
    const hace12Dias = new Date("2026-08-20T12:00:00Z");
    // Cierre tiene 10 días; Propuesta, 30. La misma oportunidad, distinto veredicto.
    expect(computeRiskFlags(sana({ stageEnteredAt: hace12Dias }), { staleAfterDays: 10 }, HOY))
      .toContain("ESTANCADA");
    expect(computeRiskFlags(sana({ stageEnteredAt: hace12Dias }), { staleAfterDays: 30 }, HOY))
      .not.toContain("ESTANCADA");
  });

});

describe("explainRiskFlags · la bandera con el número que la justifica", () => {
  it("la evidencia trae los mismos veredictos que las banderas", () => {
    const entrada = sana({ nextActivityAt: null });
    expect(explainRiskFlags(entrada, etapa, HOY).map((e) => e.flag)).toEqual(
      computeRiskFlags(entrada, etapa, HOY),
    );
  });

  it("sin actividad dice cuántos días lleva sin contacto", () => {
    const hace34Dias = new Date("2026-07-29T12:00:00Z");
    const [evidencia] = explainRiskFlags(
      sana({ nextActivityAt: null, lastActivityAt: hace34Dias }),
      etapa,
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
      HOY,
    );

    expect(evidencia).toEqual({ flag: "SIN_ACTIVIDAD", diasSinContacto: null });
  });

  it("estancada trae los días en la etapa y el límite que se pasó", () => {
    const hace26Dias = new Date("2026-08-06T12:00:00Z");
    const evidencia = explainRiskFlags(
      sana({ stageEnteredAt: hace26Dias }),
      { staleAfterDays: 21 },
      HOY,
    );

    expect(evidencia).toContainEqual({ flag: "ESTANCADA", diasEnEtapa: 26, limite: 21 });
  });


  it("una oportunidad sana no trae evidencia de nada", () => {
    expect(explainRiskFlags(sana(), etapa, HOY)).toEqual([]);
  });
});
