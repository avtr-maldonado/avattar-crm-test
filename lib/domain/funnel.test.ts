import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { buildFunnel, type HistoriaDeEtapas } from "./funnel";

/**
 * El embudo de P-01 · conversión etapa a etapa.
 *
 * Dos números por etapa, y son distintos entre sí a propósito:
 *
 *   - **El valor abierto** es un inventario: cuánto dinero está parado ahí
 *     ahora mismo. Es lo que mide la barra.
 *   - **La tasa de paso** es un flujo: de las que entraron a la etapa anterior
 *     durante la ventana, cuántas llegaron hasta esta o más lejos. Es lo que
 *     dice si el proceso mueve o atora.
 *
 * Mezclarlos —dividir el valor de una etapa entre el de la anterior— produce
 * porcentajes que suben del 100 % y no significan nada: una etapa puede tener
 * más dinero que la de antes simplemente porque ahí se juntaron los negocios
 * grandes.
 */
const ETAPAS = [
  { id: "e1", name: "Calificación", position: 1, isClosing: false },
  { id: "e2", name: "Descubrimiento", position: 2, isClosing: false },
  { id: "e3", name: "Propuesta", position: 3, isClosing: false },
  { id: "e4", name: "Cierre", position: 4, isClosing: true },
];

describe("buildFunnel · valor abierto por etapa", () => {
  it("suma el valor y cuenta las oportunidades de cada etapa", () => {
    const embudo = buildFunnel(
      ETAPAS,
      [
        { stage: { id: "e1" }, amount: money("100") },
        { stage: { id: "e1" }, amount: money("200") },
        { stage: { id: "e3" }, amount: money("500") },
      ],
      [],
    );

    expect(embudo[0]!.valor.toString()).toBe("300");
    expect(embudo[0]!.cuantas).toBe(2);
    expect(embudo[2]!.valor.toString()).toBe("500");
  });

  it("una etapa vacía sigue apareciendo, en cero", () => {
    // Una columna que desaparece rompe el mapa mental del proceso: es la misma
    // regla que en el kanban.
    const embudo = buildFunnel(ETAPAS, [], []);
    expect(embudo).toHaveLength(4);
    expect(embudo[1]!.valor.toString()).toBe("0");
    expect(embudo[1]!.cuantas).toBe(0);
  });

  it("la fracción de la barra se mide contra la etapa mayor, no contra el total", () => {
    // Contra el total, cinco etapas parejas darían cinco barras al 20 % y la
    // pantalla no diría nada. Contra la mayor, la más grande llena y las demás
    // se leen en proporción a ella.
    const embudo = buildFunnel(
      ETAPAS,
      [
        { stage: { id: "e1" }, amount: money("250") },
        { stage: { id: "e2" }, amount: money("1000") },
      ],
      [],
    );

    expect(embudo[1]!.fraccionDeBarra).toBe(1);
    expect(embudo[0]!.fraccionDeBarra).toBe(0.25);
    expect(embudo[2]!.fraccionDeBarra).toBe(0);
  });

  it("marca la etapa de cierre con el dato del pipeline, no por su nombre (INV-13)", () => {
    const embudo = buildFunnel(ETAPAS, [], []);
    expect(embudo[3]!.esCierre).toBe(true);
    expect(embudo[0]!.esCierre).toBe(false);
  });
});

describe("buildFunnel · tasa de paso", () => {
  /** Entró a la etapa 1 y llegó hasta la 3, pasando por la 2. */
  const avanzo: HistoriaDeEtapas = {
    opportunityId: "o1",
    entroEnPosiciones: [1, 2, 3],
    posicionMaxima: 3,
  };
  /** Entró a la etapa 1 y ahí se quedó. */
  const seQuedo: HistoriaDeEtapas = {
    opportunityId: "o2",
    entroEnPosiciones: [1],
    posicionMaxima: 1,
  };

  it("la primera etapa no tiene tasa: nada la precede", () => {
    const embudo = buildFunnel(ETAPAS, [], [avanzo, seQuedo]);
    expect(embudo[0]!.tasaDePaso).toBeNull();
  });

  it("de dos que entraron a Calificación, una llegó a Descubrimiento: 50 %", () => {
    const embudo = buildFunnel(ETAPAS, [], [avanzo, seQuedo]);
    expect(embudo[1]!.tasaDePaso).toBe(0.5);
    expect(embudo[1]!.base).toBe(2);
  });

  it("saltarse una etapa cuenta como haberla pasado", () => {
    // De Descubrimiento directo a Cierre, sin escala en Propuesta. Exigir que
    // se hubiera detenido ahí castigaría a la que avanzó rápido y haría que la
    // tasa de Propuesta bajara precisamente cuando el negocio va bien.
    const salto: HistoriaDeEtapas = {
      opportunityId: "o3",
      entroEnPosiciones: [2],
      posicionMaxima: 4,
    };
    const embudo = buildFunnel(ETAPAS, [], [salto]);

    expect(embudo[2]!.base).toBe(1);
    expect(embudo[2]!.tasaDePaso).toBe(1);
  });

  it("sin nadie que haya entrado a la etapa anterior, la tasa es nula, no cero", () => {
    // Cero diría «ninguna pasó», que es una afirmación sobre el equipo. Nulo
    // dice «no hay con qué medirlo», que es la verdad.
    const embudo = buildFunnel(ETAPAS, [], []);
    expect(embudo[1]!.tasaDePaso).toBeNull();
    expect(embudo[1]!.base).toBe(0);
  });

  it("cada etapa mide contra la suya, no contra la primera", () => {
    const historias: HistoriaDeEtapas[] = [
      { opportunityId: "a", entroEnPosiciones: [1, 2], posicionMaxima: 2 },
      { opportunityId: "b", entroEnPosiciones: [1, 2], posicionMaxima: 4 },
      { opportunityId: "c", entroEnPosiciones: [1], posicionMaxima: 1 },
    ];
    const embudo = buildFunnel(ETAPAS, [], historias);

    // De 3 que entraron a Calificación, 2 llegaron a Descubrimiento.
    expect(embudo[1]!.base).toBe(3);
    expect(embudo[1]!.tasaDePaso).toBeCloseTo(2 / 3, 10);
    // De 2 que entraron a Descubrimiento, 1 llegó a Propuesta.
    expect(embudo[2]!.base).toBe(2);
    expect(embudo[2]!.tasaDePaso).toBe(0.5);
  });
});
