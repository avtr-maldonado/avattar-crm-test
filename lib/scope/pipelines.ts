import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * Pipelines y etapas.
 *
 * Son **configuración**, no datos de negocio: no llevan alcance por propietario
 * y no están en la lista de INV-01. Pero se leen desde aquí igual, porque
 * `app/**` no puede importar `lib/db` y porque el pipeline sí se acota por
 * país: un gerente de México no tiene por qué ver el tablero de Colombia.
 *
 * El kanban necesita **todas** las etapas del pipeline, incluidas las vacías.
 * Una columna que desaparece cuando no tiene tarjetas rompe el mapa mental del
 * proceso: el vendedor deja de ver que Propuesta existe.
 */
export async function listPipelines(session: Session) {
  const dePais =
    session.role === "DIRECCION" || session.role === "ADMINISTRADOR"
      ? {}
      : { countryCode: { in: session.countryCodes } };

  return prisma.pipeline.findMany({
    where: { active: true, ...dePais },
    select: {
      id: true,
      name: true,
      countryCode: true,
      isRenewal: true,
      stages: {
        select: {
          id: true,
          name: true,
          position: true,
          probability: true,
          staleAfterDays: true,
          gateMode: true,
          gateRequires: true,
          isClosing: true,
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ isRenewal: "asc" }, { name: "asc" }],
  });
}

export type PipelineConEtapas = Awaited<ReturnType<typeof listPipelines>>[number];
export type EtapaDePipeline = PipelineConEtapas["stages"][number];

/**
 * El pipeline que la pantalla debe mostrar por omisión: **el del país activo**.
 *
 * De ventas, no de renovaciones: ahí está el trabajo diario.
 *
 * ## Por qué recibe el país en vez de deducirlo
 *
 * Antes filtraba por los países del usuario y se quedaba con el primero de la
 * lista. Esa lista viene ordenada por nombre —así la devuelve `listPipelines`—
 * y entre los de venta «Ventas Chile» va antes que «Ventas México». Para
 * Dirección y Administración, que llevan los tres países, el tablero abría en
 * Chile: cinco columnas vacías con la base llena de oportunidades mexicanas.
 *
 * El país activo ya lo calcula la pantalla para leer la política comercial y
 * para el selector del encabezado. Recibirlo aquí es lo que impide que las dos
 * cosas se separen otra vez: el tablero y la política hablan del mismo país o
 * no compilan.
 */
export function pipelinePorOmision(
  pipelines: PipelineConEtapas[],
  session: Session,
  paisActivo: CountryCode,
  /**
   * El que el usuario eligió en la barra de filtros. Manda sobre todo lo demás
   * —incluido el de renovaciones, que por omisión no se propone—, porque
   * elegirlo a mano es una decisión explícita. Un id que no exista o que la
   * sesión no alcance cae al camino normal, no a una pantalla vacía.
   */
  elegido?: string | null,
): PipelineConEtapas | undefined {
  const delUsuario = new Set<string>(session.countryCodes);
  const deVenta = pipelines.filter((p) => !p.isRenewal);

  return (
    (elegido ? pipelines.find((p) => p.id === elegido) : undefined) ??
    deVenta.find((p) => p.countryCode === paisActivo) ??
    // El país activo puede no tener pipeline configurado todavía (CO y CL
    // llegan con E5). Antes de dejar la pantalla en blanco, uno de venta que
    // el usuario sí alcance.
    deVenta.find((p) => delUsuario.has(p.countryCode)) ??
    deVenta[0] ??
    pipelines[0]
  );
}

/**
 * Los pesos MEDDIC del pipeline, que suman 100 · `INV-05` y `Q-08`.
 *
 * Se leen de la base porque «si el negocio decide que el decisor económico pesa
 * más, se cambia sin desplegar código». Si el pipeline no los tiene
 * configurados devuelve una lista vacía, y quien llama decide: un puntaje con
 * los pesos por omisión es más útil que una pantalla rota.
 */
export async function pesosMeddicDe(pipelineId: string) {
  return prisma.meddicWeight.findMany({
    where: { pipelineId },
    select: { component: true, weight: true },
  });
}
