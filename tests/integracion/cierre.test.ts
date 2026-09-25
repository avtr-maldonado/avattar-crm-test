import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { crearOportunidad, marcarGanada, marcarPerdida } from "@/lib/domain/opportunity";
import { abrirCotizacion, guardarLinea } from "@/lib/domain/quoteService";
import { guardarHito } from "@/lib/domain/milestoneService";

/**
 * Marcar ganada o perdida · INV-07, RN-06, AC-18, AC-19, AC-20 · decisiones §25.
 *
 * Desde cualquier etapa. Ganar exige cotización con líneas y hitos que cuadren
 * con su neto; perder exige motivo, y competidor si el motivo lo pide. Los dos
 * sellan `actualCloseDate` y dejan rastro en `AuditLog`, que es lo que la
 * bitácora enseña.
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

let jorge: Session;
let paulina: Session;
let motivoSimple: { id: string; name: string };
let motivoConCompetidor: { id: string; name: string };
const creadas: string[] = [];

beforeAll(async () => {
  [jorge, paulina] = await Promise.all([sesionDe("jm@avattar.com"), sesionDe("pe@avattar.com")]);
  // Un motivo que exige competidor, propio de la prueba: el catálogo puede no
  // traer ninguno, y AC-20 se prueba con uno.
  motivoConCompetidor = await prisma.lossReason.create({
    data: { name: `Competencia (prueba ${Date.now()})`, requiresCompetitor: true },
    select: { id: true, name: true },
  });
  motivoSimple = await prisma.lossReason.create({
    data: { name: `Sin presupuesto (prueba ${Date.now()})`, requiresCompetitor: false },
    select: { id: true, name: true },
  });
});

afterAll(async () => {
  if (creadas.length) {
    const quotes = await prisma.quote.findMany({
      where: { opportunityId: { in: creadas } },
      select: { id: true },
    });
    await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...quotes.map((q) => q.id), ...creadas] } },
    });
    await prisma.quote.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.milestone.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
  }
  await prisma.lossReason.deleteMany({ where: { id: { in: [motivoSimple.id, motivoConCompetidor.id] } } });
});

async function unaOportunidad() {
  const [organizacion, pipeline, politica] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null, people: { some: {} } },
      select: { id: true },
    }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
    getCommercialPolicy("MX"),
  ]);
  const r = await crearOportunidad(
    jorge,
    {
      name: `Cierre · ${Math.random().toString(36).slice(2, 8)}`,
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "1000000.0000",
      expectedCloseDate: new Date("2026-12-31"),
      businessType: "NUEVO",
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad");
  creadas.push(r.datos.id);
  return r.datos.id;
}

/** Cotización de una línea con neto exacto de 1 000 000. */
async function conCotizacion(id: string) {
  const detalle = await getOpportunityDetail(jorge, id);
  const [pais, producto] = await Promise.all([
    getCountry("MX"),
    prisma.product.findFirstOrThrow({ where: { active: true, prices: { some: {} } }, select: { id: true } }),
  ]);
  const abierta = await abrirCotizacion(jorge, detalle!, pais.taxRate);
  if (!abierta.ok) throw new Error("no se pudo abrir la cotización");
  const cotizacion = await getCotizacion(jorge, abierta.datos.id);
  const linea = await guardarLinea(
    jorge,
    cotizacion!,
    { productId: producto.id, quantity: "1", discountRate: "0", unitPrice: "1000000" },
    { lineMarginFloor: "0.10" },
  );
  if (!linea.ok) throw new Error(`no se pudo agregar la línea: ${JSON.stringify(linea)}`);
}

async function conHitos(id: string, montos: string[]) {
  for (const [i, monto] of montos.entries()) {
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, {
      description: `Hito ${i + 1}`,
      dueDate: new Date("2026-11-15"),
      amount: monto,
    });
    if (!r.ok) throw new Error(`no se pudo capturar el hito: ${JSON.stringify(r)}`);
  }
}

describe("marcarGanada · INV-07 con las condiciones de §25", () => {
  it("sin cotización con líneas no se gana, y lo dice", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarGanada(jorge, detalle!);
    expect(r).toMatchObject({ ok: false, motivo: "COMPUERTA" });
    if (!r.ok) expect(r.problemas.map((p) => p.mensaje).join(" ")).toMatch(/cotización/i);

    const o = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { status: true } });
    expect(o.status).toBe("ABIERTA");
  });

  it("con cotización pero sin hitos tampoco: falta el calendario de cobro", async () => {
    const id = await unaOportunidad();
    await conCotizacion(id);
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarGanada(jorge, detalle!);
    expect(r).toMatchObject({ ok: false, motivo: "COMPUERTA" });
    if (!r.ok) expect(r.problemas.map((p) => p.mensaje).join(" ")).toMatch(/hito/i);
  });

  it("AC-18 · con hitos que no cuadran, el mensaje dice cuánto falta", async () => {
    const id = await unaOportunidad();
    await conCotizacion(id);
    await conHitos(id, ["300000", "200000", "300000"]);
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarGanada(jorge, detalle!);
    expect(r).toMatchObject({ ok: false, motivo: "COMPUERTA" });
    if (!r.ok) expect(r.problemas.map((p) => p.mensaje).join(" ")).toContain("200,000");
  });

  it("AC-19 · con cotización e hitos cuadrados se gana desde cualquier etapa, se sella el cierre real y queda en la bitácora", async () => {
    const id = await unaOportunidad();
    await conCotizacion(id);
    await conHitos(id, ["600000", "400000"]);
    const detalle = await getOpportunityDetail(jorge, id);
    // Sigue en la etapa inicial: no hace falta llegar a Cierre (§25).
    expect(detalle!.stage.position).toBe(1);

    const r = await marcarGanada(jorge, detalle!);
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { status: true, actualCloseDate: true },
    });
    expect(o.status).toBe("GANADA");
    expect(o.actualCloseDate).not.toBeNull();
    const hoy = new Date().toISOString().slice(0, 10);
    expect(o.actualCloseDate!.toISOString().slice(0, 10)).toBe(hoy);

    const rastro = await prisma.auditLog.findFirst({
      where: { entityId: id, action: "MARCAR_GANADA" },
      select: { byUserId: true, after: true },
    });
    expect(rastro).not.toBeNull();
    expect(rastro!.byUserId).toBe(jorge.userId);
  });

  it("una cerrada no se vuelve a cerrar", async () => {
    const id = await unaOportunidad();
    await conCotizacion(id);
    await conHitos(id, ["1000000"]);
    let detalle = await getOpportunityDetail(jorge, id);
    await marcarGanada(jorge, detalle!);
    detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarPerdida(jorge, detalle!, { lossReasonId: motivoSimple.id });
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("quien no alcanza la oportunidad no la cierra", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarGanada(paulina, detalle!);
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});

describe("marcarPerdida · AC-20", () => {
  it("sin motivo no se pierde", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarPerdida(jorge, detalle!, { lossReasonId: "" });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("lossReasonId");
  });

  it("un motivo que exige competidor lo pide", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarPerdida(jorge, detalle!, { lossReasonId: motivoConCompetidor.id });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("lossCompetitor");
  });

  it("con motivo se pierde desde cualquier etapa, sin cotización, y queda en la bitácora", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await marcarPerdida(jorge, detalle!, {
      lossReasonId: motivoConCompetidor.id,
      lossCompetitor: "Rival S.A.",
    });
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { status: true, actualCloseDate: true, lossReasonId: true, lossCompetitor: true },
    });
    expect(o.status).toBe("PERDIDA");
    expect(o.actualCloseDate).not.toBeNull();
    expect(o.lossReasonId).toBe(motivoConCompetidor.id);
    expect(o.lossCompetitor).toBe("Rival S.A.");

    const rastro = await prisma.auditLog.findFirst({
      where: { entityId: id, action: "MARCAR_PERDIDA" },
      select: { after: true },
    });
    expect(rastro).not.toBeNull();
    expect(JSON.stringify(rastro!.after)).toContain(motivoConCompetidor.name);
  });
});
