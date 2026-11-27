import type { LeadStage } from "@prisma/client";

/**
 * La rúbrica de calificación de prospectos · decisiones §71. Reglas puras.
 *
 * El puntaje deja de ser un número que alguien teclea: sale de un checklist de criterios con peso,
 * definidos en Configuración (INV-05: ningún peso en el código). Los activos suman exactamente 100,
 * así que el puntaje vive en 0–100 sin escalar nada. Solo informa: no abre ni cierra etapas.
 */
type Problema = { campo: string; mensaje: string };

export type CriterioDeRubrica = { name: string; weight: number; active: boolean };

/** Las etapas en las que se califica: es el trabajo de Marketing antes de dar por calificado. */
const ETAPAS_DE_CALIFICACION: readonly LeadStage[] = ["EN_VALIDACION", "CONTACTADO"];

export function sePuedeCalificar(etapa: LeadStage): boolean {
  return ETAPAS_DE_CALIFICACION.includes(etapa);
}

function normalizar(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Todos los problemas de la hoja de una vez, para que se corrijan juntos. */
export function validarRubrica(criterios: readonly CriterioDeRubrica[]): Problema[] {
  const problemas: Problema[] = [];
  const vistos = new Set<string>();
  for (const c of criterios) {
    const nombre = normalizar(c.name);
    if (nombre.length === 0) {
      problemas.push({ campo: "name", mensaje: "Cada criterio necesita un nombre." });
      continue;
    }
    if (vistos.has(nombre)) problemas.push({ campo: "name", mensaje: `El criterio «${nombre}» está repetido.` });
    vistos.add(nombre);
    if (c.active && (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 100)) {
      problemas.push({ campo: "weight", mensaje: `El peso de «${c.name.trim()}» debe ser un entero entre 1 y 100.` });
    }
  }

  const activos = criterios.filter((c) => c.active);
  if (activos.length === 0) {
    problemas.push({ campo: "weight", mensaje: "La rúbrica necesita al menos un criterio activo." });
    return problemas;
  }
  const suma = activos.reduce((n, c) => n + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  if (suma < 100) problemas.push({ campo: "weight", mensaje: `Los criterios activos suman ${suma}: faltan ${100 - suma} para 100.` });
  if (suma > 100) problemas.push({ campo: "weight", mensaje: `Los criterios activos suman ${suma}: sobran ${suma - 100}.` });
  return problemas;
}

/** El puntaje: la suma de los pesos de lo que se marcó. Sin nada marcado es 0, no nulo. */
export function puntajeDe(items: readonly { weight: number; met: boolean }[]): number {
  return items.reduce((n, i) => (i.met ? n + i.weight : n), 0);
}
