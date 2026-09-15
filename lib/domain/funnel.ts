import { Prisma } from "@prisma/client";
import type { Money } from "@/lib/money";

/**
 * El embudo de P-01.
 *
 * Responde dos preguntas que se parecen y no son la misma:
 *
 *   - **¿Dónde está parado el dinero?** El valor abierto de cada etapa. Es un
 *     inventario, y es lo que mide la barra.
 *   - **¿El proceso mueve o atora?** La tasa de paso: de las oportunidades que
 *     entraron a la etapa anterior durante la ventana, cuántas llegaron a esta
 *     o más lejos. Es un flujo, y por eso se lee de `StageTransition`, no del
 *     estado de hoy.
 *
 * Confundirlas es el error clásico del embudo: dividir el valor de una etapa
 * entre el de la anterior da porcentajes por encima del 100 % que no significan
 * nada, porque una etapa puede tener más dinero que la previa solo porque ahí
 * se juntaron los negocios grandes.
 *
 * Función pura. Las etapas llegan como datos (INV-13): la de cierre se conoce
 * por `isClosing`, nunca por su nombre.
 */
const CERO = new Prisma.Decimal(0);

/**
 * Por dónde pasó una oportunidad, ya resumido por el lector.
 *
 * `entroEnPosiciones` son las etapas a las que entró **dentro de la ventana**;
 * `posicionMaxima` es lo más lejos que llegó alguna vez. La ventana acota quién
 * cuenta en la base; el máximo histórico decide si pasó, porque una oportunidad
 * que entró a Calificación en la ventana y avanzó a Propuesta la semana
 * siguiente sí pasó, aunque ese avance caiga fuera.
 */
export type HistoriaDeEtapas = {
  opportunityId: string;
  entroEnPosiciones: number[];
  posicionMaxima: number;
};

export type EtapaDelEmbudo = {
  stageId: string;
  nombre: string;
  esCierre: boolean;
  valor: Money;
  cuantas: number;
  /** 0 a 1 contra la etapa de mayor valor. Es el largo de la barra. */
  fraccionDeBarra: number;
  /**
   * Fracción de las que entraron a la etapa anterior y llegaron aquí o más
   * lejos. **Nula** en la primera etapa —nada la precede— y cuando nadie entró
   * a la anterior en la ventana: cero diría «ninguna pasó», que es una
   * afirmación sobre el equipo; nulo dice «no hay con qué medirlo».
   */
  tasaDePaso: number | null;
  /** Cuántas entraron a la etapa anterior. El denominador, a la vista. */
  base: number;
  /** Nombre de la etapa anterior, para poder escribir «avanza de Propuesta». */
  vieneDe: string | null;
};

export function buildFunnel(
  etapas: readonly { id: string; name: string; position: number; isClosing: boolean }[],
  oportunidades: readonly { stage: { id: string }; amount: Money }[],
  historias: readonly HistoriaDeEtapas[],
): EtapaDelEmbudo[] {
  const ordenadas = [...etapas].sort((a, b) => a.position - b.position);

  // Un solo recorrido por oportunidad. Filtrar dentro del bucle de etapas
  // recorrería la lista completa una vez por etapa.
  const porEtapa = new Map<string, { valor: Money; cuantas: number }>();
  for (const o of oportunidades) {
    const acumulado = porEtapa.get(o.stage.id);
    if (acumulado) {
      acumulado.valor = acumulado.valor.plus(o.amount);
      acumulado.cuantas += 1;
    } else {
      porEtapa.set(o.stage.id, { valor: o.amount, cuantas: 1 });
    }
  }

  let mayor = CERO;
  for (const { valor } of porEtapa.values()) {
    if (valor.gt(mayor)) mayor = valor;
  }

  return ordenadas.map((etapa, i) => {
    const acumulado = porEtapa.get(etapa.id);
    const valor = acumulado?.valor ?? CERO;
    const anterior = i > 0 ? ordenadas[i - 1] : null;

    let base = 0;
    let pasaron = 0;
    if (anterior) {
      for (const h of historias) {
        if (!h.entroEnPosiciones.includes(anterior.position)) continue;
        base += 1;
        if (h.posicionMaxima >= etapa.position) pasaron += 1;
      }
    }

    return {
      stageId: etapa.id,
      nombre: etapa.name,
      esCierre: etapa.isClosing,
      valor,
      cuantas: acumulado?.cuantas ?? 0,
      fraccionDeBarra: mayor.isZero() ? 0 : valor.div(mayor).toNumber(),
      tasaDePaso: base === 0 ? null : pasaron / base,
      base,
      vieneDe: anterior?.name ?? null,
    };
  });
}
