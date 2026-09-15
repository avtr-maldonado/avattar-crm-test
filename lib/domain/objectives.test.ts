import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { computeCumulativeTrack, computePeriodProgress } from "./objectives";

/**
 * El avance acumulado de objetivos · §10.2 más la regla acumulativa.
 *
 * La regla que estas pruebas fijan **no estaba en el spec**: §10.2 medía cada
 * periodo por separado. El negocio la pidió el 14 de septiembre de 2026 así:
 *
 *   «Si se establece un objetivo de 100 por trimestre y en el T1 no se vendió,
 *   pero en el T2 se vendió 200, eso cuenta para los 100 del T1 y los 100 del
 *   T2.»
 *
 * O sea: lo que se compara no es trimestre contra trimestre, sino **acumulado
 * contra acumulado**. Un trimestre flojo no se perdona, se arrastra; uno bueno
 * lo paga. Queda anotada en `decisiones-pendientes.md` §17.
 */
const CUOTA_PAREJA = [money("100"), money("100"), money("100"), money("100")];

describe("computeCumulativeTrack · la regla acumulativa", () => {
  it("un trimestre bueno paga la deuda del anterior", () => {
    // El ejemplo textual del negocio: 0 en el T1, 200 en el T2.
    const pista = computeCumulativeTrack(CUOTA_PAREJA, [
      money("0"),
      money("200"),
      money("0"),
      money("0"),
    ]);

    // Al cerrar el T2 se debían 200 y se llevan 200: se va a la par.
    expect(pista[1]!.cuota.toString()).toBe("200");
    expect(pista[1]!.logrado.toString()).toBe("200");
    expect(pista[1]!.cumplimiento).toBe(1);
    expect(pista[1]!.faltante.toString()).toBe("0");
  });

  it("el trimestre solo no cuenta la historia: el T1 queda en cero y el T2 en 200", () => {
    const pista = computeCumulativeTrack(CUOTA_PAREJA, [
      money("0"),
      money("200"),
      money("0"),
      money("0"),
    ]);

    expect(pista[0]!.logradoDelTrimestre.toString()).toBe("0");
    expect(pista[1]!.logradoDelTrimestre.toString()).toBe("200");
  });

  it("el arrastre dice con cuánta deuda se entra al trimestre", () => {
    const pista = computeCumulativeTrack(CUOTA_PAREJA, [
      money("0"),
      money("200"),
      money("0"),
      money("0"),
    ]);

    // Al T1 no se arrastra nada: es el principio del año.
    expect(pista[0]!.arrastre.toString()).toBe("0");
    // Al T2 se entra debiendo los 100 del T1.
    expect(pista[1]!.arrastre.toString()).toBe("-100");
    // Al T3 se entra a la par, porque el T2 pagó.
    expect(pista[2]!.arrastre.toString()).toBe("0");
  });

  it("un trimestre por encima de la cuota entra al siguiente con adelanto", () => {
    const pista = computeCumulativeTrack(CUOTA_PAREJA, [
      money("150"),
      money("0"),
      money("0"),
      money("0"),
    ]);

    expect(pista[1]!.arrastre.toString()).toBe("50");
    // Y el acumulado del T2 sigue debiendo: 150 contra 200.
    expect(pista[1]!.faltante.toString()).toBe("50");
  });

  it("el faltante nunca es negativo: sobrecumplir no es deber menos que nada", () => {
    const pista = computeCumulativeTrack(CUOTA_PAREJA, [
      money("500"),
      money("0"),
      money("0"),
      money("0"),
    ]);

    expect(pista[0]!.faltante.toString()).toBe("0");
    expect(pista[0]!.excedente.toString()).toBe("400");
  });

  it("sin cuota acumulada el cumplimiento es nulo, no cero ni infinito", () => {
    // Un vendedor nuevo sin cuota fijada. «Cumplió 0 %» sería una acusación
    // falsa; dividir entre cero, un NaN en pantalla.
    const pista = computeCumulativeTrack(
      [money("0"), money("0"), money("0"), money("0")],
      [money("50"), money("0"), money("0"), money("0")],
    );

    expect(pista[0]!.cumplimiento).toBeNull();
    expect(pista[0]!.logrado.toString()).toBe("50");
  });

  it("no pierde centavos: se opera con Decimal, no con number (INV-03)", () => {
    const pista = computeCumulativeTrack(
      [money("0.10"), money("0.20"), money("0"), money("0")],
      [money("0.30"), money("0"), money("0"), money("0")],
    );

    expect(pista[1]!.cuota.toString()).toBe("0.3");
    expect(pista[1]!.logrado.toString()).toBe("0.3");
    expect(pista[1]!.faltante.toString()).toBe("0");
  });

  it("devuelve un renglón por trimestre, aunque todos vengan en cero", () => {
    const pista = computeCumulativeTrack(
      [money("0"), money("0"), money("0"), money("0")],
      [money("0"), money("0"), money("0"), money("0")],
    );
    expect(pista).toHaveLength(4);
    expect(pista.map((p) => p.quarter)).toEqual([1, 2, 3, 4]);
  });
});

describe("computePeriodProgress · el periodo suelto, para el año", () => {
  it("cumplimiento, faltante y excedente de un solo periodo", () => {
    const a = computePeriodProgress(money("1000"), money("750"));
    expect(a.cumplimiento).toBe(0.75);
    expect(a.faltante.toString()).toBe("250");
    expect(a.excedente.toString()).toBe("0");
  });

  it("sobre la cuota: faltante en cero y excedente con la diferencia", () => {
    const a = computePeriodProgress(money("1000"), money("1200"));
    expect(a.cumplimiento).toBe(1.2);
    expect(a.faltante.toString()).toBe("0");
    expect(a.excedente.toString()).toBe("200");
  });

  it("cuota en cero: cumplimiento nulo", () => {
    expect(computePeriodProgress(money("0"), money("10")).cumplimiento).toBeNull();
  });
});
