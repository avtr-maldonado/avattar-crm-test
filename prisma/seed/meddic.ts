import type { MeddicComponent, MeddicStatus } from "@prisma/client";
import { computeMeddicScore } from "@/lib/domain/meddic";
import { PESOS_MEDDIC } from "./datos";

/**
 * Deriva las evaluaciones MEDDIC de un puntaje objetivo.
 *
 * ## Por qué esto existe
 *
 * §6.3 dice que `meddicScore` es un valor **desnormalizado**: se recalcula en
 * la misma transacción en que cambia un componente, y nunca se edita a mano.
 * Sembrar el número sin las seis filas que lo producen rompe esa regla en doce
 * de las catorce oportunidades, y la pestaña MEDDIC mostraría componentes
 * vacíos junto a un puntaje que salió de la nada.
 *
 * ## El descubrimiento que forzó esto
 *
 * Con la fórmula de §7.2 y los pesos de Q-08 —cinco componentes a 17 y el dolor
 * a 15— el puntaje no es continuo. Solo **33 valores son alcanzables**:
 *
 *   0 · 8 · 9 · 15 · 16 · 17 · 24 · 25 · 26 · 32 · 33 · 34 · 41 · 42 · 43 ·
 *   49 · 50 · 51 · 58 · 59 · 60 · 66 · 67 · 68 · 75 · 76 · 77 · 83 · 84 · 85 ·
 *   92 · 93 · 100
 *
 * §15 declara 62 para OPP-2026-00388, y **62 no está en esa lista**: los
 * vecinos son 60 y 66. El 84 de OPP-2026-00417 sí es alcanzable.
 *
 * Este módulo toma el puntaje que §15 pide, encuentra la combinación alcanzable
 * más cercana, y distribuye los puntos entre los componentes en el orden en que
 * una venta consultiva los trabaja de verdad.
 */

/** Los cinco de peso 17, en el orden en que se suelen cerrar. */
const ORDEN_TRABAJO: MeddicComponent[] = [
  "METRICAS",
  "CRITERIOS_DECISION",
  "PROCESO_DECISION",
  "DECISOR_ECONOMICO",
  "CAMPEON",
];

const PUNTOS_A_ESTADO: Record<number, MeddicStatus> = {
  0: "NO_EVALUADO",
  1: "PARCIAL",
  2: "CONFIRMADO",
};

export type EvaluacionDerivada = {
  component: MeddicComponent;
  status: MeddicStatus;
  evidence: string | null;
};

export type ResultadoDerivacion = {
  evaluaciones: EvaluacionDerivada[];
  /** El puntaje que realmente produce la fórmula. Puede diferir del objetivo. */
  puntaje: number;
  /** Cuánto se movió respecto al objetivo, por el escalón de la fórmula. */
  desviacion: number;
};

/**
 * Encuentra la combinación (puntos de los cinco, puntos del dolor) cuyo puntaje
 * queda más cerca del objetivo. Ante empate, prefiere el que se queda por
 * debajo: un puntaje inflado hace pasar compuertas que no deberían pasar.
 */
function combinacionMasCercana(objetivo: number): { suma: number; dolor: number; puntaje: number } {
  let mejor = { suma: 0, dolor: 0, puntaje: 0 };
  let mejorDistancia = Number.POSITIVE_INFINITY;

  for (let suma = 0; suma <= 10; suma++) {
    for (let dolor = 0; dolor <= 2; dolor++) {
      const puntaje = Math.round((17 * suma + 15 * dolor) / 2);
      const distancia = Math.abs(puntaje - objetivo);
      const empataYEsMenor = distancia === mejorDistancia && puntaje < mejor.puntaje;
      if (distancia < mejorDistancia || empataYEsMenor) {
        mejorDistancia = distancia;
        mejor = { suma, dolor, puntaje };
      }
    }
  }
  return mejor;
}

/** Reparte `puntos` entre los cinco componentes, llenando por orden de trabajo. */
function repartir(puntos: number): Map<MeddicComponent, number> {
  const reparto = new Map<MeddicComponent, number>(ORDEN_TRABAJO.map((c) => [c, 0]));
  let restantes = puntos;

  // Primera pasada: dejar todos en PARCIAL antes de confirmar ninguno. Refleja
  // cómo avanza una venta: se toca todo y luego se cierra, no al revés.
  for (const componente of ORDEN_TRABAJO) {
    if (restantes === 0) break;
    reparto.set(componente, 1);
    restantes -= 1;
  }
  for (const componente of ORDEN_TRABAJO) {
    if (restantes === 0) break;
    reparto.set(componente, 2);
    restantes -= 1;
  }
  return reparto;
}

const EVIDENCIA_POR_ESTADO: Record<MeddicComponent, { parcial: string; confirmado: string }> = {
  METRICAS: {
    parcial: "Hay una estimación de impacto, todavía sin validar con el cliente.",
    confirmado: "Impacto cuantificado y reconocido por el cliente como propio.",
  },
  DECISOR_ECONOMICO: {
    parcial: "Identificado quién firma el presupuesto; falta contactarlo directamente.",
    confirmado: "Identificado y contactado quien firma el presupuesto.",
  },
  CRITERIOS_DECISION: {
    parcial: "Se conocen los criterios técnicos; faltan los comerciales y de servicio.",
    confirmado: "Criterios técnicos, comerciales y de servicio conocidos y documentados.",
  },
  PROCESO_DECISION: {
    parcial: "Se conocen los pasos; faltan las fechas de comité y aprobación.",
    confirmado: "Proceso mapeado: pasos, aprobaciones y fechas.",
  },
  DOLOR_IDENTIFICADO: {
    parcial: "El dolor está planteado; falta que el cliente lo reconozca por escrito.",
    confirmado: "Dolor identificado y aceptado por el cliente, no supuesto por nosotros.",
  },
  CAMPEON: {
    parcial: "Hay un candidato a campeón; falta confirmar que empuje internamente.",
    confirmado: "Campeón interno identificado y activo.",
  },
};

/**
 * Deriva las seis evaluaciones para un puntaje objetivo.
 *
 * Los componentes anclados a persona (`DECISOR_ECONOMICO` y `CAMPEON`) nunca
 * quedan en `CONFIRMADO` aquí: RN-30 exige una `Person` ligada, y estas
 * oportunidades no tienen comité capturado. Se topan en `PARCIAL`, que es lo
 * honesto, y el reparto compensa en los demás.
 */
export function derivarMeddic(
  objetivo: number,
  opciones: { permiteConfirmarPersonas?: boolean } = {},
): ResultadoDerivacion {
  const { suma, dolor } = combinacionMasCercana(objetivo);
  const reparto = repartir(suma);

  if (!opciones.permiteConfirmarPersonas) {
    // Bajar a PARCIAL lo que no puede confirmarse, y devolver esos puntos a
    // los componentes de texto, para no falsear el puntaje hacia abajo.
    let sobrantes = 0;
    for (const componente of ["DECISOR_ECONOMICO", "CAMPEON"] as MeddicComponent[]) {
      if (reparto.get(componente) === 2) {
        reparto.set(componente, 1);
        sobrantes += 1;
      }
    }
    for (const componente of ["METRICAS", "CRITERIOS_DECISION", "PROCESO_DECISION"] as MeddicComponent[]) {
      if (sobrantes === 0) break;
      if (reparto.get(componente)! < 2) {
        reparto.set(componente, reparto.get(componente)! + 1);
        sobrantes -= 1;
      }
    }
  }

  const evaluaciones: EvaluacionDerivada[] = [
    ...ORDEN_TRABAJO.map((component) => {
      const puntos = reparto.get(component)!;
      return {
        component,
        status: PUNTOS_A_ESTADO[puntos],
        evidence:
          puntos === 0
            ? null
            : puntos === 1
              ? EVIDENCIA_POR_ESTADO[component].parcial
              : EVIDENCIA_POR_ESTADO[component].confirmado,
      };
    }),
    {
      component: "DOLOR_IDENTIFICADO" as MeddicComponent,
      status: PUNTOS_A_ESTADO[dolor],
      evidence:
        dolor === 0
          ? null
          : dolor === 1
            ? EVIDENCIA_POR_ESTADO.DOLOR_IDENTIFICADO.parcial
            : EVIDENCIA_POR_ESTADO.DOLOR_IDENTIFICADO.confirmado,
    },
  ];

  const puntaje = computeMeddicScore(evaluaciones, PESOS_MEDDIC);
  return { evaluaciones, puntaje, desviacion: puntaje - objetivo };
}
