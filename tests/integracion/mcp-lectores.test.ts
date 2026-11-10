import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { actividadesDeOportunidad, actividadPorId, buscarOportunidades, etapasPorNombre, usuariosPorNombre } from "@/lib/scope/mcp";

/** Los lectores del MCP (§61) recortan por alcance y paginan sin repetir ni saltar. */
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

const creadas: string[] = [];
let jorge: Session;
let otroVendedor: Session;
let tipo: string;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
  const otro = await prisma.user.findFirstOrThrow({
    where: { role: "VENDEDOR", active: true, deletedAt: null, email: { not: "jm@avattar.com" } },
    select: { email: true },
  });
  otroVendedor = await sesionDe(otro.email);
  tipo = (await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: creadas } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

async function unaOportunidad(nombre: string) {
  const [organizacion, pipeline, politica] = await Promise.all([
    prisma.organization.findFirstOrThrow({ where: { countryCode: "MX", deletedAt: null }, select: { id: true } }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
    getCommercialPolicy("MX"),
  ]);
  const r = await crearOportunidad(
    jorge,
    { name: nombre, organizationId: organizacion.id, pipelineId: pipeline.id, estimatedAmount: "80000.0000", expectedCloseDate: new Date("2026-12-20"), businessType: "NUEVO" },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad");
  creadas.push(r.datos.id);
  return r.datos;
}

describe("lectores del MCP", () => {
  it("un vendedor no obtiene la nota de la actividad de otro", async () => {
    const o = await unaOportunidad("MCP lectores · nota ajena");
    const a = await prisma.activity.create({
      data: { typeId: tipo, subject: "Llamada", startsAt: new Date("2026-11-09T17:00:00Z"), opportunityId: o.id, userId: jorge.userId, notes: "secreto" },
      select: { id: true },
    });
    expect(await actividadPorId(jorge, a.id)).toMatchObject({ id: a.id, notes: "secreto" });
    expect(await actividadPorId(otroVendedor, a.id)).toBeNull();
  });

  it("pagina las actividades con cursor sin repetir ni saltar, incluso con la misma fecha", async () => {
    const o = await unaOportunidad("MCP lectores · paginación");
    const misma = new Date("2026-11-09T17:00:00Z");
    for (let i = 0; i < 5; i++) {
      await prisma.activity.create({
        data: { typeId: tipo, subject: `A${i}`, startsAt: i < 3 ? misma : new Date(misma.getTime() - i * 3_600_000), opportunityId: o.id, userId: jorge.userId },
      });
    }
    const vistas: string[] = [];
    let cursor: { startsAt: Date; id: string } | null = null;
    for (let pagina = 0; pagina < 10; pagina++) {
      const filas = await actividadesDeOportunidad(jorge, o.id, { take: 2, cursor });
      const deEsta = filas.slice(0, 2);
      vistas.push(...deEsta.map((f) => f.id));
      if (filas.length <= 2) break;
      const ultima = deEsta.at(-1)!;
      cursor = { startsAt: ultima.startsAt, id: ultima.id };
    }
    expect(new Set(vistas).size).toBe(5);
    expect(vistas).toHaveLength(5);
  });

  it("buscarOportunidades trae una de más para saber si hay otra página, y respeta el alcance", async () => {
    await unaOportunidad("MCP lectores · búsqueda");
    const deJorge = await buscarOportunidades(jorge, { status: "ABIERTA" }, { take: 1, skip: 0 });
    expect(deJorge.length).toBeLessThanOrEqual(2);
    expect("grossProfit" in (deJorge[0] ?? {})).toBe(false);
    // El alcance se mide con un vendedor: solo ve lo suyo, con o sin filtro.
    const delVendedor = await buscarOportunidades(otroVendedor, {}, { take: 25, skip: 0 });
    expect(delVendedor.every((o) => o.owner.id === otroVendedor.userId)).toBe(true);
  });

  it("resuelve etapa y responsable por nombre dentro de los países de la sesión", async () => {
    const etapas = await etapasPorNombre(jorge, "negociación");
    expect(etapas.length).toBeGreaterThan(0);
    expect(await etapasPorNombre(jorge, "Etapa inexistente")).toEqual([]);
    const usuarios = await usuariosPorNombre(jorge, "jm@avattar.com");
    expect(usuarios.map((u) => u.id)).toContain(jorge.userId);
  });
});
