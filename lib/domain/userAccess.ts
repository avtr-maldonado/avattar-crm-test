import type { CountryCode, Role } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";

/**
 * Quién administra a un usuario · decisiones §55.
 *
 * `ADMINISTRAR_USUARIOS` dice si alguien administra usuarios; esto dice **a
 * quiénes**. Administración y Dirección, a cualquiera. Gerencia, a su equipo:
 * vendedores y preventas de sus países. Ni otro rol ni otro país, porque dar
 * de alta a un administrador, o mover a alguien a una oficina que no es la
 * suya, sería ampliar el alcance de quien lo hace; y un filtro nunca amplía el
 * alcance, tampoco uno administrativo.
 *
 * Es pura: recibe lo que el lector ya trajo. Ver la lista es otra pregunta y
 * vive en `lib/scope/usuarios`.
 */
const TODOS_LOS_ROLES: readonly Role[] = ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"];
const TODOS_LOS_PAISES: readonly CountryCode[] = ["MX", "CO", "CL"];
const EQUIPO_DE_GERENCIA: readonly Role[] = ["VENDEDOR", "PREVENTA"];

export type UsuarioAdministrable = { role: Role; countryCodes: readonly CountryCode[] };

/** Los roles que esta sesión puede asignar: lo que el formulario ofrece. */
export function rolesQueAdministra(session: Session): Role[] {
  switch (session.role) {
    case "ADMINISTRADOR":
    case "DIRECCION":
      return [...TODOS_LOS_ROLES];
    case "GERENTE_PAIS":
      return [...EQUIPO_DE_GERENCIA];
    case "VENDEDOR":
    case "PREVENTA":
      return [];
  }
}

/** Los países en los que esta sesión puede poner a alguien. */
export function paisesQueAdministra(session: Session): CountryCode[] {
  switch (session.role) {
    case "ADMINISTRADOR":
    case "DIRECCION":
      return [...TODOS_LOS_PAISES];
    case "GERENTE_PAIS":
      return [...session.countryCodes];
    case "VENDEDOR":
    case "PREVENTA":
      return [];
  }
}

/** ¿Esta sesión administra a este usuario, tal como es o como quedaría? */
export function administraUsuario(session: Session, usuario: UsuarioAdministrable): boolean {
  if (!rolesQueAdministra(session).includes(usuario.role)) return false;
  const paises = new Set<string>(paisesQueAdministra(session));
  return usuario.countryCodes.every((c) => paises.has(c));
}
