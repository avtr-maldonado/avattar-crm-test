import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { fijarObjetivo } from "@/lib/domain/objetivo";
import { aniosConObjetivos, avanceDeObjetivos } from "@/lib/scope/objetivos";
import { historiasDeEtapas } from "@/lib/scope/funnel";

/**
 * Objetivos (P-08) y el embudo de P-01, contra la base real.
 *
 * Lo que afirman:
 *
 * - El tablero de objetivos respeta el alcance: un vendedor ve **solo su
 *   renglón** (§2.3, AC-29), y el total del equipo sale de sumar filas
 *   visibles, nunca de una consulta que ignore el alcance (§10.3).
 * - Fijar una cuota es un acto administrativo, validado y auditado.
 * - El embudo mide dentro del alcance: un vendedor mide su propio proceso.
 *
 * Usan un año fiscal lejano (2099) para no tocar las cuotas del escenario §15,
 * y limpian lo que crean.
 */
const ANIO_DE_PRUEBA = 2099;

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

afterAll(async () => {
  const creados = await prisma.objective.findMany({
    where: { fiscalYear: ANIO_DE_PRUEBA },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: "Objective", entityId: { in: creados.map((o) => o.id) } },
  });
  await prisma.objective.deleteMany({ where: { fiscalYear: ANIO_DE_PRUEBA } });
});

describe("avanceDeObjetivos · alcance por rol", () => {
  it("dirección ve el renglón de cada persona con cuota en la oficina", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const enBase = await prisma.objective.findMany({
      where: { countryCode: "MX", fiscalYear: 2026 },
      select: { userId: true },
      distinct: ["userId"],
    });

    const renglones = await avanceDeObjetivos(direccion, {
      fiscalYear: 2026,
      pais: "MX",
      fiscalYearStartMonth: 1,
    });

    const conCuota = renglones.filter((r) => r.tieneCuota);
    expect(conCuota).toHaveLength(enBase.length);
  });

  it("un vendedor ve solo su propio renglón (§2.3)", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const renglones = await avanceDeObjetivos(paulina, {
      fiscalYear: 2026,
      pais: "MX",
      fiscalYearStartMonth: 1,
    });

    expect(renglones.every((r) => r.usuario.id === paulina.userId)).toBe(true);
  });

  it("la cuota trimestral cae en el índice de su trimestre", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const fila = await prisma.objective.findFirstOrThrow({
      where: { countryCode: "MX", fiscalYear: 2026, periodType: "TRIMESTRAL", quarter: 3 },
      select: { userId: true, revenueQuota: true },
    });

    const renglones = await avanceDeObjetivos(direccion, {
      fiscalYear: 2026,
      pais: "MX",
      fiscalYearStartMonth: 1,
    });
    const suyo = renglones.find((r) => r.usuario.id === fila.userId);

    expect(suyo?.cuotaVenta[2]?.toString()).toBe(fila.revenueQuota.toString());
  });

  it("una oficina sin objetivos devuelve una lista vacía, no un error", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const renglones = await avanceDeObjetivos(direccion, {
      fiscalYear: 2026,
      pais: "CL",
      fiscalYearStartMonth: 1,
    });

    expect(renglones.filter((r) => r.tieneCuota)).toHaveLength(0);
  });

  it("el selector de años siempre ofrece el año en curso, aunque no tenga cuotas", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const anios = await aniosConObjetivos(direccion, "CL", 2026);
    expect(anios).toContain(2026);
  });
});

describe("fijarObjetivo · acto administrativo", () => {
  it("un gerente de país no puede fijar cuotas", async () => {
    // Fijaría la cuota de su propio equipo, contra la que a él lo miden.
    const jorge = await sesionDe("jm@avattar.com");
    const paulina = await prisma.user.findUniqueOrThrow({ where: { email: "pe@avattar.com" } });

    const r = await fijarObjetivo(jorge, {
      userId: paulina.id,
      countryCode: "MX",
      fiscalYear: ANIO_DE_PRUEBA,
      periodType: "TRIMESTRAL",
      quarter: 1,
      revenueQuota: "100000",
      grossProfitQuota: "30000",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("AUTORIZACION");
  });

  it("rechaza una utilidad mayor que la venta", async () => {
    const admin = await sesionDe("as@avattar.com");
    const paulina = await prisma.user.findUniqueOrThrow({ where: { email: "pe@avattar.com" } });

    const r = await fijarObjetivo(admin, {
      userId: paulina.id,
      countryCode: "MX",
      fiscalYear: ANIO_DE_PRUEBA,
      periodType: "TRIMESTRAL",
      quarter: 1,
      revenueQuota: "100000",
      grossProfitQuota: "120000",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("VALIDACION");
      expect(r.problemas[0]?.campo).toBe("grossProfitQuota");
    }
  });

  it("rechaza cargar una cuota a quien no opera en ese país (AC-05)", async () => {
    const admin = await sesionDe("as@avattar.com");
    const paulina = await prisma.user.findUniqueOrThrow({ where: { email: "pe@avattar.com" } });

    const r = await fijarObjetivo(admin, {
      userId: paulina.id,
      countryCode: "CL",
      fiscalYear: ANIO_DE_PRUEBA,
      periodType: "TRIMESTRAL",
      quarter: 1,
      revenueQuota: "100000",
      grossProfitQuota: "30000",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("userId");
  });

  it("crea, reemplaza por periodo y deja bitácora (INV-09)", async () => {
    const admin = await sesionDe("as@avattar.com");
    const paulina = await prisma.user.findUniqueOrThrow({ where: { email: "pe@avattar.com" } });
    const entrada = {
      userId: paulina.id,
      countryCode: "MX" as const,
      fiscalYear: ANIO_DE_PRUEBA,
      periodType: "TRIMESTRAL" as const,
      quarter: 2,
    };

    const primera = await fijarObjetivo(admin, {
      ...entrada,
      revenueQuota: "100000",
      grossProfitQuota: "30000",
    });
    expect(primera.ok).toBe(true);

    const segunda = await fijarObjetivo(admin, {
      ...entrada,
      revenueQuota: "250000",
      grossProfitQuota: "75000",
    });
    expect(segunda.ok).toBe(true);

    // Reemplaza, no duplica: la unicidad es (usuario, año, tipo, trimestre).
    const filas = await prisma.objective.findMany({
      where: { userId: paulina.id, fiscalYear: ANIO_DE_PRUEBA, quarter: 2 },
      select: { id: true, revenueQuota: true },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.revenueQuota.toString()).toBe("250000");

    const bitacora = await prisma.auditLog.count({
      where: { entity: "Objective", entityId: filas[0]!.id, action: "FIJAR_OBJETIVO" },
    });
    expect(bitacora).toBe(2);
  });
});

describe("historiasDeEtapas · insumo del embudo", () => {
  it("devuelve una historia por oportunidad alcanzada, con su entrada inicial", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const enBase = await prisma.opportunity.count({
      where: { deletedAt: null, countryCode: "MX" },
    });

    const historias = await historiasDeEtapas(direccion, {
      desde: new Date("2000-01-01T00:00:00Z"),
      where: { countryCode: "MX" },
    });

    expect(historias).toHaveLength(enBase);
    // Con la ventana abierta, toda oportunidad entró al menos a una etapa: la
    // suya. Sin reconstruir el alta, las que nunca se movieron darían cero.
    expect(historias.every((h) => h.entroEnPosiciones.length > 0)).toBe(true);
    expect(historias.every((h) => h.posicionMaxima >= 1)).toBe(true);
  });

  it("un vendedor mide su propio embudo, no el de la oficina (INV-01)", async () => {
    const [direccion, paulina] = await Promise.all([
      sesionDe("dc@avattar.com"),
      sesionDe("pe@avattar.com"),
    ]);
    const ventana = { desde: new Date("2000-01-01T00:00:00Z") };

    const [todas, suyas] = await Promise.all([
      historiasDeEtapas(direccion, ventana),
      historiasDeEtapas(paulina, ventana),
    ]);

    expect(suyas.length).toBeLessThanOrEqual(todas.length);
    const propias = await prisma.opportunity.count({
      where: { deletedAt: null, ownerId: paulina.userId },
    });
    expect(suyas).toHaveLength(propias);
  });

  it("la ventana recorta quién cuenta, sin perder lo más lejos que llegó", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const manana = new Date(Date.now() + 86_400_000);

    const historias = await historiasDeEtapas(direccion, { desde: manana });

    // Nadie entró a una etapa después de mañana…
    expect(historias.every((h) => h.entroEnPosiciones.length === 0)).toBe(true);
    // …pero la historia completa sigue sabiendo hasta dónde llegaron.
    expect(historias.some((h) => h.posicionMaxima >= 1)).toBe(true);
  });
});
