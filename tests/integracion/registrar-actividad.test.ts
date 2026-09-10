import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { registrarActividad } from "@/lib/domain/activity";

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
let jorge: Session;
let tipoLlamada: string;
let tipoReunion: string;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
  const tipos = await prisma.activityType.findMany({
    where: { active: true },
    select: { id: true },
    orderBy: { name: "asc" },
    take: 2,
  });
  tipoLlamada = tipos[0]!.id;
  tipoReunion = tipos[1]?.id ?? tipos[0]!.id;
});

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

async function unaOportunidad(nombre: string) {
  const [organizacion, pipeline, politica] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null },
      select: { id: true },
    }),
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

describe("registrarActividad · el DEBE de §12.4", () => {
  it("sin siguiente paso NI confirmación, no escribe nada", async () => {
    // «Una actividad que se completa sin agendar la siguiente DEBE preguntar
    // de forma explícita si se cierra sin seguimiento.» La pregunta vive en el
    // servidor: un confirm() del navegador se salta desde la consola.
    const id = await unaOportunidad("Actividad · sin confirmar");
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Llamada de descubrimiento",
    });

    expect(r).toMatchObject({ motivo: "CONFIRMACION" });
    expect(await prisma.activity.count({ where: { opportunityId: id } })).toBe(0);
  });

  it("con la confirmación explícita, escribe y deja la oportunidad sin próximo paso", async () => {
    const id = await unaOportunidad("Actividad · cerrada sin seguimiento");
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Llamada de descubrimiento",
      outcome: "Interesados, sin presupuesto asignado.",
      sinSeguimiento: true,
    });
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { lastActivityAt: true, nextActivityAt: true },
    });
    expect(o.lastActivityAt).not.toBeNull();
    // Esto es lo que la hace aparecer mañana en la tercera lista de §12.4.
    expect(o.nextActivityAt).toBeNull();
  });
});

describe("registrarActividad · la actividad y su siguiente paso", () => {
  it("escribe las dos y agenda el próximo paso en la oportunidad", async () => {
    const id = await unaOportunidad("Actividad · con siguiente");
    const detalle = await getOpportunityDetail(jorge, id);
    const cuando = new Date("2026-10-05T16:00:00Z");

    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Primera llamada",
      siguiente: { typeId: tipoReunion, subject: "Demostración técnica", startsAt: cuando },
    });
    expect(r.ok).toBe(true);

    const actividades = await prisma.activity.findMany({
      where: { opportunityId: id },
      select: { subject: true, completedAt: true, startsAt: true, userId: true },
      orderBy: { startsAt: "asc" },
    });
    expect(actividades).toHaveLength(2);

    const completada = actividades.find((a) => a.completedAt !== null)!;
    const pendiente = actividades.find((a) => a.completedAt === null)!;
    expect(completada.subject).toBe("Primera llamada");
    expect(pendiente.subject).toBe("Demostración técnica");
    // Quien la registra es quien la hizo.
    expect(completada.userId).toBe(jorge.userId);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { nextActivityAt: true },
    });
    expect(o.nextActivityAt?.toISOString()).toBe(cuando.toISOString());
  });

  it("el próximo paso es el MÁS PRÓXIMO pendiente, no el que se acaba de crear", async () => {
    // Si ya había algo agendado antes, agendar algo más lejano no debe
    // atrasar el recordatorio: la oportunidad pide atención cuando toca lo
    // primero, no lo último.
    const id = await unaOportunidad("Actividad · dos pendientes");
    const detalle = await getOpportunityDetail(jorge, id);

    const cerca = new Date("2026-10-01T15:00:00Z");
    const lejos = new Date("2026-11-20T15:00:00Z");

    await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Primera",
      siguiente: { typeId: tipoReunion, subject: "La cercana", startsAt: cerca },
    });

    const detalle2 = await getOpportunityDetail(jorge, id);
    await registrarActividad(jorge, detalle2!, {
      typeId: tipoLlamada,
      subject: "Segunda",
      siguiente: { typeId: tipoReunion, subject: "La lejana", startsAt: lejos },
    });

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { nextActivityAt: true },
    });
    expect(o.nextActivityAt?.toISOString()).toBe(cerca.toISOString());
  });

  it("cerrar sin seguimiento NO borra un pendiente que ya existía", async () => {
    const id = await unaOportunidad("Actividad · pendiente previo");
    const detalle = await getOpportunityDetail(jorge, id);
    const cuando = new Date("2026-10-10T15:00:00Z");

    await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Con siguiente",
      siguiente: { typeId: tipoReunion, subject: "Ya agendada", startsAt: cuando },
    });

    const detalle2 = await getOpportunityDetail(jorge, id);
    await registrarActividad(jorge, detalle2!, {
      typeId: tipoLlamada,
      subject: "Otra sin siguiente",
      sinSeguimiento: true,
    });

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { nextActivityAt: true },
    });
    // «Sin seguimiento» habla de ESTA actividad, no de la agenda entera.
    expect(o.nextActivityAt?.toISOString()).toBe(cuando.toISOString());
  });

  it("el asunto no puede venir vacío", async () => {
    const id = await unaOportunidad("Actividad · sin asunto");
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "  ",
      sinSeguimiento: true,
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});
