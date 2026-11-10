import { prisma } from "@/lib/db";
import type { Session } from "./permissions";

/**
 * De los claims de un token de Supabase a la sesión del CRM.
 *
 * Es el segundo salto de `getSessionResult`: Supabase Auth dijo quién es (el
 * token ya se verificó), y aquí se trae el perfil de aplicación y sus permisos
 * desde `public.users`. Vive aparte de `session.ts` porque también lo usa el
 * servidor MCP (decisiones §61), que recibe el token en un encabezado y no en
 * una cookie, y porque así se prueba sin `next/headers`.
 *
 * **Mismo comportamiento que antes de la extracción**, incluida la búsqueda
 * por correo cuando el object id de Entra todavía no se selló.
 */
export type ClaimsDeIdentidad = { sub: string; email?: unknown };

export type ResultadoDePerfil =
  | { ok: true; session: Session }
  | { ok: false; email?: string };

export async function sesionDesdeClaims(claims: ClaimsDeIdentidad): Promise<ResultadoDePerfil> {
  const correo = typeof claims.email === "string" ? claims.email : undefined;

  // El vínculo es el object id de Entra, no el correo: un correo puede
  // reasignarse a otra persona, el object id no.
  const perfil = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      active: true,
      OR: [
        { entraObjectId: claims.sub },
        // Primer inicio de sesión: la fila se dio de alta con el correo, y el
        // object id se vincula en `vincularEntraObjectId`. Sin distinguir
        // mayúsculas: Microsoft puede devolver el correo con otra capitalización
        // que la capturada al dar de alta.
        {
          entraObjectId: null,
          email: { equals: correo ?? "__sin_correo__", mode: "insensitive" },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      countryCodes: true,
      entraObjectId: true,
    },
  });

  if (!perfil) return { ok: false, email: correo };

  const permisos = await permisosDelRol(perfil.role);

  return {
    ok: true,
    session: {
      userId: perfil.id,
      email: perfil.email,
      name: perfil.name,
      role: perfil.role,
      countryCodes: perfil.countryCodes,
      permissions: new Set(permisos.map((p) => p.code)),
      limits: Object.fromEntries(permisos.map((p) => [p.code, p.limitValue])),
    },
  };
}

/**
 * Matriz de permisos por rol, en caché de proceso.
 *
 * La matriz cambia cuando Administración edita catálogos —casi nunca— y se
 * leía en cada request: un viaje de ~440 ms desde México, en serie después del
 * perfil (docs/latencia-dev.md, 4c). Se guarda por rol durante un minuto.
 *
 * El minuto no es un umbral de negocio (INV-05): es cuánto tarda en verse un
 * cambio de permisos. La acción que edita `RolePermission` llama a
 * `invalidarPermisosEnCache()` para que el cambio se vea en el acto en ese
 * proceso.
 *
 * Es un `Map` a nivel de módulo: vive lo que vive el proceso de Node. Se cachea
 * la lista plana y cada sesión arma su propio `Set`, para que ningún request
 * comparta objetos mutables con otro.
 */
type PermisoConcedido = { code: string; limitValue: string | null };

const PERMISOS_TTL_MS = 60_000;
const permisosPorRol = new Map<Session["role"], { vigenteHasta: number; permisos: PermisoConcedido[] }>();

async function permisosDelRol(role: Session["role"]): Promise<PermisoConcedido[]> {
  const ahora = Date.now();
  const enCache = permisosPorRol.get(role);
  if (enCache && enCache.vigenteHasta > ahora) return enCache.permisos;

  const filas = await prisma.rolePermission.findMany({
    where: { role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });
  const permisos = filas.map((p) => ({
    code: p.permission.code,
    limitValue: p.limitValue?.toString() ?? null,
  }));

  permisosPorRol.set(role, { vigenteHasta: ahora + PERMISOS_TTL_MS, permisos });
  return permisos;
}

/** Vacía la caché de permisos. Llamar al editar `RolePermission`. */
export function invalidarPermisosEnCache(): void {
  permisosPorRol.clear();
}
