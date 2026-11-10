import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { listInsights } from "@/lib/scope/insights";

/**
 * Recomendaciones de una oportunidad (MCP, decisiones §61): se leen con el
 * alcance de la oportunidad, descendentes por fecha.
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

const creadas: string[] = [];
let jorge: Session;
let otroVendedor: Session;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
  const otro = await prisma.user.findFirstOrThrow({
    where: { role: "VENDEDOR", active: true, deletedAt: null, email: { not: "jm@avattar.com" } },
    select: { email: true },
  });
  otroVendedor = await sesionDe(otro.email);
});

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.opportunityInsight.deleteMany({ where: { opportunityId: { in: creadas } } });
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
    {
      name: nombre,
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "80000.0000",
      expectedCloseDate: new Date("2026-12-20"),
      businessType: "NUEVO",
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad");
  creadas.push(r.datos.id);
  return r.datos.id;
}

describe("listInsights · recomendaciones al alcance (§61)", () => {
  it("una oportunidad nueva no tiene recomendaciones", async () => {
    const id = await unaOportunidad("MCP · sin recomendaciones");
    expect(await listInsights(jorge, id)).toEqual([]);
  });

  it("devuelve las filas descendentes por fecha, con quién y con qué modelo", async () => {
    const id = await unaOportunidad("MCP · dos recomendaciones");
    await prisma.opportunityInsight.create({
      data: {
        opportunityId: id,
        payload: { estado: { etiqueta: "EN_RIESGO", resumen: "primera" } },
        sourceActivityIds: [],
        model: "claude-fable-5-1",
        generatedById: jorge.userId,
        generatedAt: new Date("2026-11-01T10:00:00Z"),
      },
    });
    await prisma.opportunityInsight.create({
      data: {
        opportunityId: id,
        payload: { estado: { etiqueta: "SALUDABLE", resumen: "segunda" } },
        sourceActivityIds: [],
        model: null,
        generatedById: jorge.userId,
        generatedAt: new Date("2026-11-02T10:00:00Z"),
      },
    });

    const filas = await listInsights(jorge, id);
    expect(filas.map((f) => (f.payload as { estado: { resumen: string } }).estado.resumen)).toEqual(["segunda", "primera"]);
    expect(filas[0]).toMatchObject({ model: null, generatedBy: { id: jorge.userId } });
  });

  it("fuera del alcance no devuelve nada, ni confirma que exista", async () => {
    const id = await unaOportunidad("MCP · de Jorge");
    await prisma.opportunityInsight.create({
      data: { opportunityId: id, payload: {}, sourceActivityIds: [], generatedById: jorge.userId },
    });
    expect(await listInsights(otroVendedor, id)).toEqual([]);
  });
});
