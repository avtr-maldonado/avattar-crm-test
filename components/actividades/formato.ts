import type { CountryCode } from "@/lib/dto";
import { etiquetaDeDuracion, etiquetaDeRango, sumarDias } from "@/lib/tiempo";

/**
 * Lo puro que comparten las tres vistas de Actividades (decisiones §42): la
 * forma de una actividad tal como la traen los lectores de `lib/scope/agenda`,
 * los formatos en la zona de la oficina y los rangos de horas.
 */
export type ActividadDeTablero = {
  id: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  startsAt: Date;
  durationMin: number | null;
  completedAt: Date | null;
  externalEventId: string | null;
  type: { id: string; name: string };
  user: { id: string; name: string; initials: string };
  /** `accesible`: si la oportunidad sigue al alcance de quien mira (§46); sin él no hay enlace ni lápiz. */
  opportunity: { id: string; folio: string; name: string; countryCode: CountryCode; accesible: boolean } | null;
};

/** El lápiz de una fila, o nada: lo decide la página, que conoce la acción. */
export type EditorDe = (a: ActividadDeTablero) => React.ReactNode;

/**
 * Los formatos de la pantalla, en la zona de la oficina. Antes eran constantes
 * en UTC, y en Vercel eso corría seis horas cada actividad mexicana.
 */
export function formatos(zona: string) {
  return {
    fecha: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: zona }),
    hora: new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }),
    diaSemana: new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: zona }),
  };
}

export type Formatos = ReturnType<typeof formatos>;

/** «09:30 – 11:00 · 1 h 30 min»; sin duración, solo la hora. */
export function rangoDeHoras(a: ActividadDeTablero, f: Formatos): string {
  const inicio = f.hora.format(a.startsAt);
  if (!a.durationMin) return inicio;
  const fin = f.hora.format(new Date(a.startsAt.getTime() + a.durationMin * 60_000));
  return `${inicio} – ${fin}`;
}

export function duracionDe(a: ActividadDeTablero): string {
  return a.durationMin ? etiquetaDeDuracion(a.durationMin) : "";
}

/**
 * «28 sep – 4 oct 2026»: la semana que se navega (decisiones §44), del lunes al
 * domingo. Trabaja sobre fechas de pared, que ya están en la zona de la oficina.
 */
export function rangoDeSemana(lunes: string): string {
  return etiquetaDeRango(lunes, sumarDias(lunes, 6));
}
