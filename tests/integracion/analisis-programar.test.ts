import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { money } from "@/lib/money";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { registrarActividad } from "@/lib/domain/activity";
import { guardarHito } from "@/lib/domain/milestoneService";
import { abrirCotizacion } from "@/lib/domain/quoteService";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";

/**
 * Cada servicio que muta una oportunidad deja la marca de cambio
 * `lastChangedAt` (decisiones §62, §63): es lo que permite avisar «nada ha
 * cambiado» antes de gastar tokens. Se prueba con los de firma más simple; los demás llevan
 * la misma línea y los cubre el typecheck.
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
let tipoLlamada: string;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
  const tipo = await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true }, orderBy: { name: "asc" } });
  tipoLlamada = tipo.id;
});

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: creadas } } });
  const cotizaciones = await prisma.quote.findMany({ where: { opportunityId: { in: creadas } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Quote", entityId: { in: cotizaciones.map((q) => q.id) } } });
  await prisma.quote.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.milestone.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunitySupport.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

async function marca(id: string) {
  const o = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { lastChangedAt: true } });
  return o.lastChangedAt;
}

async function sinMarca(id: string) {
  await prisma.opportunity.update({ where: { id }, data: { lastChangedAt: null } });
}

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
  return r.datos;
}

describe("la marca de cambio (§63)", () => {
  it("crear la deja; registrar una actividad, guardar un hito y abrir la cotización la vuelven a dejar", async () => {
    const antes = Date.now();
    const o = await unaOportunidad("Marcas por servicio");
    const alCrear = await marca(o.id);
    expect(alCrear).not.toBeNull();
    expect(alCrear!.getTime()).toBeGreaterThanOrEqual(antes);

    await sinMarca(o.id);
    const detalle = await getOpportunityDetail(jorge, o.id);
    if (!detalle) throw new Error("sin detalle");

    const actividad = await registrarActividad(jorge, detalle, {
      typeId: tipoLlamada,
      subject: "Llamada de descubrimiento",
      // Agendada: una hecha sin siguiente paso pregunta antes de guardar (§19).
      cuando: new Date("2026-12-10T16:00:00Z"),
      hecha: false,
    });
    expect(actividad).toMatchObject({ ok: true });
    expect(await marca(o.id)).not.toBeNull();

    await sinMarca(o.id);
    const hito = await guardarHito(jorge, detalle, { description: "Anticipo", dueDate: new Date("2026-12-30"), amount: "100.0000" });
    expect(hito).toMatchObject({ ok: true });
    expect(await marca(o.id)).not.toBeNull();

    await sinMarca(o.id);
    const cotizacion = await abrirCotizacion(jorge, detalle, money("0.16"));
    expect(cotizacion).toMatchObject({ ok: true });
    expect(await marca(o.id)).not.toBeNull();
  });
});
