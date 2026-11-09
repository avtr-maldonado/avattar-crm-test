import type { CountryCode, LeadStage, Role } from "@prisma/client";
import { can, type Session } from "@/lib/auth/permissions";
import { ETAPAS_DE_PROSPECTO } from "./leadStages";

/**
 * Quién hace qué con un prospecto · decisiones §58.
 *
 * Tres preguntas, puras: **gestionar** (crear, validar, calificar, asignar,
 * descartar) exige el permiso y que el país esté al alcance; **decidir como
 * ventas** (aceptar, rechazar) es del vendedor asignado o de quien gestiona;
 * **convertir** exige el permiso y ser el asignado o gestionar. Ver la lista es
 * otra pregunta y vive en `leadScope`.
 */
export type ProspectoAccesible = { countryCode: CountryCode; assignedToId: string | null };

function alcanzaElPais(session: Session, l: ProspectoAccesible): boolean {
  if (session.role === "DIRECCION" || session.role === "ADMINISTRADOR") return true;
  return session.countryCodes.includes(l.countryCode);
}

export function gestionaProspecto(session: Session, l: ProspectoAccesible): boolean {
  return can(session, "GESTIONAR_PROSPECTOS") && alcanzaElPais(session, l);
}

export function decideComoVentas(session: Session, l: ProspectoAccesible): boolean {
  return l.assignedToId === session.userId || gestionaProspecto(session, l);
}

export function convierteProspecto(session: Session, l: ProspectoAccesible): boolean {
  return can(session, "CONVERTIR_PROSPECTO") && decideComoVentas(session, l);
}

/** Desde dónde ve un vendedor: lo que ya pasó por Marketing y le tocó. */
const ETAPAS_DESDE_ASIGNACION: readonly LeadStage[] = ["ASIGNADO", "ACEPTADO", "RECHAZADO", "CONVERTIDO", "DESCARTADO"];

/**
 * Qué etapas ve cada rol · decisiones §59. Al vendedor le llegan los prospectos
 * a partir de Asignado: lo que Marketing todavía valida o califica no es suyo
 * aunque ya tenga su nombre puesto. Lo aplican `leadScope`, las columnas del
 * kanban y las opciones del filtro de etapa, para que los tres cuenten lo mismo.
 */
export function etapasQueVe(role: Role): readonly LeadStage[] {
  return role === "VENDEDOR" ? ETAPAS_DESDE_ASIGNACION : ETAPAS_DE_PROSPECTO;
}
