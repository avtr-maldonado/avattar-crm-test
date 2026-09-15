import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { HistoriaDeEtapas } from "@/lib/domain/funnel";
import { withScope } from "./opportunities";

/**
 * Por dónde pasó cada oportunidad · insumo de la tasa de paso del embudo.
 *
 * ## La entrada a la primera etapa no está en `StageTransition`
 *
 * El historial registra los **movimientos**, y el alta no lo es: una
 * oportunidad nace en una etapa sin que nadie la mueva ahí. Si la tasa se
 * calculara solo con transiciones, el denominador de la segunda etapa sería
 * cero y el embudo diría «no hay con qué medirlo» aunque el equipo lleve medio
 * año trabajando.
 *
 * La entrada inicial se reconstruye: es la etapa `fromStage` de la primera
 * transición —de ahí venía— o, si nunca se movió, la etapa donde sigue. La
 * fecha es la de creación. No se inventa nada: los dos datos están guardados.
 *
 * ## Ventana y máximo
 *
 * `entroEnPosiciones` se recorta a la ventana, porque es lo que define **quién
 * cuenta** en el denominador. `posicionMaxima` mira toda la historia, porque
 * una oportunidad que entró a Calificación dentro de la ventana y avanzó a
 * Propuesta la semana siguiente sí pasó, aunque ese avance caiga fuera.
 *
 * INV-01 · pasa por `withScope`: un vendedor mide su propio embudo, no el de la
 * oficina.
 */
export async function historiasDeEtapas(
  session: Session,
  opciones: { desde: Date; where?: Prisma.OpportunityWhereInput },
): Promise<HistoriaDeEtapas[]> {
  const oportunidades = await prisma.opportunity.findMany({
    where: withScope(session, opciones.where),
    select: {
      id: true,
      createdAt: true,
      stage: { select: { position: true } },
      stageHistory: {
        select: {
          atDate: true,
          toStage: { select: { position: true } },
          fromStage: { select: { position: true } },
        },
        orderBy: { atDate: "asc" },
      },
    },
  });

  return oportunidades.map((o) => {
    const entradas: { posicion: number; cuando: Date }[] = [
      {
        posicion: o.stageHistory[0]?.fromStage?.position ?? o.stage.position,
        cuando: o.createdAt,
      },
      ...o.stageHistory.map((t) => ({ posicion: t.toStage.position, cuando: t.atDate })),
    ];

    // Un solo recorrido: la ventana y el máximo se resuelven a la vez.
    const enVentana = new Set<number>();
    let posicionMaxima = 0;
    for (const e of entradas) {
      if (e.cuando >= opciones.desde) enVentana.add(e.posicion);
      if (e.posicion > posicionMaxima) posicionMaxima = e.posicion;
    }

    return {
      opportunityId: o.id,
      entroEnPosiciones: [...enVentana],
      posicionMaxima,
    };
  });
}
