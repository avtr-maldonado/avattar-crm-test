/**
 * El SLA de primer contacto · decisiones §58.
 *
 * Horas corridas desde el alta; cuántas, lo dice la política del país (INV-05),
 * nunca este archivo. El estado se calcula al leer (INV-11): un prospecto con
 * `contactedAt` lo cumplió aunque haya sido tarde; sin él, está en tiempo, por
 * vencer cuando queda el 25 % del plazo o menos, o vencido.
 */
export type EstadoDeSla = "cumplido" | "en_tiempo" | "por_vencer" | "vencido";

export const ETIQUETA_DE_SLA: Record<EstadoDeSla, string> = {
  cumplido: "Contactado",
  en_tiempo: "En tiempo",
  por_vencer: "Por vencer",
  vencido: "Vencido",
};

export const TONO_DE_SLA: Record<EstadoDeSla, "neutro" | "exito" | "alerta" | "peligro"> = {
  cumplido: "neutro",
  en_tiempo: "exito",
  por_vencer: "alerta",
  vencido: "peligro",
};

const FRACCION_POR_VENCER = 0.25;

export function venceEn(createdAt: Date, horas: number): Date {
  return new Date(createdAt.getTime() + horas * 60 * 60 * 1000);
}

export function estadoDeSla(l: { createdAt: Date; firstContactDueAt: Date; contactedAt: Date | null }, ahora: Date): EstadoDeSla {
  if (l.contactedAt) return "cumplido";
  const plazo = l.firstContactDueAt.getTime() - l.createdAt.getTime();
  const restante = l.firstContactDueAt.getTime() - ahora.getTime();
  if (restante < 0) return "vencido";
  if (plazo <= 0 || restante <= plazo * FRACCION_POR_VENCER) return "por_vencer";
  return "en_tiempo";
}
