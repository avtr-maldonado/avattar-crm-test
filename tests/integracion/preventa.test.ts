import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { getOpportunity, listOpportunities } from "@/lib/scope/opportunities";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { cambiarEtapa, crearOportunidad, editarOportunidad } from "@/lib/domain/opportunity";
import { preventaDe } from "@/lib/domain/opportunityAccess";
import { registrarActividad } from "@/lib/domain/activity";
import { guardarComponenteMeddic } from "@/lib/domain/meddicService";
import { PESOS_POR_OMISION } from "@/lib/domain/meddic";

/**
 * El responsable de preventa · decisiones §39.
 *
 * Un usuario con rol PREVENTA ve las oportunidades donde está asignado como
 * apoyo (`OpportunitySupport`, que ya recortaba el alcance), les agrega
 * actividades y no las edita; tampoco crea oportunidades. La asignación se
 * hace desde el alta y desde la edición, por el propietario o Gerencia, y
 * queda en la bitácora.
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

async function umbrales() {
  const p = await getCommercialPolicy("MX");
  return { meddicMinToClosing: Number(p.meddicMinToClosing), meddicMinToCommit: Number(p.meddicMinToCommit) };
}

async function altaBase() {
  const [organizacion, pipeline] = await Promise.all([
    prisma.organization.findFirstOrThrow({ where: { countryCode: "MX", deletedAt: null }, select: { id: true } }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
  ]);
  return {
    organizationId: organizacion.id,
    pipelineId: pipeline.id,
    estimatedAmount: "100000.0000",
    expectedCloseDate: new Date("2026-12-15"),
    businessType: "NUEVO" as const,
  };
}

let admin: Session;
let ivan: Session;
let paulina: Session;

beforeAll(async () => {
  [admin, ivan, paulina] = await Promise.all([sesionDe("as@avattar.com"), sesionDe("ic@avattar.com"), sesionDe("pe@avattar.com")]);
  expect(ivan.role).toBe("PREVENTA");
});

afterAll(async () => {
  if (creadas.length > 0) {
    await prisma.opportunitySupport.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: creadas } } });
    await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.meddicComponentAssessment.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
  }
  await prisma.$disconnect();
});

describe("responsable de preventa · decisiones §39", () => {
  it("un preventa no crea oportunidades", async () => {
    const r = await crearOportunidad(ivan, { ...(await altaBase()), name: "Preventa · intento de alta" }, await umbrales());
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("al crear con responsable de preventa, el preventa la ve, la encuentra en su tablero y el detalle lo nombra", async () => {
    const r = await crearOportunidad(
      admin,
      { ...(await altaBase()), name: "Preventa · con responsable", presalesUserId: ivan.userId },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    expect(await getOpportunity(ivan, r.datos.id)).not.toBeNull();
    expect((await listOpportunities(ivan)).some((o) => o.id === r.datos.id)).toBe(true);
    const detalle = await getOpportunityDetail(admin, r.datos.id);
    expect(preventaDe(detalle!)?.id).toBe(ivan.userId);
  });

  it("solo alguien con rol de preventa puede ser responsable de preventa", async () => {
    const r = await crearOportunidad(
      admin,
      { ...(await altaBase()), name: "Preventa · responsable inválido", presalesUserId: paulina.userId },
      await umbrales(),
    );
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("presalesUserId");
  });

  it("editar asigna y retira al preventa con bitácora; el preventa no edita ni mueve", async () => {
    const alta = await crearOportunidad(admin, { ...(await altaBase()), name: "Preventa · asignación en edición" }, await umbrales());
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;
    const id = alta.datos.id;
    creadas.push(id);
    expect(await getOpportunity(ivan, id)).toBeNull();

    let detalle = (await getOpportunityDetail(admin, id))!;
    const asigna = await editarOportunidad(admin, detalle, { presalesUserId: ivan.userId }, await umbrales());
    expect(asigna.ok).toBe(true);
    expect(await getOpportunity(ivan, id)).not.toBeNull();

    detalle = (await getOpportunityDetail(ivan, id))!;
    expect(await editarOportunidad(ivan, detalle, { name: "La cambió preventa" }, await umbrales())).toMatchObject({
      ok: false,
      motivo: "AUTORIZACION",
    });
    const siguiente = detalle.pipeline.stages.find((e) => e.position === detalle.stage.position + 1)!;
    expect(await cambiarEtapa(ivan, detalle, { toStageId: siguiente.id }, await umbrales())).toMatchObject({
      ok: false,
      motivo: "AUTORIZACION",
    });
    expect(
      await guardarComponenteMeddic(ivan, detalle, { component: "METRICAS", status: "PARCIAL", evidence: "Lo dijo el cliente." }, PESOS_POR_OMISION),
    ).toMatchObject({ ok: false, motivo: "AUTORIZACION" });

    detalle = (await getOpportunityDetail(admin, id))!;
    const retira = await editarOportunidad(admin, detalle, { presalesUserId: null }, await umbrales());
    expect(retira.ok).toBe(true);
    expect(await prisma.opportunitySupport.count({ where: { opportunityId: id } })).toBe(0);
    expect(await getOpportunity(ivan, id)).toBeNull();

    const rastro = await prisma.auditLog.findMany({
      where: { entity: "Opportunity", entityId: id, action: "CAMBIAR_PREVENTA" },
      orderBy: { at: "asc" },
      select: { before: true, after: true },
    });
    expect(rastro).toHaveLength(2);
    expect(rastro[0]!.after).toMatchObject({ presalesUserId: ivan.userId });
    expect(rastro[1]!.after).toMatchObject({ presalesUserId: null });
  });

  it("el preventa agrega actividades a la oportunidad asignada", async () => {
    const alta = await crearOportunidad(
      admin,
      { ...(await altaBase()), name: "Preventa · actividad", presalesUserId: ivan.userId },
      await umbrales(),
    );
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;
    creadas.push(alta.datos.id);

    const tipo = await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const detalle = (await getOpportunityDetail(ivan, alta.datos.id))!;
    const r = await registrarActividad(ivan, detalle, {
      typeId: tipo.id,
      subject: "Demostración técnica con el cliente",
      cuando: new Date("2026-12-01T16:00:00Z"),
      hecha: false,
    });
    expect(r.ok).toBe(true);
    expect(await prisma.activity.count({ where: { opportunityId: alta.datos.id, userId: ivan.userId } })).toBe(1);
  });
});
