import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { evaluateGate, type GateContext, type GateRequirement } from "./stageGate";

function contexto(p: Partial<GateContext> = {}): GateContext {
  return {
    tienePersonaConRol: false,
    tienePropuestaCargada: false,
    tieneContratoOrdenCompra: false,
    tieneCotizacion: false,
    cantidadHitos: 0,
    diferenciaHitos: null,
    meddicScore: 0,
    meddicDecisorConfirmado: false,
    autorizacionesPendientes: 0,
    meddicMinToClosing: 70,
    ...p,
  };
}

describe("evaluateGate · RN-02, INV-13", () => {
  it("una etapa sin requisitos siempre deja pasar", () => {
    // Calificación: gateRequires = [].
    expect(evaluateGate([], contexto())).toEqual({ ok: true, missing: [] });
  });

  it("nombra el requisito que falta, nunca un «no se puede» genérico (§7.4)", () => {
    const r = evaluateGate(["PERSONA_CON_ROL_DECLARADO"], contexto());
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].requirement).toBe("PERSONA_CON_ROL_DECLARADO");
    expect(r.missing[0].message.length).toBeGreaterThan(20);
  });

  it("acumula TODOS los faltantes, no se detiene en el primero", () => {
    // Si solo reportara el primero, el vendedor arreglaría uno, reintentaría,
    // y descubriría el siguiente. Hay que decirle todo de una vez.
    const cierre: GateRequirement[] = [
      "CONTRATO_O_OC_CARGADO",
      "HITOS_CUADRADOS",
      "MEDDIC_MIN_CIERRE",
      "SIN_AUTORIZACION_PENDIENTE",
    ];
    const r = evaluateGate(cierre, contexto({ autorizacionesPendientes: 1 }));
    expect(r.missing).toHaveLength(4);
  });

  it("HITOS_CUADRADOS dice cuánto falta, con la cifra (RN-06, AC-18)", () => {
    const r = evaluateGate(["HITOS_CUADRADOS"], contexto({ diferenciaHitos: money("200000") }));
    expect(r.ok).toBe(false);
    // «faltan $200,000 por asignar», no «los hitos no cuadran».
    expect(r.missing[0].message).toContain("$200,000.00");
  });

  it("HITOS_CUADRADOS pasa con diferencia exactamente cero", () => {
    expect(evaluateGate(["HITOS_CUADRADOS"], contexto({ diferenciaHitos: money("0") })).ok).toBe(true);
  });

  it("HITOS_CUADRADOS también avisa si sobra, no solo si falta", () => {
    const r = evaluateGate(["HITOS_CUADRADOS"], contexto({ diferenciaHitos: money("-50000") }));
    expect(r.ok).toBe(false);
    expect(r.missing[0].message).toMatch(/sobran|exceden/i);
  });

  it("MEDDIC_MIN_CIERRE compara contra el mínimo de la política (RN-27, INV-05)", () => {
    expect(evaluateGate(["MEDDIC_MIN_CIERRE"], contexto({ meddicScore: 62 })).ok).toBe(false);
    expect(evaluateGate(["MEDDIC_MIN_CIERRE"], contexto({ meddicScore: 70 })).ok).toBe(true);
    // El mínimo es dato, no constante: bajarlo cambia el veredicto.
    expect(
      evaluateGate(["MEDDIC_MIN_CIERRE"], contexto({ meddicScore: 62, meddicMinToClosing: 60 })).ok,
    ).toBe(true);
  });

  it("SIN_AUTORIZACION_PENDIENTE bloquea el avance a cierre (RN-22, AC-09)", () => {
    const r = evaluateGate(["SIN_AUTORIZACION_PENDIENTE"], contexto({ autorizacionesPendientes: 1 }));
    expect(r.ok).toBe(false);
    expect(r.missing[0].message).toMatch(/autorizaci/i);
  });

  it("el requisito de comité se resuelve vía MEDDIC, no aparte (§2.1)", () => {
    // «El decisor económico y el campeón DEBEN resolverse a través de los
    // componentes MEDDIC E y C, no como una validación paralela.»
    expect(evaluateGate(["MEDDIC_E_CONFIRMADO"], contexto({ meddicDecisorConfirmado: false })).ok)
      .toBe(false);
    expect(evaluateGate(["MEDDIC_E_CONFIRMADO"], contexto({ meddicDecisorConfirmado: true })).ok)
      .toBe(true);
  });

  it("evalúa la secuencia completa de §8.3 para Ventas México", () => {
    const listaParaCierre = contexto({
      tienePersonaConRol: true,
      tienePropuestaCargada: true,
      tieneContratoOrdenCompra: true,
      tieneCotizacion: true,
      cantidadHitos: 3,
      diferenciaHitos: money("0"),
      meddicScore: 84,
      meddicDecisorConfirmado: true,
      autorizacionesPendientes: 0,
    });

    const etapas: Record<string, GateRequirement[]> = {
      Calificacion: [],
      Descubrimiento: ["PERSONA_CON_ROL_DECLARADO"],
      Propuesta: ["PROPUESTA_CARGADA", "MEDDIC_E_CONFIRMADO"],
      Negociacion: ["COTIZACION_CONGELADA", "HITOS_CAPTURADOS"],
      Cierre: [
        "CONTRATO_O_OC_CARGADO",
        "HITOS_CUADRADOS",
        "MEDDIC_MIN_CIERRE",
        "SIN_AUTORIZACION_PENDIENTE",
      ],
    };

    for (const [etapa, requisitos] of Object.entries(etapas)) {
      expect(evaluateGate(requisitos, listaParaCierre).ok, `falló en ${etapa}`).toBe(true);
    }
  });

  it("no decide nada por el NOMBRE de la etapa (INV-13)", () => {
    // El evaluador recibe requisitos, no etapas. Agregar una etapa nueva o
    // renombrar una existente no toca este código.
    expect(evaluateGate.length).toBe(2);
  });
});
