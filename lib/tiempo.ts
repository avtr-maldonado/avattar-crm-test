/**
 * Horas de pared y zonas horarias, sin librería.
 *
 * ## Por qué la zona es la del país de la oportunidad
 *
 * Una actividad se teclea como hora de pared —«a las 10:30»— y `startsAt` se
 * guarda como instante. Entre las dos hace falta una zona, y la única que el
 * sistema conoce con certeza es la del país de la oportunidad (`Country.timezone`,
 * en la base). Es también la más útil: la reunión con el cliente chileno es a
 * la hora de Chile, y así la ve todo el equipo. El calendario de Microsoft 365
 * recibe ese mismo par (hora + zona) y la pone bien en el calendario de cada
 * quien.
 *
 * Antes, la hora se interpretaba en la zona del **servidor** y se mostraba en
 * UTC: en Vercel eso corría seis horas cada actividad mexicana.
 *
 * Todo es puro y lo importa también el cliente (para arrastrar la hora de fin
 * cuando se mueve la de inicio), así que aquí no hay nada de Prisma.
 */

const HORA = /^(\d{2}):(\d{2})$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function zonaValida(zona: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return zona;
  } catch {
    return "UTC";
  }
}

/** Minutos que la zona lleva de adelanto sobre UTC en ese instante. */
function desfaseEn(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const comoUTC = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((comoUTC - instante.getTime()) / 60_000);
}

/** El instante que corresponde a una fecha y hora de pared en una zona. */
export function instanteEn(fecha: string, hora: string, zona: string): Date {
  const z = zonaValida(zona);
  const [, a, m, d] = fecha.match(FECHA) ?? ["", "1970", "01", "01"];
  const [, hh, mm] = hora.match(HORA) ?? ["", "12", "00"];
  const supuesto = Date.UTC(Number(a), Number(m) - 1, Number(d), Number(hh), Number(mm));

  // Dos pasadas: el desfase se mide en el instante resultante, y cerca de un
  // cambio de horario la primera estimación puede caer del otro lado.
  let instante = supuesto - desfaseEn(z, new Date(supuesto)) * 60_000;
  const otraVez = supuesto - desfaseEn(z, new Date(instante)) * 60_000;
  if (otraVez !== instante) instante = otraVez;
  return new Date(instante);
}

/** `HH:mm` de un instante, en la zona. */
export function horaEn(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zonaValida(zona),
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
}

/** `YYYY-MM-DD` de un instante, en la zona. */
export function fechaEn(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaValida(zona),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

function minutosDe(hora: string): number {
  const [, hh, mm] = hora.match(HORA) ?? ["", "0", "0"];
  return Number(hh) * 60 + Number(mm);
}

/** Minutos entre dos horas del mismo día. Negativo si el fin va antes. */
export function duracionEnMinutos(inicio: string, fin: string): number {
  return minutosDe(fin) - minutosDe(inicio);
}

/** Suma minutos a una `HH:mm`, dando la vuelta a medianoche. */
export function sumarMinutos(hora: string, minutos: number): string {
  const total = (((minutosDe(hora) + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** «30 min», «1 h», «1 h 30 min». Vacío si no hay duración. */
export function etiquetaDeDuracion(minutos: number): string {
  if (minutos <= 0) return "";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Las ciudades del negocio, como se dicen; las demás, su último tramo. */
const CIUDAD: Record<string, string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Bogota": "Bogotá",
  "America/Santiago": "Santiago",
};

/** El nombre de la zona para una etiqueta: «Hora de Ciudad de México». */
export function ciudadDe(zona: string): string {
  return CIUDAD[zona] ?? (zona.split("/").pop() ?? zona).replace(/_/g, " ");
}

/** «6 oct» en una zona. Un formateador por zona, construido una vez. */
const FECHAS_CORTAS = new Map<string, Intl.DateTimeFormat>();
export function fechaCortaEn(zona: string): Intl.DateTimeFormat {
  let f = FECHAS_CORTAS.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: zonaValida(zona) });
    FECHAS_CORTAS.set(zona, f);
  }
  return f;
}
