import type { CountryCode, Role } from "@prisma/client";
import { money, type Money } from "@/lib/money";

/**
 * La matriz de permisos · §5.2.
 *
 * Los permisos son **datos**, no condicionales dispersos: viven en las tablas
 * `Permission` y `RolePermission`, y son editables desde Administración sin
 * desplegar código (F-1005). Este módulo solo sabe preguntarles.
 *
 * Los códigos se declaran como unión de literales para que un permiso mal
 * escrito sea un error de compilación. Sin eso, `can(s, "VER_COSTOS")` —con la
 * ese de más— devolvería `false` en silencio, y nadie notaría que el gerente
 * dejó de ver el costo hasta que lo reportara.
 */
export type PermissionCode =
  | "VER_OPORTUNIDADES_PROPIAS"
  | "VER_OPORTUNIDADES_OFICINA"
  | "VER_MARGEN"
  | "VER_COSTO"
  | "AUTORIZAR_DESCUENTO"
  | "EDITAR_CATALOGOS"
  | "REABRIR_OPORTUNIDAD"
  | "EXPORTAR_CON_COSTO"
  | "VER_ANALISIS"
  | "VER_OBJETIVOS_EQUIPO"
  | "EDITAR_POLITICA_COMERCIAL"
  | "ADMINISTRAR_USUARIOS";

/** Los doce permisos, para sembrarlos y para recorrerlos en Administración. */
export const PERMISOS: readonly PermissionCode[] = [
  "VER_OPORTUNIDADES_PROPIAS",
  "VER_OPORTUNIDADES_OFICINA",
  "VER_MARGEN",
  "VER_COSTO",
  "AUTORIZAR_DESCUENTO",
  "EDITAR_CATALOGOS",
  "REABRIR_OPORTUNIDAD",
  "EXPORTAR_CON_COSTO",
  "VER_ANALISIS",
  "VER_OBJETIVOS_EQUIPO",
  "EDITAR_POLITICA_COMERCIAL",
  "ADMINISTRAR_USUARIOS",
] as const;

/**
 * La sesión: quién es el usuario y sobre qué datos puede operar.
 *
 * Se arma una vez por request y se pasa a `lib/scope` y `lib/domain`. Es el
 * único argumento del que depende el alcance de una consulta (INV-01).
 */
export type Session = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** Oficinas del usuario. Un gerente puede llevar más de un país. */
  countryCodes: CountryCode[];
  /** Los permisos concedidos. Lo que no está aquí, se niega. */
  permissions: Set<string>;
  /**
   * Topes por permiso, como fracción en cadena. `null` significa **sin tope**,
   * que es distinto de no tener el permiso: Dirección autoriza cualquier
   * descuento, un vendedor no autoriza ninguno. Preguntar siempre con `can()`
   * antes de leer el tope.
   */
  limits: Record<string, string | null>;
};

/** ¿El usuario tiene este permiso? Lo que no está concedido, se niega. */
export function can(session: Session, code: PermissionCode): boolean {
  return session.permissions.has(code);
}

/**
 * El tope de un permiso, o `null` si no tiene tope **o** si no tiene el
 * permiso. Las dos situaciones devuelven `null` a propósito: el tope solo
 * significa algo después de que `can()` haya dicho que sí.
 */
export function limitFor(session: Session, code: PermissionCode): Money | null {
  if (!can(session, code)) return null;
  const tope = session.limits[code];
  return tope == null ? null : money(tope);
}

/**
 * Lanza si falta el permiso. Para usar al principio de una Server Action,
 * antes de tocar nada.
 */
export function requirePermission(session: Session, code: PermissionCode): void {
  if (!can(session, code)) {
    throw new PermissionDeniedError(code);
  }
}

export class PermissionDeniedError extends Error {
  constructor(readonly code: PermissionCode) {
    super(`El usuario no tiene el permiso ${code}.`);
    this.name = "PermissionDeniedError";
  }
}
