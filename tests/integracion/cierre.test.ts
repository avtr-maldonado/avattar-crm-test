import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { cambiarFechaGanada, crearOportunidad, marcarGanada, marcarPerdida, reabrirOportunidad } from "@/lib/domain/opportunity";
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

/**
 * La misma sesión con la matriz puesta a mano.
 *
 * `sesionDe` lee los permisos de la base, y la matriz se edita desde
 * Administración (§40): una prueba que dependa de ella falla o pasa según
 * quién la tocó por última vez. Aquí el permiso se declara.
 */
const con = (base: Session, ...permisos: string[]): Session => ({
  ...base,
  permissions: new Set(permisos),
});

describe("reabrirOportunidad · RN-18 enmendada (decisiones §32, §52)", () => {
  it("una perdida vuelve a abrirse en su etapa, sin cierre real ni motivo, con el mismo folio y en la bitácora", async () => {
    const id = await unaOportunidad();
    let detalle = await getOpportunityDetail(jorge, id);
    const { folio, stage } = detalle!;
    const perdida = await marcarPerdida(jorge, detalle!, { lossReasonId: motivoSimple.id });
    expect(perdida.ok).toBe(true);

    detalle = await getOpportunityDetail(jorge, id);
    // Con el permiso concedido: desde §52 es lo único que decide.
    const r = await reabrirOportunidad(con(jorge, "REABRIR_OPORTUNIDAD"), detalle!);
    expect(r.ok).toBe(true);

    detalle = await getOpportunityDetail(jorge, id);
    expect(detalle!.status).toBe("ABIERTA");
    expect(detalle!.actualCloseDate).toBeNull();
    expect(detalle!.lossReason).toBeNull();
    expect(detalle!.stage.name).toBe(stage.name);
    // INV-12 · el folio no cambia ni al reabrir.
    expect(detalle!.folio).toBe(folio);

    const rastro = await prisma.auditLog.findFirst({
      where: { entity: "Opportunity", entityId: id, action: "REABRIR_OPORTUNIDAD" },
      select: { before: true, byUserId: true },
    });
    expect(rastro).toMatchObject({ before: { status: "PERDIDA" }, byUserId: jorge.userId });
  });

  it("una abierta no se reabre, ni con el permiso", async () => {
    const id = await unaOportunidad();
    const abierta = await getOpportunityDetail(jorge, id);
    expect(
      await reabrirOportunidad(con(jorge, "REABRIR_OPORTUNIDAD"), abierta!),
    ).toMatchObject({ ok: false, motivo: "AUTORIZACION" });

    await marcarPerdida(jorge, abierta!, { lossReasonId: motivoSimple.id });
    const cerrada = await getOpportunityDetail(jorge, id);
    // Sin el permiso no se reabre aunque la oportunidad esté al alcance (§52).
    expect(await reabrirOportunidad(con(paulina), cerrada!)).toMatchObject({
      ok: false,
      motivo: "AUTORIZACION",
    });
  });
});


describe("reabrirOportunidad · la matriz manda · §52", () => {
  it("el propietario NO la reabre si su rol no tiene el permiso", async () => {
    // El defecto: ser el dueño bastaba, así que apagar la celda en
    // Administración › Roles y permisos no surtía efecto (§40).
    const id = await unaOportunidad();
    const abierta = await getOpportunityDetail(jorge, id);
    await marcarPerdida(jorge, abierta!, { lossReasonId: motivoSimple.id });
    const cerrada = await getOpportunityDetail(jorge, id);

    const sinPermiso = con(jorge, "VER_OPORTUNIDADES_OFICINA", "VER_OPORTUNIDADES_PROPIAS");
    const r = await reabrirOportunidad(sinPermiso, cerrada!);

    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    const tras = await getOpportunityDetail(jorge, id);
    expect(tras!.status).toBe("PERDIDA");
  });

  it("con el permiso la reabre, aunque no sea suya", async () => {
    const id = await unaOportunidad();
    const abierta = await getOpportunityDetail(jorge, id);
    await marcarPerdida(jorge, abierta!, { lossReasonId: motivoSimple.id });
    const cerrada = await getOpportunityDetail(jorge, id);

    const conPermiso = con(paulina, "REABRIR_OPORTUNIDAD", "VER_OPORTUNIDADES_OFICINA");
    expect(await reabrirOportunidad(conPermiso, cerrada!)).toMatchObject({ ok: true });
    expect((await getOpportunityDetail(jorge, id))!.status).toBe("ABIERTA");
  });
});

// ═══════════════════════════════════════════════ Fecha ganada · decisiones §55

describe("cambiarFechaGanada · decisiones §55", () => {
  async function unaGanada() {
    const id = await unaOportunidad();
    await conCotizacion(id);
    await conHitos(id, ["1000000"]);
    const abierta = await getOpportunityDetail(jorge, id);
    await marcarGanada(jorge, abierta!);
    return (await getOpportunityDetail(jorge, id))!;
  }

  it("mueve el cierre real de una ganada y lo anota en la bitácora con antes y después", async () => {
    const detalle = await unaGanada();
    const r = await cambiarFechaGanada(jorge, detalle, new Date("2026-10-01T00:00:00Z"));
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: detalle.id },
      select: { actualCloseDate: true, status: true },
    });
    expect(o.status).toBe("GANADA");
    expect(o.actualCloseDate!.toISOString().slice(0, 10)).toBe("2026-10-01");

    const rastro = await prisma.auditLog.findFirst({
      where: { entityId: detalle.id, action: "CAMBIAR_FECHA_GANADA" },
      select: { byUserId: true, before: true, after: true },
    });
    expect(rastro?.byUserId).toBe(jorge.userId);
    expect(String((rastro?.before as { actualCloseDate: string }).actualCloseDate)).toContain(
      detalle.actualCloseDate!.toISOString().slice(0, 10),
    );
    expect(String((rastro?.after as { actualCloseDate: string }).actualCloseDate)).toContain("2026-10-01");
  });

  it("rechaza una fecha futura, y el mismo día no escribe nada", async () => {
    const detalle = await unaGanada();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futura = await cambiarFechaGanada(jorge, detalle, manana);
    expect(futura).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!futura.ok) expect(futura.problemas[0]?.campo).toBe("actualCloseDate");

    const mismoDia = await cambiarFechaGanada(jorge, detalle, detalle.actualCloseDate!);
    expect(mismoDia.ok).toBe(true);
    const rastros = await prisma.auditLog.count({ where: { entityId: detalle.id, action: "CAMBIAR_FECHA_GANADA" } });
    expect(rastros).toBe(0);
  });

  it("una abierta no tiene fecha ganada que cambiar, y quien no la alcanza tampoco la cambia", async () => {
    const id = await unaOportunidad();
    const abierta = await getOpportunityDetail(jorge, id);
    const r = await cambiarFechaGanada(jorge, abierta!, new Date("2026-10-01T00:00:00Z"));
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });

    const ganada = await unaGanada();
    const ajena = await cambiarFechaGanada(paulina, ganada, new Date("2026-10-01T00:00:00Z"));
    expect(ajena).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});
