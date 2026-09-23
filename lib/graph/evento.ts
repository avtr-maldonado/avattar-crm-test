import { fechaEn, horaEn } from "@/lib/tiempo";

/**
 * Lo que Microsoft Graph entiende por evento. Solo los campos que se mandan.
 * https://learn.microsoft.com/graph/api/resources/event
 */
export type EventoDeGraph = {
  subject: string;
  body: { contentType: "text"; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isOnlineMeeting: boolean;
  onlineMeetingProvider?: "teamsForBusiness";
};

/** Si una actividad no dice cuánto dura, ocupa media hora en el calendario. */
export const DURACION_POR_OMISION_MIN = 30;

/**
 * Traduce una actividad al evento que va al calendario · F-605.
 *
 * Es pura para poder probarla sin red. Lo delicado está en las horas: Graph
 * no quiere instantes sino **hora de pared más zona** («10:30 en
 * America/Mexico_City»). Así el evento cae bien en el calendario de cada
 * quien, esté en la zona que esté, y el día del cambio de horario sigue
 * siendo a las 10:30.
 */
export function eventoDeActividad(a: {
  subject: string;
  startsAt: Date;
  durationMin: number | null;
  zona: string;
  notes: string | null;
  esVideollamada: boolean;
  oportunidad: { folio: string; name: string } | null;
}): EventoDeGraph {
  const duracion = a.durationMin && a.durationMin > 0 ? a.durationMin : DURACION_POR_OMISION_MIN;
  const fin = new Date(a.startsAt.getTime() + duracion * 60_000);

  // El folio va en el cuerpo: es el camino de regreso del calendario al CRM.
  const cuerpo = [
    a.notes?.trim() || null,
    a.oportunidad ? `Oportunidad ${a.oportunidad.folio} · ${a.oportunidad.name}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: a.subject,
    body: { contentType: "text", content: cuerpo },
    start: { dateTime: horaDePared(a.startsAt, a.zona), timeZone: a.zona },
    end: { dateTime: horaDePared(fin, a.zona), timeZone: a.zona },
    isOnlineMeeting: a.esVideollamada,
    ...(a.esVideollamada ? { onlineMeetingProvider: "teamsForBusiness" as const } : {}),
  };
}

function horaDePared(instante: Date, zona: string): string {
  return `${fechaEn(instante, zona)}T${horaEn(instante, zona)}:00`;
}
