import type { CountryCode, Prisma, Role } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { iniciales } from "@/lib/etiquetas";
import type { UsuarioAdministrable } from "@/lib/scope/usuarios";

/**
 * Usuarios del CRM · alta previa, edición y acceso · P-11.
 *
 * El alta de usuarios es un acto administrativo (diseño §3.2): no hay
 * autoaprovisionamiento. Este módulo es ese acto. Tres caminos:
 *
 * - **Alta previa.** Administración captura correo, nombre, rol y países. El
 *   perfil queda sin vincular; el primer ingreso con Microsoft lo vincula por
 *   correo (`vincularEntraObjectId`).
 * - **Edición.** Rol, países, nombre y estado. Desactivar es quitar el acceso:
 *   `getSessionResult` exige `active`.
 * - **Dar acceso.** A quien ya entró con Microsoft y cayó en `/sin-acceso`: se
 *   crea el perfil ya vinculado al id de autenticación, o se vincula el perfil
 *   que ya existía con ese correo.
 *
 * Todo deja bitácora en la misma transacción (INV-09). Y nadie se quita a sí
 * mismo el acceso ni el rol de administrador: el último administrador no
 * puede cerrarse la puerta por accidente.
 *
 * Los correos se guardan y comparan en minúsculas: Microsoft puede devolverlos
 * con otra capitalización que la capturada, y el vínculo del primer ingreso
 * depende de que coincidan.
 *
 * `entraObjectId` guarda el id de usuario de **Supabase Auth**, no el `oid` de
 * Entra: es lo que `getSessionResult` compara con `claims.sub`. El nombre de la
 * columna es deuda (decisiones-pendientes §15).
 */
const SIN_PERMISO = "Administrar usuarios es de Administración.";
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DatosDeUsuario = {
  name?: string;
  role?: Role;
  countryCodes?: CountryCode[];
  active?: boolean;
};

export type AltaDeUsuario = {
  email: string;
  name: string;
  role: Role;
  countryCodes: CountryCode[];
};

export type AccesoDeUsuario = AltaDeUsuario & {
  /** El id en `auth.users` de quien ya entró. */
  authUserId: string;
};

function correoNormalizado(email: string): string {
  return email.trim().toLowerCase();
}

function validar(
  entrada: DatosDeUsuario & { email?: string },
): { ok: true } | { ok: false; campo: string; mensaje: string } {
  if (entrada.email !== undefined && !FORMA_DE_CORREO.test(correoNormalizado(entrada.email))) {
    return { ok: false, campo: "email", mensaje: "Ese correo no tiene forma de correo." };
  }
  if (entrada.name !== undefined && entrada.name.trim().length < 3) {
    return { ok: false, campo: "name", mensaje: "Escribe el nombre completo." };
  }
  if (entrada.countryCodes !== undefined && entrada.countryCodes.length === 0) {
    return { ok: false, campo: "countryCodes", mensaje: "Elige al menos un país." };
  }
  return { ok: true };
}

async function perfilPorCorreo(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      role: true,
      countryCodes: true,
      active: true,
      entraObjectId: true,
      deletedAt: true,
    },
  });
}

/** Da de alta un perfil que se vinculará solo en el primer ingreso. */
export async function crearUsuario(
  session: Session,
  entrada: AltaDeUsuario,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "ADMINISTRAR_USUARIOS")) return falla("AUTORIZACION", SIN_PERMISO);

  const v = validar(entrada);
  if (!v.ok) return falla("VALIDACION", { campo: v.campo, mensaje: v.mensaje });

  const email = correoNormalizado(entrada.email);
  if (await perfilPorCorreo(email)) {
    return falla("VALIDACION", { campo: "email", mensaje: "Ya existe un usuario con ese correo." });
  }

  const nombre = entrada.name.trim();
  const creado = await auditedTransaction(async (tx, audit) => {
    const u = await tx.user.create({
      data: {
        email,
        name: nombre,
        initials: iniciales(nombre),
        role: entrada.role,
        countryCodes: entrada.countryCodes,
        active: true,
      },
      select: { id: true },
    });
    await audit({
      entity: "User",
      entityId: u.id,
      action: "CREAR_USUARIO",
      byUserId: session.userId,
      after: { email, name: nombre, role: entrada.role, countryCodes: entrada.countryCodes },
    });
    return u;
  });

  return ok(creado);
}

/** Edita rol, países, nombre o estado. Solo lo que cambió va a la bitácora. */
export async function editarUsuario(
  session: Session,
  usuario: UsuarioAdministrable,
  cambios: DatosDeUsuario,
): Promise<ResultadoAccion> {
  if (!can(session, "ADMINISTRAR_USUARIOS")) return falla("AUTORIZACION", SIN_PERMISO);

  const v = validar(cambios);
  if (!v.ok) return falla("VALIDACION", { campo: v.campo, mensaje: v.mensaje });

  const esYo = usuario.id === session.userId;
  if (esYo && cambios.active === false) {
    return falla("VALIDACION", {
      campo: "active",
      mensaje: "No puedes quitarte el acceso a ti mismo. Pídele a otro administrador que lo haga.",
    });
  }
  if (esYo && cambios.role !== undefined && cambios.role !== usuario.role) {
    return falla("VALIDACION", {
      campo: "role",
      mensaje: "No puedes cambiar tu propio rol. Pídele a otro administrador que lo haga.",
    });
  }

  const datos: Prisma.UserUpdateInput = {};
  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};

  if (cambios.name !== undefined && cambios.name.trim() !== usuario.name) {
    const nombre = cambios.name.trim();
    datos.name = nombre;
    datos.initials = iniciales(nombre);
    antes.name = usuario.name;
    despues.name = nombre;
  }
  if (cambios.role !== undefined && cambios.role !== usuario.role) {
    datos.role = cambios.role;
    antes.role = usuario.role;
    despues.role = cambios.role;
  }
  if (cambios.countryCodes !== undefined && !mismosPaises(cambios.countryCodes, usuario.countryCodes)) {
    datos.countryCodes = cambios.countryCodes;
    antes.countryCodes = usuario.countryCodes;
    despues.countryCodes = cambios.countryCodes;
  }
  if (cambios.active !== undefined && cambios.active !== usuario.active) {
    datos.active = cambios.active;
    antes.active = usuario.active;
    despues.active = cambios.active;
  }

  if (Object.keys(datos).length === 0) return ok(null);

  await auditedTransaction(async (tx, audit) => {
    await tx.user.update({ where: { id: usuario.id }, data: datos });
    await audit({
      entity: "User",
      entityId: usuario.id,
      action: "EDITAR_USUARIO",
      byUserId: session.userId,
      before: antes as Prisma.InputJsonValue,
      after: despues as Prisma.InputJsonValue,
    });
  });

  return ok(null);
}

/**
 * Da acceso a quien ya entró con Microsoft y no tiene perfil.
 *
 * Si ya existe un perfil con ese correo sin vincular, lo vincula y le pone el
 * rol y los países indicados, en vez de crear un segundo perfil: el correo es
 * único y la persona es la misma.
 */
export async function darAcceso(
  session: Session,
  entrada: AccesoDeUsuario,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "ADMINISTRAR_USUARIOS")) return falla("AUTORIZACION", SIN_PERMISO);

  const v = validar(entrada);
  if (!v.ok) return falla("VALIDACION", { campo: v.campo, mensaje: v.mensaje });

  const email = correoNormalizado(entrada.email);

  const yaVinculado = await prisma.user.findFirst({
    where: { entraObjectId: entrada.authUserId },
    select: { id: true },
  });
  if (yaVinculado) return falla("CONFLICTO", "Ese ingreso ya está vinculado a un perfil.");

  const existente = await perfilPorCorreo(email);
  if (existente?.entraObjectId) {
    return falla("CONFLICTO", "Ya existe un perfil con ese correo vinculado a otro ingreso.");
  }
  if (existente?.deletedAt) {
    return falla("CONFLICTO", "Existe un perfil dado de baja con ese correo.");
  }

  if (existente) {
    await auditedTransaction(async (tx, audit) => {
      await tx.user.update({
        where: { id: existente.id },
        data: {
          entraObjectId: entrada.authUserId,
          role: entrada.role,
          countryCodes: entrada.countryCodes,
          active: true,
        },
      });
      await audit({
        entity: "User",
        entityId: existente.id,
        action: "EDITAR_USUARIO",
        byUserId: session.userId,
        before: {
          entraObjectId: null,
          role: existente.role,
          countryCodes: existente.countryCodes,
          active: existente.active,
        },
        after: {
          entraObjectId: entrada.authUserId,
          role: entrada.role,
          countryCodes: entrada.countryCodes,
          active: true,
        },
      });
    });
    return ok({ id: existente.id });
  }

  const nombre = entrada.name.trim();
  const creado = await auditedTransaction(async (tx, audit) => {
    const u = await tx.user.create({
      data: {
        email,
        name: nombre,
        initials: iniciales(nombre),
        role: entrada.role,
        countryCodes: entrada.countryCodes,
        active: true,
        entraObjectId: entrada.authUserId,
      },
      select: { id: true },
    });
    await audit({
      entity: "User",
      entityId: u.id,
      action: "CREAR_USUARIO",
      byUserId: session.userId,
      after: {
        email,
        name: nombre,
        role: entrada.role,
        countryCodes: entrada.countryCodes,
        entraObjectId: entrada.authUserId,
      },
    });
    return u;
  });

  return ok(creado);
}

function mismosPaises(a: CountryCode[], b: CountryCode[]): boolean {
  if (a.length !== b.length) return false;
  const ordenA = [...a].sort();
  const ordenB = [...b].sort();
  return ordenA.every((p, i) => p === ordenB[i]);
}
