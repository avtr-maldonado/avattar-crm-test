import type { Problema } from "@/lib/acciones";

/**
 * Las fuentes de una recomendación · decisiones §61.
 *
 * **El servidor valida, no el modelo.** Cada riesgo y cada acción citan una
 * actividad y un fragmento textual. Aquí se comprueba, con las actividades que
 * el lector trajo **dentro del alcance** de la sesión, que cada id citado
 * existe, es de la oportunidad en cuestión y de verdad contiene la cita. Puro:
 * recibe las actividades, no las busca.
 *
 * Los mensajes nombran el índice (`riesgos.2.fuente.activity_id`) y dicen qué
 * hacer, porque quien los lee es un agente que va a corregir y reintentar.
 */
export type ActividadCitable = {
  id: string;
  opportunityId: string | null;
  subject: string;
  notes: string | null;
  outcome: string | null;
  transcript: string | null;
};

type ConFuente = { descripcion?: string; fuente?: { activity_id: string; cita: string } | null };

/** §64 · las listas de una ficha cuyos puntos citan una actividad. */
export const LISTAS_CITABLES = ["fortalezas", "riesgos", "siguientes_pasos", "recomendaciones"] as const;
export type ListasCitables = { [K in (typeof LISTAS_CITABLES)[number]]: readonly ConFuente[] };

/** Los activity_id que cita una ficha, sin repetir. */
export function idsDeFuentes(ficha: ListasCitables): string[] {
  return [...new Set(LISTAS_CITABLES.flatMap((l) => ficha[l].flatMap((x) => (x.fuente ? [x.fuente.activity_id] : []))))];
}

export type ResultadoDeFuentes = { problemas: Problema[]; idsCitados: string[] };

/** Espacios colapsados y sin distinguir mayúsculas: la cita se copió, no se tecleó. */
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

export function citaAparece(cita: string, actividad: ActividadCitable): boolean {
  const pajar = normalizar([actividad.subject, actividad.notes, actividad.outcome, actividad.transcript].filter(Boolean).join("\n"));
  const aguja = normalizar(cita);
  return aguja.length > 0 && pajar.includes(aguja);
}

export function validarFuentes(
  opportunityId: string,
  recomendacion: ListasCitables,
  actividades: readonly ActividadCitable[],
  folios: Readonly<Record<string, string>>,
): ResultadoDeFuentes {
  const porId = new Map(actividades.map((a) => [a.id, a]));
  const folioDestino = folios[opportunityId] ?? opportunityId;
  const problemas: Problema[] = [];
  const idsCitados: string[] = [];

  const revisar = (lista: readonly ConFuente[], nombre: string) => {
    lista.forEach((item, i) => {
      if (!item.fuente) return;
      const { activity_id, cita } = item.fuente;
      const actividad = porId.get(activity_id);
      if (!actividad) {
        problemas.push({
          campo: `${nombre}.${i}.fuente.activity_id`,
          mensaje: `«${activity_id}» no existe o no está a tu alcance. Cita solo actividades que te devolvió listar_actividades de ${folioDestino}.`,
        });
        return;
      }
      if (actividad.opportunityId !== opportunityId) {
        const folioAjeno = (actividad.opportunityId && folios[actividad.opportunityId]) || "otra oportunidad";
        problemas.push({
          campo: `${nombre}.${i}.fuente.activity_id`,
          mensaje: `«${activity_id}» pertenece a ${folioAjeno}, no a ${folioDestino}. Cita solo actividades de listar_actividades de esta oportunidad.`,
        });
        return;
      }
      if (!citaAparece(cita, actividad)) {
        problemas.push({
          campo: `${nombre}.${i}.fuente.cita`,
          mensaje: `la cita no aparece en la actividad «${activity_id}» (asunto, notas, resultado ni transcripción). Copia el fragmento tal cual de obtener_nota.`,
        });
        return;
      }
      if (!idsCitados.includes(activity_id)) idsCitados.push(activity_id);
    });
  };

  for (const lista of LISTAS_CITABLES) revisar(recomendacion[lista], lista);
  return { problemas, idsCitados };
}
