import { lunesDe } from "@/lib/tiempo";

/**
 * El estado de una actividad en la agenda · P-07, decisiones §42.
 *
 * Cuatro cubetas, calculadas y nunca capturadas (como las banderas, INV-11):
 *
 * - **realizada**: tiene `completedAt`.
 * - **vencida**: pendiente y de un día anterior a hoy. Se mide por día, igual
 *   que la bandeja y el contador del menú: una llamada de hace una hora sigue
 *   siendo del plan de hoy, no deuda.
 * - **en progreso**: pendiente, ya empezó y todavía no termina. Sin duración,
 *   la misma media hora que le da el calendario.
 * - **por realizar**: lo demás, de hoy o de después.
 */
export type EstadoDeAgenda = "por_realizar" | "en_progreso" | "realizada" | "vencida";

export const ETIQUETA_DE_ESTADO_DE_AGENDA: Record<EstadoDeAgenda, string> = {
  por_realizar: "Por realizar",
  en_progreso: "En progreso",
  realizada: "Realizada",
  vencida: "Vencida",
};

/** El orden en que se leen: primero la deuda, al final lo ya hecho. */
export const ORDEN_DE_ESTADOS: readonly EstadoDeAgenda[] = ["vencida", "en_progreso", "por_realizar", "realizada"];

const DURACION_POR_OMISION_MIN = 30;

export type RelojDeAgenda = { ahora: Date; inicioDeHoy: Date };

type Agendable = { startsAt: Date; durationMin: number | null; completedAt: Date | null };

export function estadoDeAgenda(a: Agendable, reloj: RelojDeAgenda): EstadoDeAgenda {
  if (a.completedAt) return "realizada";
  if (a.startsAt < reloj.inicioDeHoy) return "vencida";
  const fin = a.startsAt.getTime() + (a.durationMin ?? DURACION_POR_OMISION_MIN) * 60_000;
  if (a.startsAt <= reloj.ahora && reloj.ahora.getTime() < fin) return "en_progreso";
  return "por_realizar";
}

/** Las cuatro cubetas, cada una por fecha de inicio. */
export function agruparPorEstado<T extends Agendable>(actividades: readonly T[], reloj: RelojDeAgenda): Record<EstadoDeAgenda, T[]> {
  const grupos: Record<EstadoDeAgenda, T[]> = { por_realizar: [], en_progreso: [], realizada: [], vencida: [] };
  for (const a of [...actividades].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime())) {
    grupos[estadoDeAgenda(a, reloj)].push(a);
  }
  return grupos;
}

const FECHA_DE_PARED = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La semana que se ve en la vista semanal (decisiones §44). Vive en la URL como
 * `semana=YYYY-MM-DD` (INV-10); cualquier día de la semana vale y se normaliza
 * a su lunes. Sin parámetro, o con uno que no es una fecha real, la semana de
 * hoy: un enlace roto nunca deja la agenda en blanco.
 */
export function semanaElegida(parametro: string | string[] | undefined, hoy: string): string {
  if (typeof parametro === "string" && FECHA_DE_PARED.test(parametro)) {
    // `2026-13-40` cumple el patrón pero no es una fecha: Date la corre o la invalida.
    const d = new Date(`${parametro}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === parametro) return lunesDe(parametro);
  }
  return lunesDe(hoy);
}
