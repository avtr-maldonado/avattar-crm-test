import { etiquetaDe, type EtiquetaDeEstado } from "./etiquetas";

/**
 * Leer una ficha guardada · decisiones §64. Puro.
 *
 * Desde §64 una ficha es un diagnóstico y cuatro cuadrantes (fortalezas,
 * riesgos, siguientes pasos, recomendaciones). Las guardadas antes tienen la
 * forma de §61 (resumen, riesgos, acciones, huecos) y no se reescriben: se
 * traducen al leer. El resumen es el diagnóstico; acciones y huecos son
 * recomendaciones, las segundas sin cita.
 */
export type PuntoDeFicha = { descripcion: string; cita: string | null };

export type FichaLeida = {
  etiqueta: EtiquetaDeEstado;
  diagnostico: string;
  fortalezas: PuntoDeFicha[];
  riesgos: PuntoDeFicha[];
  siguientesPasos: PuntoDeFicha[];
  recomendaciones: PuntoDeFicha[];
};

function puntos(lista: unknown): PuntoDeFicha[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { descripcion, fuente } = x as { descripcion?: unknown; fuente?: { cita?: unknown } | null };
    if (typeof descripcion !== "string") return [];
    return [{ descripcion, cita: typeof fuente?.cita === "string" ? fuente.cita : null }];
  });
}

export function leerFicha(payload: unknown): FichaLeida | null {
  const etiqueta = etiquetaDe(payload);
  if (!etiqueta) return null;
  const p = payload as Record<string, unknown> & { estado: { diagnostico?: unknown; resumen?: unknown } };
  const diagnostico =
    typeof p.estado.diagnostico === "string" ? p.estado.diagnostico : typeof p.estado.resumen === "string" ? p.estado.resumen : "";
  return {
    etiqueta,
    diagnostico,
    fortalezas: puntos(p.fortalezas),
    riesgos: puntos(p.riesgos),
    siguientesPasos: puntos(p.siguientes_pasos),
    recomendaciones: [...puntos(p.recomendaciones), ...puntos(p.acciones), ...puntos(p.huecos)],
  };
}
