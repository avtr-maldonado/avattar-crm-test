import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "./permissions";

export type { Session } from "./permissions";

/**
 * Por qué no hay sesión. La diferencia importa: a un usuario sin autenticar se
 * le manda a iniciar sesión, pero a uno que **sí** entró por Entra ID y no
 * tiene perfil hay que explicarle que su alta es un acto administrativo. Si a
 * ese segundo se le devuelve a la pantalla de inicio de sesión, entra en un
 * ciclo: autentica bien, y vuelve a empezar sin entender por qué.
 */
export type SinSesion = "NO_AUTENTICADO" | "SIN_PERFIL";

export type ResultadoSesion =
  | { ok: true; session: Session }
  | { ok: false; causa: SinSesion; email?: string };

/**
 * Arma la sesión del request.
 *
 * Dos saltos: Supabase Auth dice quién es (Entra ID → `auth.users`), y Prisma
 * trae el perfil de aplicación y sus permisos desde `public.users`.
 *
 * `cache` de React lo resuelve **una vez por request**. Sin eso, cada Server
 * Component que pregunta por la sesión abre dos consultas propias.
 *
 * ## Lo que cuesta
 *
 * Un solo viaje a la base: el perfil. La identidad se verifica en local
 * (`getClaims`, abajo) y la matriz de permisos viene de la caché de proceso
 * (`permisosDelRol`). Antes eran cuatro viajes en serie por request —
 * ~1.1 s desde México — antes de tocar el negocio (docs/latencia-dev.md, §4).
 */
export const getSessionResult = cache(async (): Promise<ResultadoSesion> => {
  const supabase = await createClient();

  // getClaims, no getUser: verifica la firma del token en local con la clave
  // pública del proyecto (ES256; el JWKS se trae una vez por proceso) en vez de
  // viajar al servidor de autenticación en cada request. Sigue sin confiar en
  // la cookie a ciegas: un token alterado no pasa la verificación. Si el token
  // expiró lo renueva por dentro, y si la clave fuera simétrica cae a
  // `getUser` por su cuenta.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) return { ok: false, causa: "NO_AUTENTICADO" };

  // `sub` es el id de `auth.users`; el correo viene en el token de Supabase.
  const entraUserId = claims.sub;
  const correo = typeof claims.email === "string" ? claims.email : undefined;

  // El vínculo es el object id de Entra, no el correo: un correo puede
  // reasignarse a otra persona, el object id no.
  const perfil = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      active: true,
      OR: [
        { entraObjectId: entraUserId },
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

  if (!perfil) {
    return { ok: false, causa: "SIN_PERFIL", email: correo };
  }

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
});

/**
 * Matriz de permisos por rol, en caché de proceso.
 *
 * La matriz cambia cuando Administración edita catálogos —casi nunca— y se
 * leía en cada request: un viaje de ~440 ms desde México, en serie después del
 * perfil (docs/latencia-dev.md, 4c). Se guarda por rol durante un minuto.
 *
 * El minuto no es un umbral de negocio (INV-05): es cuánto tarda en verse un
 * cambio de permisos, que hoy ni siquiera tiene pantalla. Cuando la tenga, la
 * acción que edite `RolePermission` debe llamar a `invalidarPermisosEnCache()`
 * para que el cambio se vea en el acto en ese proceso.
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

/** La sesión, o `null`. Para cuando la ausencia es un caso válido. */
export async function getSession(): Promise<Session | null> {
  const r = await getSessionResult();
  return r.ok ? r.session : null;
}

/**
 * La sesión o una redirección. Para el layout de `(app)`: a partir de aquí
 * todas las pantallas asumen que hay usuario.
 */
export async function requireSession(): Promise<Session> {
  const r = await getSessionResult();
  if (r.ok) return r.session;
  redirect(r.causa === "SIN_PERFIL" ? "/sin-acceso" : "/login");
}

/**
 * Vincula el object id de Entra al perfil, en el primer inicio de sesión.
 *
 * El alta de usuarios es administrativa: alguien crea la fila en `public.users`
 * con el correo corporativo, y la primera vez que esa persona entra por Entra
 * ID se sella el vínculo. No hay autoaprovisionamiento — `enable_signup` está
 * en `false` en `supabase/config.toml` a propósito.
 */
export async function vincularEntraObjectId(
  email: string,
  entraObjectId: string,
): Promise<boolean> {
  const r = await prisma.user.updateMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      entraObjectId: null,
      deletedAt: null,
      active: true,
    },
    data: { entraObjectId },
  });
  return r.count === 1;
}
