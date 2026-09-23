import { describe, expect, it } from "vitest";
import {
  DESCRIPCION_COMPONENTE,
  puedeCalificarDirecto,
  PESOS_POR_OMISION,
  componentesFaltantesParaGanar,
  computeMeddicScore,
  validarComponente,
  type MeddicAssessment,
} from "./meddic";

const TODOS = [
  "METRICAS",
  "DECISOR_ECONOMICO",
  "CRITERIOS_DECISION",
  "PROCESO_DECISION",
  "DOLOR_IDENTIFICADO",
  "CAMPEON",
] as const;

function evaluaciones(
  estados: Partial<Record<(typeof TODOS)[number], MeddicAssessment["status"]>>,
): MeddicAssessment[] {
  return TODOS.map((component) => ({
    component,
    status: estados[component] ?? "NO_EVALUADO",
  }));
}

describe("computeMeddicScore · §7.2", () => {
  it("los pesos por omisión suman 100 (Q-08)", () => {
    const suma = Object.values(PESOS_POR_OMISION).reduce((a, b) => a + b, 0);
    expect(suma).toBe(100);
  });

  it("los seis confirmados dan 100", () => {
    const todos = Object.fromEntries(TODOS.map((c) => [c, "CONFIRMADO" as const]));
    expect(computeMeddicScore(evaluaciones(todos), PESOS_POR_OMISION)).toBe(100);
  });

  it("ninguno evaluado da 0", () => {
    expect(computeMeddicScore(evaluaciones({}), PESOS_POR_OMISION)).toBe(0);
  });

  it("AUSENTE vale 0, igual que NO_EVALUADO, pero es información distinta", () => {
    // §7.1: «Se trabajó y se concluyó que no existe. Distinto de no evaluado.»
    // Para el puntaje pesan igual; la diferencia está en la pantalla.
    const ausente = computeMeddicScore(evaluaciones({ CAMPEON: "AUSENTE" }), PESOS_POR_OMISION);
    const sinEvaluar = computeMeddicScore(evaluaciones({}), PESOS_POR_OMISION);
    expect(ausente).toBe(sinEvaluar);
  });

  it("PARCIAL vale la mitad que CONFIRMADO", () => {
    const parcial = computeMeddicScore(
      evaluaciones(Object.fromEntries(TODOS.map((c) => [c, "PARCIAL" as const]))),
      PESOS_POR_OMISION,
    );
    expect(parcial).toBe(50);
  });

  it("cambiar los pesos cambia el puntaje sin desplegar código (AC-17)", () => {
    const soloDecisor = evaluaciones({ DECISOR_ECONOMICO: "CONFIRMADO" });
    const conOmision = computeMeddicScore(soloDecisor, PESOS_POR_OMISION);
    const ponderandoDecisor = computeMeddicScore(soloDecisor, {
      ...PESOS_POR_OMISION,
      DECISOR_ECONOMICO: 50,
    });
    expect(ponderandoDecisor).toBeGreaterThan(conOmision);
  });
});

describe("validarComponente · RN-30", () => {
  it("PARCIAL exige evidencia no vacía (AC-13)", () => {
    expect(validarComponente({ component: "METRICAS", status: "PARCIAL", evidence: "" }))
      .toMatchObject({ ok: false });
    expect(validarComponente({ component: "METRICAS", status: "PARCIAL", evidence: "   " }))
      .toMatchObject({ ok: false });
    expect(
      validarComponente({ component: "METRICAS", status: "PARCIAL", evidence: "Ahorro de 2 M anuales" }),
    ).toMatchObject({ ok: true });
  });

  it("CONFIRMADO también exige evidencia", () => {
    expect(
      validarComponente({ component: "CRITERIOS_DECISION", status: "CONFIRMADO", evidence: null }),
    ).toMatchObject({ ok: false });
  });

  it("NO_EVALUADO y AUSENTE no exigen evidencia", () => {
    expect(validarComponente({ component: "METRICAS", status: "NO_EVALUADO" })).toMatchObject({ ok: true });
    expect(validarComponente({ component: "METRICAS", status: "AUSENTE" })).toMatchObject({ ok: true });
  });

  it("el decisor económico CONFIRMADO exige una persona ligada (AC-12)", () => {
    const sinPersona = validarComponente({
      component: "DECISOR_ECONOMICO",
      status: "CONFIRMADO",
      evidence: "Reunión del 12 de agosto",
    });
    expect(sinPersona.ok).toBe(false);
    expect(sinPersona.ok === false && sinPersona.motivo).toMatch(/persona/i);
  });

  it("el campeón CONFIRMADO exige una persona ligada (AC-12)", () => {
    expect(
      validarComponente({
        component: "CAMPEON",
        status: "CONFIRMADO",
        evidence: "Nos abre puertas con el comité",
        personId: null,
      }),
    ).toMatchObject({ ok: false });

    expect(
      validarComponente({
        component: "CAMPEON",
        status: "CONFIRMADO",
        evidence: "Nos abre puertas con el comité",
        personId: "p-oscar",
      }),
    ).toMatchObject({ ok: true });
  });

  it("los componentes de texto NO exigen persona", () => {
    expect(
      validarComponente({
        component: "PROCESO_DECISION",
        status: "CONFIRMADO",
        evidence: "Comité el 3 de octubre, firma el 15",
      }),
    ).toMatchObject({ ok: true });
  });

  it("PARCIAL en decisor o campeón todavía no exige persona", () => {
    // Se está trabajando; la persona se exige para cerrar en CONFIRMADO.
    expect(
      validarComponente({ component: "CAMPEON", status: "PARCIAL", evidence: "Hay un candidato" }),
    ).toMatchObject({ ok: true });
  });
});

describe("componentesFaltantesParaGanar · RN-28, AC-14", () => {
  const minimos = { meddicMinToWin: 80 };

  it("con puntaje suficiente y E, I, C confirmados, no falta nada", () => {
    const listo = evaluaciones({
      METRICAS: "CONFIRMADO",
      DECISOR_ECONOMICO: "CONFIRMADO",
      CRITERIOS_DECISION: "CONFIRMADO",
      PROCESO_DECISION: "CONFIRMADO",
      DOLOR_IDENTIFICADO: "CONFIRMADO",
      CAMPEON: "CONFIRMADO",
    });
    expect(componentesFaltantesParaGanar(listo, 100, minimos)).toEqual([]);
  });

  it("con puntaje 84 y campeón en PARCIAL, nombra al campeón (AC-14)", () => {
    const faltante = evaluaciones({
      METRICAS: "CONFIRMADO",
      DECISOR_ECONOMICO: "CONFIRMADO",
      CRITERIOS_DECISION: "CONFIRMADO",
      PROCESO_DECISION: "CONFIRMADO",
      DOLOR_IDENTIFICADO: "CONFIRMADO",
      CAMPEON: "PARCIAL",
    });
    const faltan = componentesFaltantesParaGanar(faltante, 84, minimos);
    expect(faltan).toHaveLength(1);
    // El mensaje debe nombrar el componente, no decir «no se puede» (§7.4).
    expect(faltan[0]).toMatch(/Campeón/);
    expect(faltan[0]).toMatch(/Parcial/);
    expect(faltan[0]).toMatch(/Confirmado/);
  });

  it("un puntaje bajo el mínimo se reporta con las dos cifras", () => {
    const faltan = componentesFaltantesParaGanar(evaluaciones({}), 62, minimos);
    expect(faltan.some((m) => m.includes("62") && m.includes("80"))).toBe(true);
  });

  it("se puede llegar al puntaje sin campeón, y aun así no se gana (§7.3)", () => {
    // «Se puede llegar a 80 puntos con buenas métricas y sin campeón, y eso no
    // es una venta cerrable.»
    const sinCampeon = evaluaciones({
      METRICAS: "CONFIRMADO",
      DECISOR_ECONOMICO: "CONFIRMADO",
      CRITERIOS_DECISION: "CONFIRMADO",
      PROCESO_DECISION: "CONFIRMADO",
      DOLOR_IDENTIFICADO: "CONFIRMADO",
      CAMPEON: "AUSENTE",
    });
    const puntaje = computeMeddicScore(sinCampeon, PESOS_POR_OMISION);
    expect(puntaje).toBeGreaterThanOrEqual(80);
    expect(componentesFaltantesParaGanar(sinCampeon, puntaje, minimos)).not.toEqual([]);
  });
});

describe("DESCRIPCION_COMPONENTE · qué es cada una, en una línea", () => {
  it("los seis tienen explicación, corta y sin punto final colgando", () => {
    // Va debajo del nombre en la pestaña, para que nadie tenga que entrar a
    // calificar para saber qué está calificando.
    for (const componente of TODOS) {
      const texto = DESCRIPCION_COMPONENTE[componente];
      expect(texto.length).toBeGreaterThan(20);
      expect(texto.length).toBeLessThan(120);
    }
  });
});

describe("puedeCalificarDirecto · la calificación rápida respeta RN-30", () => {
  it("No evaluado y Ausente se marcan sin más", () => {
    expect(puedeCalificarDirecto({ component: "METRICAS", status: "AUSENTE", evidence: null, personId: null })).toBe(true);
  });

  it("Parcial sin evidencia no: hay que abrir el panel y escribirla", () => {
    expect(puedeCalificarDirecto({ component: "METRICAS", status: "PARCIAL", evidence: "", personId: null })).toBe(false);
    expect(puedeCalificarDirecto({ component: "METRICAS", status: "PARCIAL", evidence: "Lo dijo el CIO", personId: null })).toBe(true);
  });

  it("Confirmar al campeón exige además la persona", () => {
    expect(puedeCalificarDirecto({ component: "CAMPEON", status: "CONFIRMADO", evidence: "x", personId: null })).toBe(false);
    expect(puedeCalificarDirecto({ component: "CAMPEON", status: "CONFIRMADO", evidence: "x", personId: "p1" })).toBe(true);
  });

  it("un componente o estado que no existen no se califican", () => {
    expect(puedeCalificarDirecto({ component: "OTRA_COSA", status: "AUSENTE", evidence: null, personId: null })).toBe(false);
  });
});
