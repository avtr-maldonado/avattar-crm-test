import type { CountryCode, LeadStage } from "@/lib/dto";
import type { EstadoDeSla } from "@/lib/domain/leadSla";

/**
 * Lo que la fila, la tarjeta y el detalle muestran de un prospecto, ya
 * formateado en el servidor (decisiones §58). Los componentes solo pintan.
 */
export type DatosDeProspecto = {
  id: string;
  folio: string;
  contacto: string;
  iniciales: string;
  correo: string | null;
  telefono: string | null;
  empresa: string;
  countryCode: CountryCode;
  canal: string;
  campana: string | null;
  etapa: LeadStage;
  score: number | null;
  vendedor: { id: string; nombre: string; iniciales: string } | null;
  /** «29 oct 2026». */
  ingreso: string;
  /** Días desde el ingreso. */
  dias: number;
  /** «Llamada · 30 oct, 11:00», o nulo. */
  proximaActividad: string | null;
  sla: EstadoDeSla;
  /** A dónde lleva «ver»: la misma URL con `p=<id>`. */
  href: string;
  /** Lo que esta sesión puede hacerle; lo que no, no se ofrece. */
  puede: { asignar: boolean; descartar: boolean; convertir: boolean; actividad: boolean };
};

/** Las acciones de la fila y del detalle, por si la pantalla las enruta igual. */
export type AccionDeFila = "asignar" | "actividad" | "convertir" | "descartar";

/** Los formatos de la pantalla en la zona de la oficina, construidos una vez por zona. */
export type Formateadores = {
  fechaCorta: Intl.DateTimeFormat;
  fechaHora: Intl.DateTimeFormat;
  fecha: Intl.DateTimeFormat;
  hora: Intl.DateTimeFormat;
  fechaLarga: Intl.DateTimeFormat;
};

const FORMATEADORES = new Map<string, Formateadores>();

export function formateadoresDe(zona: string): Formateadores {
  const enCache = FORMATEADORES.get(zona);
  if (enCache) return enCache;
  const f: Formateadores = {
    fechaCorta: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: zona }),
    fechaHora: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }),
    fecha: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: zona }),
    hora: new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }),
    fechaLarga: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }),
  };
  FORMATEADORES.set(zona, f);
  return f;
}

export function diasDesde(fecha: Date, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / (24 * 60 * 60 * 1000)));
}
