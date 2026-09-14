import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { crearUsuario, darAcceso, editarUsuario } from "@/lib/domain/usuario";
import { autenticadosSinPerfil, getUsuario, listUsuarios } from "@/lib/scope/usuarios";

/**
 * Módulo de usuarios · alta previa, edición y acceso a quien ya entró.
 *
 * Lo que afirman estas pruebas:
 *
 * - El alta previa deja el perfil listo para el primer ingreso: correo en
 *   minúsculas, iniciales derivadas, sin vínculo todavía, y con bitácora.
 * - Quien ya entró con Microsoft y no tiene perfil aparece en una lista, y
 *   «dar acceso» le crea el perfil ya vinculado al id de autenticación.
 * - Solo quien tiene `ADMINISTRAR_USUARIOS` puede hacer cualquiera de las tres.
 * - Nadie se quita a sí mismo el acceso.
 *
 * Dependen de los usuarios del seed y de la clave de servicio en `.env.local`.
 * Crean un usuario de autenticación de prueba y lo borran al final.
 */
async function sesionDe(correo: string): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  const permisos = await prisma.rolePermission.findMany({
    where: { role: u.role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos.map((p) => p.permission.code)),
    limits: Object.fromEntries(
      permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null]),
    ),
  };
}

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let admin: Session; // ADMINISTRADOR
let jorge: Session; // GERENTE_PAIS · sin ADMINISTRAR_USUARIOS
const perfilesCreados: string[] = [];
let authUserId: string | null = null;

const sufijo = Date.now().toString(36);
const correo = (base: string) => `prueba-${base}-${sufijo}@avattar.com`;

beforeAll(async () => {
  [admin, jorge] = await Promise.all([sesionDe("as@avattar.com"), sesionDe("jm@avattar.com")]);
});

afterAll(async () => {
  if (perfilesCreados.length) {
    await prisma.auditLog.deleteMany({ where: { entity: "User", entityId: { in: perfilesCreados } } });
    await prisma.user.deleteMany({ where: { id: { in: perfilesCreados } } });
  }
  if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId);
});

describe("crearUsuario · el alta previa deja el perfil listo para el primer ingreso", () => {
  it("guarda el correo en minúsculas, deriva las iniciales y deja el vínculo pendiente", async () => {
    const r = await crearUsuario(admin, {
      email: correo("Alta").toUpperCase(),
      name: "Renata Solís Prueba",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    perfilesCreados.push(r.datos.id);

    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { email: true, initials: true, entraObjectId: true, active: true, role: true, countryCodes: true },
    });
    expect(fila.email).toBe(correo("Alta").toLowerCase());
    expect(fila.initials).toBe("RS");
    expect(fila.entraObjectId).toBeNull();
    expect(fila.active).toBe(true);
    expect(fila.role).toBe("VENDEDOR");
    expect(fila.countryCodes).toEqual(["MX"]);
  });

  it("deja bitácora en la misma transacción (INV-09)", async () => {
    const r = await crearUsuario(admin, {
      email: correo("bitacora"),
      name: "Tomás Vega Prueba",
      role: "PREVENTA",
      countryCodes: ["MX"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    perfilesCreados.push(r.datos.id);

    const traza = await prisma.auditLog.findFirst({
      where: { entity: "User", entityId: r.datos.id, action: "CREAR_USUARIO" },
      select: { byUserId: true, after: true },
    });
    expect(traza?.byUserId).toBe(admin.userId);
    expect(traza?.after).toMatchObject({ role: "PREVENTA", countryCodes: ["MX"] });
  });

  it("rechaza un correo que ya existe, sin distinguir mayúsculas", async () => {
    const primero = await crearUsuario(admin, {
      email: correo("duplicado"),
      name: "Primera Persona",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    if (primero.ok) perfilesCreados.push(primero.datos.id);

    const segundo = await crearUsuario(admin, {
      email: correo("duplicado").toUpperCase(),
      name: "Segunda Persona",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(segundo.ok).toBe(false);
    if (segundo.ok) return;
    expect(segundo.motivo).toBe("VALIDACION");
    expect(segundo.problemas[0]?.campo).toBe("email");
  });

  it("exige al menos un país y un correo con forma de correo", async () => {
    const sinPais = await crearUsuario(admin, {
      email: correo("sinpais"),
      name: "Sin País",
      role: "VENDEDOR",
      countryCodes: [],
    });
    expect(!sinPais.ok && sinPais.problemas[0]?.campo === "countryCodes").toBe(true);

    const malCorreo = await crearUsuario(admin, {
      email: "no-es-correo",
      name: "Mal Correo",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(!malCorreo.ok && malCorreo.problemas[0]?.campo === "email").toBe(true);
  });

  it("solo quien tiene ADMINISTRAR_USUARIOS", async () => {
    const r = await crearUsuario(jorge, {
      email: correo("gerente"),
      name: "Intento de Gerente",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("AUTORIZACION");
  });
});

describe("editarUsuario · rol, países y estado, con bitácora", () => {
  it("cambia rol y países y anota antes y después", async () => {
    const alta = await crearUsuario(admin, {
      email: correo("editar"),
      name: "Editable Prueba",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;
    perfilesCreados.push(alta.datos.id);

    const usuario = await getUsuario(admin, alta.datos.id);
    expect(usuario).not.toBeNull();
    const r = await editarUsuario(admin, usuario!, { role: "GERENTE_PAIS", countryCodes: ["MX", "CO"] });
    expect(r.ok).toBe(true);

    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: alta.datos.id },
      select: { role: true, countryCodes: true },
    });
    expect(fila.role).toBe("GERENTE_PAIS");
    expect(fila.countryCodes).toEqual(["MX", "CO"]);

    const traza = await prisma.auditLog.findFirst({
      where: { entity: "User", entityId: alta.datos.id, action: "EDITAR_USUARIO" },
      select: { before: true, after: true },
    });
    expect(traza?.before).toMatchObject({ role: "VENDEDOR" });
    expect(traza?.after).toMatchObject({ role: "GERENTE_PAIS" });
  });

  it("nadie se quita a sí mismo el acceso ni el rol de administrador", async () => {
    const yo = await getUsuario(admin, admin.userId);
    expect(yo).not.toBeNull();

    const desactivarme = await editarUsuario(admin, yo!, { active: false });
    expect(desactivarme.ok).toBe(false);

    const degradarme = await editarUsuario(admin, yo!, { role: "VENDEDOR" });
    expect(degradarme.ok).toBe(false);
  });
});

describe("darAcceso · quien ya entró con Microsoft y no tiene perfil", () => {
  it("aparece en la lista, y al darle acceso queda vinculado y sale de ella", async () => {
    const creado = await supabaseAdmin.auth.admin.createUser({
      email: correo("sinperfil"),
      email_confirm: true,
      user_metadata: { full_name: "Persona Sin Perfil" },
    });
    expect(creado.error).toBeNull();
    authUserId = creado.data.user!.id;

    const antes = await autenticadosSinPerfil(admin);
    const pendiente = antes.find((p) => p.authUserId === authUserId);
    expect(pendiente).toBeDefined();
    expect(pendiente?.email).toBe(correo("sinperfil"));
    expect(pendiente?.name).toBe("Persona Sin Perfil");

    const r = await darAcceso(admin, {
      authUserId: authUserId!,
      email: pendiente!.email,
      name: pendiente!.name ?? "Persona Sin Perfil",
      role: "VENDEDOR",
      countryCodes: ["CO"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    perfilesCreados.push(r.datos.id);

    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { entraObjectId: true, email: true, role: true, countryCodes: true, active: true },
    });
    // El vínculo queda hecho desde aquí: su siguiente ingreso ya entra.
    expect(fila.entraObjectId).toBe(authUserId);
    expect(fila.email).toBe(correo("sinperfil"));
    expect(fila.role).toBe("VENDEDOR");
    expect(fila.countryCodes).toEqual(["CO"]);
    expect(fila.active).toBe(true);

    const despues = await autenticadosSinPerfil(admin);
    expect(despues.some((p) => p.authUserId === authUserId)).toBe(false);

    // Y aparece en la lista de perfiles.
    const perfiles = await listUsuarios(admin);
    expect(perfiles.some((u) => u.id === r.datos.id && u.vinculado)).toBe(true);
  });

  it("si ya había un perfil con ese correo sin vincular, lo vincula en vez de duplicarlo", async () => {
    const previo = await crearUsuario(admin, {
      email: correo("previo"),
      name: "Perfil Previo",
      role: "VENDEDOR",
      countryCodes: ["MX"],
    });
    expect(previo.ok).toBe(true);
    if (!previo.ok) return;
    perfilesCreados.push(previo.datos.id);

    const r = await darAcceso(admin, {
      authUserId: "auth-id-de-prueba-" + sufijo,
      email: correo("previo").toUpperCase(),
      name: "Perfil Previo",
      role: "GERENTE_PAIS",
      countryCodes: ["MX"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.id).toBe(previo.datos.id);

    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: previo.datos.id },
      select: { entraObjectId: true, role: true },
    });
    expect(fila.entraObjectId).toBe("auth-id-de-prueba-" + sufijo);
    expect(fila.role).toBe("GERENTE_PAIS");
  });

  it("solo quien tiene ADMINISTRAR_USUARIOS ve la lista", async () => {
    await expect(autenticadosSinPerfil(jorge)).rejects.toThrow();
    await expect(listUsuarios(jorge)).rejects.toThrow();
  });
});
