import type { Prisma, Role } from "@prisma/client";
import { requirePermission, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Los usuarios del CRM, para Administración · P-11.
 *
 * La puerta es el permiso `ADMINISTRAR_USUARIOS`: quien no lo tiene no lee
 * nada, y se lanza en vez de devolver vacío para que un olvido en la pantalla
 * no se vea como «no hay usuarios». Desde §55 Gerencia también lo tiene, y
 * entonces el alcance sí es por país: un gerente ve a quienes operan en sus
 * países. A quién puede **editar** lo decide `administraUsuario`, aparte.
 */
const seleccion = {
  id: true,
  email: true,
  name: true,
  initials: true,
  role: true,
  countryCodes: true,
  active: true,
  entraObjectId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function conVinculo<T extends { entraObjectId: string | null }>(u: T) {
  return { ...u, vinculado: u.entraObjectId !== null };
}

/**
 * El alcance por rol (§55). Administración y Dirección ven a todos; Gerencia,
 * a quienes operan en alguno de sus países. Los demás roles no llegan aquí sin
 * el permiso; si la matriz se lo diera, verían lo de sus países, como Gerencia.
 */
function userScope(session: Session): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { deletedAt: null };
  switch (session.role) {
    case "ADMINISTRADOR":
    case "DIRECCION":
      return base;
    case "GERENTE_PAIS":
    case "VENDEDOR":
    case "PREVENTA":
    case "MARKETING":
      return { ...base, countryCodes: { hasSome: session.countryCodes } };
  }
}

export type FiltrosDeUsuarios = {
  /** `true` con acceso, `false` sin acceso, ausente todos. */
  activos?: boolean;
  roles?: readonly Role[];
};

/** Los filtros de la URL (§55), **después** del alcance: recortan, nunca amplían. */
function filtrosDeUsuarios(f: FiltrosDeUsuarios): Prisma.UserWhereInput {
  return {
    ...(f.activos === undefined ? {} : { active: f.activos }),
    ...(f.roles && f.roles.length > 0 ? { role: { in: [...f.roles] } } : {}),
  };
}

export async function listUsuarios(session: Session, filtros: FiltrosDeUsuarios = {}) {
  requirePermission(session, "ADMINISTRAR_USUARIOS");
  const filas = await prisma.user.findMany({
    where: { AND: [userScope(session), filtrosDeUsuarios(filtros)] },
    select: seleccion,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return filas.map(conVinculo);
}

export type UsuarioAdministrable = Awaited<ReturnType<typeof listUsuarios>>[number];

export async function getUsuario(session: Session, id: string): Promise<UsuarioAdministrable | null> {
  requirePermission(session, "ADMINISTRAR_USUARIOS");
  const u = await prisma.user.findFirst({ where: { AND: [userScope(session), { id }] }, select: seleccion });
  return u ? conVinculo(u) : null;
}

export type AutenticadoSinPerfil = {
  /** El id en `auth.users`. Es lo que `User.entraObjectId` guarda al vincular. */
  authUserId: string;
  email: string;
  name: string | null;
  lastSignInAt: Date | null;
  createdAt: Date;
};

/**
 * Quienes ya entraron con Microsoft y todavía no tienen perfil.
 *
 * Pasa cuando alguien intenta entrar antes de que Administración lo dé de
 * alta: Supabase crea su usuario de autenticación, el CRM no encuentra perfil
 * y lo manda a `/sin-acceso`. Esta lista es lo que convierte ese callejón en
 * un pendiente visible: desde aquí se le asigna rol y país y queda vinculado.
 *
 * Se lee con la clave de servicio, que es la única que ve `auth.users`. Se
 * excluye a quien ya tiene perfil por vínculo **o por correo**: si el perfil
 * existe con su correo, su siguiente ingreso lo vincula solo.
 */
export async function autenticadosSinPerfil(session: Session): Promise<AutenticadoSinPerfil[]> {
  requirePermission(session, "ADMINISTRAR_USUARIOS");

  const supabase = createServiceRoleClient();
  const [{ data, error }, perfiles] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 500 }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { email: true, entraObjectId: true } }),
  ]);
  if (error) throw error;

  const vinculados = new Set<string>();
  const correos = new Set<string>();
  for (const p of perfiles) {
    if (p.entraObjectId) vinculados.add(p.entraObjectId);
    correos.add(p.email.toLowerCase());
  }

  const pendientes: AutenticadoSinPerfil[] = [];
  for (const u of data.users) {
    if (vinculados.has(u.id)) continue;
    if (u.email && correos.has(u.email.toLowerCase())) continue;
    pendientes.push({
      authUserId: u.id,
      email: u.email ?? "",
      name: typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name : null,
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at) : null,
      createdAt: new Date(u.created_at),
    });
  }

  // Los más recientes primero: quien acaba de intentar entrar es quien espera.
  return pendientes.sort(
    (a, b) => (b.lastSignInAt?.getTime() ?? 0) - (a.lastSignInAt?.getTime() ?? 0),
  );
}
