import Decimal from "decimal.js";

/**
 * El margen arriba del 100 % en la hoja de objetivos · decisiones §54.
 *
 * La utilidad no puede ser mayor que la venta del mismo trimestre: sería pedir
 * margen por encima de lo que se vende. El servidor ya lo rechaza, pero se
 * entera al guardar, nombra el primer trimestre que encuentra y no dice de
 * quién. Esta es la misma regla evaluada sobre lo que hay en pantalla, para
 * decir **a quién y en qué trimestres** antes de intentar guardar, y para que
 * el aviso se vaya solo en cuanto se corrige.
 *
 * ## Por qué hace falta la otra métrica
 *
 * La hoja captura una métrica a la vez, pero la regla compara las dos. El
 * servidor combina lo que llega con lo **guardado** de la otra; aquí se hace
 * igual, con `contraparte`. Por eso la regla es simétrica: bajar la venta por
 * debajo de la utilidad guardada deja el mismo margen imposible que subir la
 * utilidad por encima de la venta.
 *
 * ## Venta en cero no es conflicto
 *
 * Misma excepción que el servidor: permite capturar la utilidad antes que la
 * venta sin que la hoja se queje de algo a medio llenar.
 */

const CERO = new Decimal(0);

/** Lo tecleado, como importe. Vacío o ilegible es cero. Sin `number` (INV-03). */
export function leerCuota(texto: string): Decimal {
  const limpio = texto.trim().replace(/,/g, "");
  if (limpio === "") return CERO;
  try {
    const d = new Decimal(limpio);
    return d.isFinite() ? d : CERO;
  } catch {
    return CERO;
  }
}

export type FilaParaMargen = {
  userId: string;
  nombre: string;
  /** Lo que hay en pantalla, en la métrica que se está capturando. */
  cuotas: readonly string[];
  /** Lo guardado en la otra métrica, trimestre a trimestre. */
  contraparte: readonly string[];
};

/** Un vendedor con el problema, y en qué trimestres (1 a 4). */
export type ConflictoDeMargen = { userId: string; nombre: string; trimestres: number[] };

export function conflictosDeMargen(
  filas: readonly FilaParaMargen[],
  metrica: "VENTA" | "UTILIDAD",
): ConflictoDeMargen[] {
  const conflictos: ConflictoDeMargen[] = [];

  for (const f of filas) {
    const trimestres: number[] = [];
    for (let q = 1; q <= 4; q++) {
      const propia = leerCuota(f.cuotas[q - 1] ?? "");
      const otra = leerCuota(f.contraparte[q - 1] ?? "");
      const venta = metrica === "VENTA" ? propia : otra;
      const utilidad = metrica === "UTILIDAD" ? propia : otra;
      if (!venta.isZero() && utilidad.gt(venta)) trimestres.push(q);
    }
    if (trimestres.length > 0) {
      conflictos.push({ userId: f.userId, nombre: f.nombre, trimestres });
    }
  }

  return conflictos;
}
