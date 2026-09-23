import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { editarActividad, registrarActividad } from "@/lib/domain/activity";
import type { Calendario, ResultadoDeCalendario } from "@/lib/graph/calendario";
import type { EventoDeGraph } from "@/lib/graph/evento";

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

describe("registrarActividad · agendar es distinto de registrar", () => {
  it("una actividad por hacer no pregunta nada: ella misma es el siguiente paso", async () => {
    // El origen de la confusión que reportó el negocio: tener que declarar un
    // «siguiente paso» aparte cuando lo que estás haciendo ES agendar el paso
    // siguiente. Agendada queda pendiente, así que §12.4 no tiene qué pedir.
    const id = await unaOportunidad("Actividad · agendada");
    const detalle = await getOpportunityDetail(jorge, id);
    const cuando = new Date("2026-10-15T17:00:00Z");

    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoLlamada,
      subject: "Llamar para calificar presupuesto",
      cuando,
      hecha: false,
    });

    expect(r.ok).toBe(true);
    const a = await prisma.activity.findFirstOrThrow({
      where: { opportunityId: id },
      select: { completedAt: true, startsAt: true },
    });
    expect(a.completedAt).toBeNull();
    expect(a.startsAt.toISOString()).toBe(cuando.toISOString());

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { nextActivityAt: true, lastActivityAt: true },
    });
    expect(o.nextActivityAt?.toISOString()).toBe(cuando.toISOString());
    // Agendar algo para octubre no es haber hablado con el cliente hoy: la
    // bandera de «sin actividad reciente» quedaría apagada por una promesa.
    expect(o.lastActivityAt).toBeNull();
  });

  it("con un pendiente ya agendado, registrar algo hecho no pregunta", async () => {
    const id = await unaOportunidad("Actividad · con pendiente vivo");
    const cuando = new Date("2026-10-20T17:00:00Z");

    const detalle = await getOpportunityDetail(jorge, id);
    await registrarActividad(jorge, detalle!, {
      typeId: tipoReunion,
      subject: "Demostración técnica",
      cuando,
      hecha: false,
    });

    const detalle2 = await getOpportunityDetail(jorge, id);
    const r = await registrarActividad(jorge, detalle2!, {
      typeId: tipoLlamada,
      subject: "Llamada de seguimiento",
      hecha: true,
    });

    // La oportunidad no se queda sin próximo paso, así que no hay nada que
    // confirmar. Preguntar aquí era el regaño que sobraba.
    expect(r.ok).toBe(true);
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { nextActivityAt: true },
    });
    expect(o.nextActivityAt?.toISOString()).toBe(cuando.toISOString());
  });
});

// ───────────────────────────────────────────── responsable, duración y calendario

/** Un calendario que apunta lo que le piden y contesta lo que se le diga. */
function calendarioFalso(respuesta: ResultadoDeCalendario = { estado: "OK", eventId: "evt-1" }) {
  const llamadas: {
    que: "crear" | "actualizar" | "eliminar";
    correo: string;
    eventId?: string;
    evento?: EventoDeGraph;
  }[] = [];
  const cal: Calendario = {
    configurado: () => respuesta.estado !== "SIN_CONFIGURAR",
    async crear(correo, evento) {
      llamadas.push({ que: "crear", correo, evento });
      return respuesta;
    },
    async actualizar(correo, eventId, evento) {
      llamadas.push({ que: "actualizar", correo, eventId, evento });
      return respuesta.estado === "OK" ? { estado: "OK", eventId } : respuesta;
    },
    async eliminar(correo, eventId) {
      llamadas.push({ que: "eliminar", correo, eventId });
      return { estado: "OK", eventId };
    },
  };
  return { cal, llamadas };
}

async function otroUsuarioDeMexico(distintoDe: string) {
  return prisma.user.findFirstOrThrow({
    where: { active: true, deletedAt: null, countryCodes: { has: "MX" }, id: { not: distintoDe } },
    select: { id: true, email: true },
  });
}

describe("registrarActividad · responsable, duración y calendario", () => {
  it("guarda el responsable elegido y la duración", async () => {
    const id = await unaOportunidad("Actividad · responsable");
    const detalle = await getOpportunityDetail(jorge, id);
    const otro = await otroUsuarioDeMexico(jorge.userId);

    const r = await registrarActividad(jorge, detalle!, {
      typeId: tipoReunion,
      subject: "Demostración con preventa",
      cuando: new Date("2026-10-06T16:00:00Z"),
      durationMin: 45,
      hecha: false,
      userId: otro.id,
    });
    expect(r.ok).toBe(true);

    const a = await prisma.activity.findFirstOrThrow({
      where: { opportunityId: id },
      select: { userId: true, durationMin: true },
    });
    expect(a.userId).toBe(otro.id);
    expect(a.durationMin).toBe(45);
  });

  it("una actividad por hacer se agenda en el calendario del responsable", async () => {
    const id = await unaOportunidad("Actividad · al calendario");
    const detalle = await getOpportunityDetail(jorge, id);
    const otro = await otroUsuarioDeMexico(jorge.userId);
    const { cal, llamadas } = calendarioFalso({ estado: "OK", eventId: "evt-agendada" });

    const r = await registrarActividad(
      jorge,
      detalle!,
      {
        typeId: tipoReunion,
        subject: "Demostración técnica",
        cuando: new Date("2026-10-06T16:00:00Z"),
        durationMin: 60,
        hecha: false,
        userId: otro.id,
        zona: "America/Mexico_City",
      },
      cal,
    );

    expect(r).toMatchObject({ ok: true, datos: { calendario: "AGENDADA" } });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ que: "crear", correo: otro.email });
    // Hora de pared en la zona de la oportunidad, no el instante.
    expect(llamadas[0]!.evento?.start).toEqual({
      dateTime: "2026-10-06T10:00:00",
      timeZone: "America/Mexico_City",
    });

    const a = await prisma.activity.findFirstOrThrow({
      where: { opportunityId: id },
      select: { externalEventId: true },
    });
    expect(a.externalEventId).toBe("evt-agendada");
  });

  it("una actividad hecha no va al calendario: es historia", async () => {
    const id = await unaOportunidad("Actividad · hecha sin calendario");
    const detalle = await getOpportunityDetail(jorge, id);
    const { cal, llamadas } = calendarioFalso();

    const r = await registrarActividad(
      jorge,
      detalle!,
      { typeId: tipoLlamada, subject: "Llamada hecha", hecha: true, sinSeguimiento: true },
      cal,
    );

    expect(r).toMatchObject({ ok: true, datos: { calendario: "NO_APLICA" } });
    expect(llamadas).toHaveLength(0);
  });

  it("si el calendario falla, la actividad se guarda igual y lo dice", async () => {
    // Guardar en el CRM no puede depender de que Microsoft conteste. El aviso
    // dice que quedó sin agendar; la actividad existe y se puede reintentar.
    const id = await unaOportunidad("Actividad · calendario caído");
    const detalle = await getOpportunityDetail(jorge, id);
    const { cal } = calendarioFalso({ estado: "FALLO", detalle: "Graph 503" });

    const r = await registrarActividad(
      jorge,
      detalle!,
      {
        typeId: tipoLlamada,
        subject: "Llamar",
        cuando: new Date("2026-10-06T16:00:00Z"),
        hecha: false,
      },
      cal,
    );

    expect(r).toMatchObject({ ok: true, datos: { calendario: "FALLO" } });
    expect(await prisma.activity.count({ where: { opportunityId: id } })).toBe(1);
  });
});

describe("editarActividad", () => {
  async function unaAgendada(nombre: string, cal?: Calendario) {
    const id = await unaOportunidad(nombre);
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await registrarActividad(
      jorge,
      detalle!,
      {
        typeId: tipoLlamada,
        subject: "Primera llamada",
        cuando: new Date("2026-10-06T16:00:00Z"),
        durationMin: 30,
        hecha: false,
        zona: "America/Mexico_City",
      },
      cal,
    );
    if (!r.ok) throw new Error("no se pudo preparar la actividad");
    return { oportunidadId: id, actividadId: r.datos.id };
  }

  it("cambia asunto, horario y duración, y recalcula la próxima actividad", async () => {
    const { oportunidadId, actividadId } = await unaAgendada("Editar · horario");
    const detalle = await getOpportunityDetail(jorge, oportunidadId);
    const nuevaHora = new Date("2026-10-08T18:00:00Z");

    const r = await editarActividad(jorge, detalle!, actividadId, {
      subject: "Primera llamada, reprogramada",
      cuando: nuevaHora,
      durationMin: 45,
    });
    expect(r.ok).toBe(true);

    const a = await prisma.activity.findUniqueOrThrow({
      where: { id: actividadId },
      select: { subject: true, startsAt: true, durationMin: true },
    });
    expect(a.subject).toBe("Primera llamada, reprogramada");
    expect(a.startsAt.toISOString()).toBe(nuevaHora.toISOString());
    expect(a.durationMin).toBe(45);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: oportunidadId },
      select: { nextActivityAt: true },
    });
    expect(o.nextActivityAt?.toISOString()).toBe(nuevaHora.toISOString());
  });

  it("completar la última pendiente pregunta antes, igual que al registrar", async () => {
    const { oportunidadId, actividadId } = await unaAgendada("Editar · completar la última");
    const detalle = await getOpportunityDetail(jorge, oportunidadId);

    const r = await editarActividad(jorge, detalle!, actividadId, { hecha: true });

    expect(r).toMatchObject({ ok: false, motivo: "CONFIRMACION" });
    const a = await prisma.activity.findUniqueOrThrow({
      where: { id: actividadId },
      select: { completedAt: true },
    });
    expect(a.completedAt).toBeNull();
  });

  it("completarla con confirmación la marca hecha y deja la oportunidad sin próximo paso", async () => {
    const { oportunidadId, actividadId } = await unaAgendada("Editar · completar confirmando");
    const detalle = await getOpportunityDetail(jorge, oportunidadId);

    const r = await editarActividad(jorge, detalle!, actividadId, {
      hecha: true,
      outcome: "Quieren propuesta la semana que entra.",
      sinSeguimiento: true,
    });
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id: oportunidadId },
      select: { nextActivityAt: true, lastActivityAt: true },
    });
    expect(o.nextActivityAt).toBeNull();
    expect(o.lastActivityAt).not.toBeNull();
  });

  it("con el evento ya en el calendario, editar lo actualiza", async () => {
    const { cal, llamadas } = calendarioFalso({ estado: "OK", eventId: "evt-orig" });
    const { oportunidadId, actividadId } = await unaAgendada("Editar · actualiza evento", cal);
    const detalle = await getOpportunityDetail(jorge, oportunidadId);

    const r = await editarActividad(
      jorge,
      detalle!,
      actividadId,
      { cuando: new Date("2026-10-07T16:00:00Z"), zona: "America/Mexico_City" },
      cal,
    );
    expect(r).toMatchObject({ ok: true, datos: { calendario: "AGENDADA" } });

    const ultima = llamadas.at(-1);
    expect(ultima).toMatchObject({ que: "actualizar", eventId: "evt-orig" });
    expect(ultima?.evento?.start.dateTime).toBe("2026-10-07T10:00:00");
  });

  it("cambiar de responsable mueve el evento de un calendario al otro", async () => {
    const { cal, llamadas } = calendarioFalso({ estado: "OK", eventId: "evt-mov" });
    const { oportunidadId, actividadId } = await unaAgendada("Editar · cambia responsable", cal);
    const detalle = await getOpportunityDetail(jorge, oportunidadId);
    const otro = await otroUsuarioDeMexico(jorge.userId);

    const r = await editarActividad(jorge, detalle!, actividadId, { userId: otro.id }, cal);
    expect(r.ok).toBe(true);

    const despues = llamadas.slice(1);
    expect(despues.map((l) => l.que)).toEqual(["eliminar", "crear"]);
    expect(despues[0]).toMatchObject({ correo: jorge.email, eventId: "evt-mov" });
    expect(despues[1]).toMatchObject({ correo: otro.email });
  });
});
