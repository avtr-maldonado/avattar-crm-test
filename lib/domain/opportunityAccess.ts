import { can, type Session } from "@/lib/auth/permissions";

/**
 * Quién modifica una oportunidad · Q-13 y decisiones §39.
 *
 * Su propietario, o quien tenga alcance de oficina (Gerencia, Dirección,
 * Administración). **Preventa la ve y le agrega actividades, pero no la
 * cambia**: ni datos, ni etapa, ni cotización, ni MEDDIC, ni hitos, ni
 * documentos. La regla vive aquí, en un módulo sin dependencias, para que cada
 * servicio la aplique igual y ninguno dependa de que la pantalla haya ocultado
 * el botón.
 */
export function puedeEditarOportunidad(
  session: Session,
  oportunidad: { owner: { id: string } } | { ownerId: string },
): boolean {
  const ownerId = "owner" in oportunidad ? oportunidad.owner.id : oportunidad.ownerId;
  return ownerId === session.userId || can(session, "VER_OPORTUNIDADES_OFICINA");
}

export const SOLO_PROPIETARIO_O_GERENCIA =
  "Solo su propietario o Gerencia pueden modificarla. Preventa la consulta y le registra actividades.";

export type ApoyoDeOportunidad = { user: { id: string; name: string; initials: string; role: string } };

/**
 * El responsable de preventa de una oportunidad (§39): la fila de apoyo cuyo
 * usuario tiene rol PREVENTA. `OpportunitySupport` admite varias; la pantalla
 * asigna una, y es la misma fila que recorta el alcance de ese rol.
 */
export function preventaDe(o: { supportUsers: readonly ApoyoDeOportunidad[] }): ApoyoDeOportunidad["user"] | null {
  return o.supportUsers.find((s) => s.user.role === "PREVENTA")?.user ?? null;
}
