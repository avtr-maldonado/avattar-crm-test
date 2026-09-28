import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";

/**
 * Quién administra a una persona · decisiones §29.
 *
 * Editar, compartir y transferir son la misma pregunta: **¿es mía, o
 * administro a quien la tiene?** El propietario administra la suya; el gerente
 * administra las de los usuarios de su país; Dirección y Administración, todas.
 * Compartir da solo lectura, así que quien la recibe no administra nada.
 *
 * Es pura: recibe lo que el lector ya trajo. Ver a la persona es otra pregunta
 * y vive en `personScope` (`lib/scope/people.ts`).
 */
export type PersonaAdministrable = {
  ownerId: string;
  owner: { countryCodes: readonly CountryCode[] };
};

export function administraPersona(session: Session, persona: PersonaAdministrable): boolean {
  if (persona.ownerId === session.userId) return true;
  switch (session.role) {
    case "DIRECCION":
    case "ADMINISTRADOR":
      return true;
    case "GERENTE_PAIS":
      return persona.owner.countryCodes.some((c) => session.countryCodes.includes(c));
    case "VENDEDOR":
    case "PREVENTA":
      return false;
  }
}
