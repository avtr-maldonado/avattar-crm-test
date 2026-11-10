import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CountryCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COOKIE_MENU, COOKIE_OFICINA, MENU_COLAPSADO } from "@/lib/preferencias";
import { createClient } from "@/lib/supabase/server";
import { sesionDesdeClaims } from "./perfil";
import type { Session } from "./permissions";

export type { Session } from "./permissions";

/**
 * La oficina activa: el país sobre el que se está trabajando ahora.
 *
 * Quien opera en varios países —Dirección, Administración, un gerente con dos
 * oficinas— elige una desde la barra superior, y todas las pantallas y los
 * contadores del menú se acotan a ella. Quien opera en uno, no elige.
 *
 * **Vive en una cookie y no en la URL, a sabiendas de INV-10.** INV-10 pone el
 * estado de los filtros en `searchParams` para que una vista sea compartible.
 * La oficina no es un filtro de una pantalla: es el contexto de toda la
 * sesión, incluidos los contadores del layout, que no tienen acceso a la URL.
 * El filtro `country` de §9 sigue existiendo aparte para la barra de filtros.
 * Razonado en decisiones-pendientes §16.
 *
 * **Nunca amplía el alcance.** Se valida contra los países del usuario: una
 * cookie editada a mano con otro país cae al primero suyo.
 */
export const oficinaActiva = cache(async (session: Session): Promise<CountryCode> => {
  const elegida = (await cookies()).get(COOKIE_OFICINA)?.value;
  return session.countryCodes.find((c) => c === elegida) ?? session.countryCodes[0] ?? "MX";
});

/** Si el menú lateral se dejó contraído. Se lee en el servidor para pintarlo sin parpadeo. */
export async function menuColapsado(): Promise<boolean> {
  return (await cookies()).get(COOKIE_MENU)?.value === MENU_COLAPSADO;
}

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

  // El segundo salto —perfil y permisos desde `public.users`— vive en
  // lib/auth/perfil.ts porque también lo da el servidor MCP (decisiones §61).
  const perfil = await sesionDesdeClaims({ sub: claims.sub, email: claims.email });
  if (!perfil.ok) return { ok: false, causa: "SIN_PERFIL", email: perfil.email };
  return { ok: true, session: perfil.session };
});

export { invalidarPermisosEnCache } from "./perfil";

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
