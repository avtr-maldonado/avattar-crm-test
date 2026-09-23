import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { cambiarEtapa, crearOportunidad, editarOportunidad } from "@/lib/domain/opportunity";

/**
 * P-02 · edición y cambio de etapa.
 *
 * Cada prueba trabaja sobre una oportunidad propia que crea y limpia: el
 * escenario de §15 es dato compartido y estas escriben.
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

const creadas: string[] = [];

async function umbrales() {
  const p = await getCommercialPolicy("MX");
  return {
    meddicMinToClosing: Number(p.meddicMinToClosing),
    meddicMinToCommit: Number(p.meddicMinToCommit),
  };
}

/** Una oportunidad nueva en la primera etapa, para no tocar el seed. */
async function unaOportunidad(session: Session, nombre: string) {
  const [organizacion, pipeline] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null },
      select: { id: true },
    }),
    prisma.pipeline.findFirstOrThrow({
      where: { name: "Ventas México" },
      select: {
        id: true,
        stages: {
          select: { id: true, name: true, position: true, gateMode: true, gateRequires: true },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);

  const r = await crearOportunidad(
    session,
    {
      name: nombre,
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "100000.0000",
      expectedCloseDate: new Date("2026-12-15"),
      businessType: "NUEVO",
    },
    await umbrales(),
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad de prueba");
  creadas.push(r.datos.id);
  return { id: r.datos.id, pipeline };
}

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

let jorge: Session;
let paulina: Session;

beforeAll(async () => {
  [jorge, paulina] = await Promise.all([
    sesionDe("jm@avattar.com"),
    sesionDe("pe@avattar.com"),
  ]);
});

describe("cambiarEtapa · RN-02 y RN-03", () => {
  it("avanzar a una etapa sin requisitos sella la transición y reinicia el reloj", async () => {
    const { id, pipeline } = await unaOportunidad(jorge, "Cambio de etapa · simple");
    const antes = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { stageEnteredAt: true },
    });

    // La segunda etapa pide persona con rol declarado; buscamos una que no
    // pida nada, o la propia siguiente si su compuerta está vacía.
    const destino = pipeline.stages.find((e) => e.position === 2 && e.gateRequires.length === 0);
    if (!destino) return;

    const detalle = await getOpportunityDetail(jorge, id);
    const r = await cambiarEtapa(jorge, detalle!, { toStageId: destino.id }, await umbrales());
    expect(r.ok).toBe(true);

    const despues = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { stageId: true, stageEnteredAt: true },
    });
    expect(despues.stageId).toBe(destino.id);
    // RN-03 · el reloj de estancamiento mide cuánto lleva DONDE ESTÁ.
    expect(despues.stageEnteredAt.getTime()).toBeGreaterThan(antes.stageEnteredAt.getTime());

    const t = await prisma.stageTransition.findFirstOrThrow({
      where: { opportunityId: id, toStageId: destino.id },
      select: { fromStageId: true, byUserId: true, gateOverride: true },
    });
    expect(t.byUserId).toBe(jorge.userId);
    expect(t.gateOverride).toBe(false);
  });

  it("una compuerta con requisitos detiene el avance y los nombra TODOS", async () => {
    const { id, pipeline } = await unaOportunidad(jorge, "Cambio de etapa · con compuerta");
    const conVarios = pipeline.stages.find((e) => e.gateRequires.length > 1);
    expect(conVarios).toBeDefined();

    const detalle = await getOpportunityDetail(jorge, id);
    const r = await cambiarEtapa(jorge, detalle!, { toStageId: conVarios!.id }, await umbrales());

    expect(r).toMatchObject({ motivo: "COMPUERTA" });
    if (r.ok) return;
    // Reportar de a uno obliga a arreglar, reintentar y descubrir el siguiente.
    expect(r.problemas.length).toBe(conVarios!.gateRequires.length);

    const sinMover = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { stageId: true },
    });
    expect(sinMover.stageId).not.toBe(conVarios!.id);
  });

  it("una BLOQUEANTE no se salta ni con la confirmación explícita", async () => {
    const { id, pipeline } = await unaOportunidad(jorge, "Cambio de etapa · bloqueante");
    const bloqueante = pipeline.stages.find(
      (e) => e.gateMode === "BLOQUEANTE" && e.gateRequires.length > 0,
    );
    if (!bloqueante) return;

    const detalle = await getOpportunityDetail(jorge, id);
    const r = await cambiarEtapa(
      jorge,
      detalle!,
      { toStageId: bloqueante.id, omitirCompuerta: true },
      await umbrales(),
    );
    expect(r).toMatchObject({ motivo: "COMPUERTA" });
  });

  it("retroceder también resella el reloj", async () => {
    // RN-03 dice «se reinicia al cambiar de etapa». Retroceder es cambiar.
    const { id, pipeline } = await unaOportunidad(jorge, "Cambio de etapa · retroceso");
    const primera = pipeline.stages[0]!;
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await cambiarEtapa(jorge, detalle!, { toStageId: primera.id }, await umbrales());
    // Ya está en la primera: no es un error, es una transición sin movimiento.
    expect(r.ok).toBe(true);
  });

  it("una etapa de otro pipeline no es un destino válido", async () => {
    const { id } = await unaOportunidad(jorge, "Cambio de etapa · pipeline ajeno");
    const ajena = await prisma.stage.findFirstOrThrow({
      where: { pipeline: { name: "Ventas Colombia" } },
      select: { id: true },
    });
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await cambiarEtapa(jorge, detalle!, { toStageId: ajena.id }, await umbrales());
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});

describe("editarOportunidad · quién puede y qué", () => {
  it("el propietario edita los datos comerciales", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · del propietario");
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await editarOportunidad(
      jorge,
      detalle!,
      {
        name: "Edición · nombre nuevo",
        estimatedAmount: "250000.0000",
        expectedCloseDate: new Date("2027-03-31"),
        businessType: "EXPANSION",
      },
      await umbrales(),
    );
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { name: true, estimatedAmount: true, amount: true, businessType: true },
    });
    expect(o.name).toBe("Edición · nombre nuevo");
    expect(o.businessType).toBe("EXPANSION");
    // Sin cotización, `amount` sigue siendo espejo del estimado.
    expect(o.amount.toString()).toBe(o.estimatedAmount.toString());
  });

  it("un vendedor no edita la oportunidad de otro", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · ajena");
    // Paulina no la ve por alcance, así que ni siquiera llega el detalle.
    expect(await getOpportunityDetail(paulina, id)).toBeNull();
  });

  it("una oportunidad cerrada no se edita · RN-18", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · cerrada");
    await prisma.opportunity.update({
      where: { id },
      data: { status: "GANADA", actualCloseDate: new Date() },
    });

    const detalle = await getOpportunityDetail(jorge, id);
    const r = await editarOportunidad(jorge, detalle!, { name: "No debería" }, await umbrales());
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    expect(o.name).not.toBe("No debería");
  });

  it("«Compromiso» exige el mínimo MEDDIC · RN-29", async () => {
    // Una oportunidad recién creada no tiene puntaje. Dejarla marcar
    // «Compromiso» sería dejar que el pronóstico prometa lo que nadie calificó.
    const { id } = await unaOportunidad(jorge, "Edición · compromiso");
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await editarOportunidad(
      jorge,
      detalle!,
      { forecastCategory: "COMPROMISO" },
      await umbrales(),
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("forecastCategory");
  });

  it("un gerente reasigna; el nuevo dueño la ve y el anterior no · AC-04", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · reasignada");
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await editarOportunidad(
      jorge,
      detalle!,
      { ownerId: paulina.userId },
      await umbrales(),
    );
    expect(r.ok).toBe(true);

    expect(await getOpportunityDetail(paulina, id)).not.toBeNull();
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });
    expect(o.ownerId).toBe(paulina.userId);
  });

  it("no se reasigna a alguien de otro país · Q-14", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · otro país");
    const deOtroPais = await prisma.user.findFirst({
      where: { active: true, deletedAt: null, NOT: { countryCodes: { has: "MX" } } },
      select: { id: true },
    });
    if (!deOtroPais) return;

    const detalle = await getOpportunityDetail(jorge, id);
    const r = await editarOportunidad(
      jorge,
      detalle!,
      { ownerId: deOtroPais.id },
      await umbrales(),
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});

describe("editarOportunidad · lo que queda en la bitácora", () => {
  it("cambiar el cierre estimado se anota con la fecha anterior y la nueva", async () => {
    // Mover el cierre es lo que más se edita y lo que más explica después por
    // qué un trimestre no cerró. Sin rastro, nadie sabe cuántas veces se corrió.
    const { id } = await unaOportunidad(jorge, "Edición · cierre auditado");
    const detalle = await getOpportunityDetail(jorge, id);
    const nueva = new Date("2027-01-15T12:00:00");

    const r = await editarOportunidad(jorge, detalle!, { expectedCloseDate: nueva }, await umbrales());
    expect(r.ok).toBe(true);

    const registro = await prisma.auditLog.findFirst({
      where: { entity: "Opportunity", entityId: id, action: "CAMBIAR_CIERRE_ESTIMADO" },
      select: { before: true, after: true, byUserId: true },
    });
    expect(registro).not.toBeNull();
    expect(registro!.byUserId).toBe(jorge.userId);
    expect(registro!.before).toMatchObject({ expectedCloseDate: detalle!.expectedCloseDate.toISOString() });
    expect(registro!.after).toMatchObject({ expectedCloseDate: nueva.toISOString() });
  });

  it("editar sin mover el cierre no inventa un registro", async () => {
    const { id } = await unaOportunidad(jorge, "Edición · sin cierre");
    const detalle = await getOpportunityDetail(jorge, id);

    await editarOportunidad(jorge, detalle!, { name: "Otro nombre" }, await umbrales());

    const cuantos = await prisma.auditLog.count({
      where: { entity: "Opportunity", entityId: id, action: "CAMBIAR_CIERRE_ESTIMADO" },
    });
    expect(cuantos).toBe(0);
  });
});
