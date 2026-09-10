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
 */
export const getSessionResult = cache(async (): Promise<ResultadoSesion> => {
  const supabase = await createClient();

  // getUser, no getSession: valida el token contra el servidor de autenticación
  // en vez de confiar en la cookie, que el navegador puede haber alterado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, causa: "NO_AUTENTICADO" };

  // El vínculo es el object id de Entra, no el correo: un correo puede
  // reasignarse a otra persona, el object id no.
  const perfil = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      active: true,
      OR: [
        { entraObjectId: user.id },
        // Primer inicio de sesión: la fila se dio de alta con el correo, y el
        // object id se vincula en `vincularEntraObjectId`.
        { entraObjectId: null, email: user.email ?? "__sin_correo__" },
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
    return { ok: false, causa: "SIN_PERFIL", email: user.email ?? undefined };
  }

  const permisos = await prisma.rolePermission.findMany({
    where: { role: perfil.role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });

  return {
    ok: true,
    session: {
      userId: perfil.id,
      email: perfil.email,
      name: perfil.name,
      role: perfil.role,
      countryCodes: perfil.countryCodes,
      permissions: new Set(permisos.map((p) => p.permission.code)),
      limits: Object.fromEntries(
        permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null]),
      ),
    },
  };
});

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
    where: { email, entraObjectId: null, deletedAt: null, active: true },
    data: { entraObjectId },
  });
  return r.count === 1;
}
