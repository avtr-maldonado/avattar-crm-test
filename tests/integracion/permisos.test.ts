import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { cambiarPermiso } from "@/lib/domain/permisos";

/**
 * La matriz de roles y permisos se edita desde Administración · decisiones §40.
 *
 * Solo el rol ADMINISTRADOR la toca, y su propia columna no se edita desde la
 * pantalla: es la llave de la casa. Cada cambio queda en la bitácora e
 * invalida la caché de permisos. Las pruebas devuelven cada celda a su valor.
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
    limits: Object.fromEntries(permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null])),
  };
}

async function celda(role: "VENDEDOR" | "GERENTE_PAIS" | "ADMINISTRADOR", code: string) {
  return prisma.rolePermission.findFirstOrThrow({
    where: { role, permission: { code } },
    select: { granted: true, limitValue: true },
  });
}

let admin: Session;
let gerente: Session;
let original: { granted: boolean; limitValue: { toString(): string } | null };
let originalTope: { granted: boolean; limitValue: { toString(): string } | null };

beforeAll(async () => {
  [admin, gerente] = await Promise.all([sesionDe("as@avattar.com"), sesionDe("jm@avattar.com")]);
  original = await celda("VENDEDOR", "VER_ANALISIS");
  originalTope = await celda("GERENTE_PAIS", "AUTORIZAR_DESCUENTO");
});

afterAll(async () => {
  await cambiarPermiso(admin, { role: "VENDEDOR", code: "VER_ANALISIS", granted: original.granted, limite: original.limitValue?.toString() ?? null });
  await cambiarPermiso(admin, {
    role: "GERENTE_PAIS",
    code: "AUTORIZAR_DESCUENTO",
    granted: originalTope.granted,
    limite: originalTope.limitValue?.toString() ?? null,
  });
  await prisma.auditLog.deleteMany({ where: { action: "EDITAR_PERMISO", byUserId: admin.userId, entityId: { in: ["VENDEDOR:VER_ANALISIS", "GERENTE_PAIS:AUTORIZAR_DESCUENTO"] } } });
  await prisma.$disconnect();
});

describe("cambiarPermiso · la matriz como dato editable (decisiones §40)", () => {
  it("Administración concede y revoca una celda, y cada cambio queda en la bitácora", async () => {
    expect(original.granted).toBe(false);
    const concede = await cambiarPermiso(admin, { role: "VENDEDOR", code: "VER_ANALISIS", granted: true });
    expect(concede.ok).toBe(true);
    expect((await celda("VENDEDOR", "VER_ANALISIS")).granted).toBe(true);

    const revoca = await cambiarPermiso(admin, { role: "VENDEDOR", code: "VER_ANALISIS", granted: false });
    expect(revoca.ok).toBe(true);
    expect((await celda("VENDEDOR", "VER_ANALISIS")).granted).toBe(false);

    const rastro = await prisma.auditLog.findMany({
      where: { action: "EDITAR_PERMISO", entityId: "VENDEDOR:VER_ANALISIS", byUserId: admin.userId },
      orderBy: { at: "asc" },
      select: { before: true, after: true },
    });
    expect(rastro.length).toBeGreaterThanOrEqual(2);
    expect(rastro.at(-2)!.after).toMatchObject({ granted: true });
    expect(rastro.at(-1)!.after).toMatchObject({ granted: false });
  });

  it("el tope de autorización se captura como fracción y se valida", async () => {
    expect(originalTope.limitValue?.toString()).toBe("0.3");
    const baja = await cambiarPermiso(admin, { role: "GERENTE_PAIS", code: "AUTORIZAR_DESCUENTO", granted: true, limite: "0.25" });
    expect(baja.ok).toBe(true);
    expect((await celda("GERENTE_PAIS", "AUTORIZAR_DESCUENTO")).limitValue?.toString()).toBe("0.25");

    expect(await cambiarPermiso(admin, { role: "GERENTE_PAIS", code: "AUTORIZAR_DESCUENTO", granted: true, limite: "1.5" })).toMatchObject({
      ok: false,
      motivo: "VALIDACION",
    });
    // Un permiso sin tope no acepta uno.
    expect(await cambiarPermiso(admin, { role: "VENDEDOR", code: "VER_ANALISIS", granted: true, limite: "0.1" })).toMatchObject({
      ok: false,
      motivo: "VALIDACION",
    });
  });

  it("un gerente no edita la matriz, y la columna de Administración no se toca desde aquí", async () => {
    expect(await cambiarPermiso(gerente, { role: "VENDEDOR", code: "VER_ANALISIS", granted: true })).toMatchObject({
      ok: false,
      motivo: "AUTORIZACION",
    });
    expect(await cambiarPermiso(admin, { role: "ADMINISTRADOR", code: "VER_ANALISIS", granted: false })).toMatchObject({
      ok: false,
      motivo: "VALIDACION",
    });
    expect(await cambiarPermiso(admin, { role: "VENDEDOR", code: "NO_EXISTE", granted: true })).toMatchObject({
      ok: false,
      motivo: "VALIDACION",
    });
  });
});
