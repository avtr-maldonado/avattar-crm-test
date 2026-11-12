import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { guardarRecomendacion } from "@/lib/domain/insight";
import { listInsights } from "@/lib/scope/insights";

/**
 * guardar_recomendacion · decisiones §61. El servidor valida: oportunidad al
 * alcance, permiso de escritura, fuentes de esa oportunidad con cita textual;
 * y escribe el insight con su bitácora en la misma transacción (INV-09).
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
let preventa: Session | null = null;
let tipoLlamada: string;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
  const otro = await prisma.user.findFirstOrThrow({
    where: { role: "VENDEDOR", active: true, deletedAt: null, email: { not: "jm@avattar.com" } },
    select: { email: true },
  });
  otroVendedor = await sesionDe(otro.email);
  const p = await prisma.user.findFirst({ where: { role: "PREVENTA", active: true, deletedAt: null }, select: { email: true } });
  preventa = p ? await sesionDe(p.email) : null;
  const tipo = await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true }, orderBy: { name: "asc" } });
  tipoLlamada = tipo.id;
});

afterAll(async () => {
  if (!creadas.length) return;
  await prisma.opportunityInsight.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: creadas } } });
  await prisma.opportunitySupport.deleteMany({ where: { opportunityId: { in: creadas } } });
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
  return r.datos;
}

async function unaActividad(opportunityId: string, transcript: string) {
  return prisma.activity.create({
    data: {
      typeId: tipoLlamada,
      subject: "Llamada con el patrocinador",
      startsAt: new Date("2026-11-09T17:00:00Z"),
      completedAt: new Date("2026-11-09T17:30:00Z"),
      transcript,
      opportunityId,
      userId: jorge.userId,
    },
    select: { id: true },
  });
}

function recomendacion(opportunityId: string, activityId: string, cita = "Aprobado para Q1") {
  return {
    opportunity_id: opportunityId,
    estado: { etiqueta: "EN_RIESGO" as const, diagnostico: "Hay presupuesto aprobado pero no hay fecha de firma." },
    fortalezas: [],
    riesgos: [{ descripcion: "Sin fecha de firma", fuente: { activity_id: activityId, cita } }],
    siguientes_pasos: [],
    recomendaciones: [
      { descripcion: "Pedir fecha al patrocinador", fuente: { activity_id: activityId, cita } },
      { descripcion: "Averiguar el proceso de compra", fuente: null },
    ],
    model: "claude-fable-5-1",
  };
}

describe("guardarRecomendacion", () => {
  it("guarda una fila nueva por cada guardado, con sus fuentes, y deja GUARDAR_RECOMENDACION en la bitácora", async () => {
    const o = await unaOportunidad("MCP · guarda");
    const a = await unaActividad(o.id, "Cliente: Aprobado para Q1, pero sin fecha de firma.");

    const r1 = await guardarRecomendacion(jorge, recomendacion(o.id, a.id), { clientId: "cliente_prueba" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.datos.version).toBe(1);

    const r2 = await guardarRecomendacion(jorge, recomendacion(o.id, a.id), { clientId: "cliente_prueba" });
    expect(r2.ok && r2.datos.version).toBe(2);

    const filas = await listInsights(jorge, o.id);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ sourceActivityIds: [a.id], model: "claude-fable-5-1" });
    expect((filas[0]!.payload as { estado: { etiqueta: string } }).estado.etiqueta).toBe("EN_RIESGO");

    const bitacora = await prisma.auditLog.findMany({
      where: { entity: "Opportunity", entityId: o.id, action: "GUARDAR_RECOMENDACION" },
      select: { after: true },
    });
    expect(bitacora).toHaveLength(2);
    expect(bitacora[0]!.after).toMatchObject({ etiqueta: "EN_RIESGO", fortalezas: 0, riesgos: 1, siguientesPasos: 0, recomendaciones: 2, model: "claude-fable-5-1", clientId: "cliente_prueba" });
  });

  it("una oportunidad fuera del alcance no existe para el agente", async () => {
    const o = await unaOportunidad("MCP · de Jorge");
    const a = await unaActividad(o.id, "Aprobado para Q1");
    const r = await guardarRecomendacion(otroVendedor, recomendacion(o.id, a.id), { clientId: "c" });
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    expect(!r.ok && r.problemas[0]!.mensaje).toMatch(/no existe o no está a tu alcance/);
    expect(await prisma.opportunityInsight.count({ where: { opportunityId: o.id } })).toBe(0);
  });

  it("Preventa la consulta y no escribe sobre ella", async () => {
    if (!preventa) return; // la base de desarrollo no siempre tiene preventa
    const o = await unaOportunidad("MCP · con preventa");
    await prisma.opportunitySupport.create({ data: { opportunityId: o.id, userId: preventa.userId } });
    const a = await unaActividad(o.id, "Aprobado para Q1");
    const r = await guardarRecomendacion(preventa, recomendacion(o.id, a.id), { clientId: "c" });
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    expect(!r.ok && r.problemas[0]!.mensaje).toMatch(/propietario o Gerencia/);
  });

  it("una actividad de otra oportunidad se rechaza diciendo de cuál es, y no escribe nada", async () => {
    const o1 = await unaOportunidad("MCP · destino");
    const o2 = await unaOportunidad("MCP · ajena");
    const ajena = await unaActividad(o2.id, "Aprobado para Q1");
    const r = await guardarRecomendacion(jorge, recomendacion(o1.id, ajena.id), { clientId: "c" });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (r.ok) return;
    expect(r.problemas[0]).toEqual({
      campo: "riesgos.0.fuente.activity_id",
      mensaje: `«${ajena.id}» pertenece a ${o2.folio}, no a ${o1.folio}. Cita solo actividades de listar_actividades de esta oportunidad.`,
    });
    expect(r.problemas).toHaveLength(2); // riesgo y acción citan la misma fuente ajena
    expect(await prisma.opportunityInsight.count({ where: { opportunityId: o1.id } })).toBe(0);
  });

  it("una cita que no aparece en la actividad se rechaza", async () => {
    const o = await unaOportunidad("MCP · cita inventada");
    const a = await unaActividad(o.id, "Aprobado para Q1");
    const r = await guardarRecomendacion(jorge, recomendacion(o.id, a.id, "El cliente firmó el contrato"), { clientId: "c" });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    expect(!r.ok && r.problemas[0]!.campo).toBe("riesgos.0.fuente.cita");
  });

  it("los límites del esquema se aplican también en el servicio", async () => {
    const o = await unaOportunidad("MCP · sin recomendaciones");
    const a = await unaActividad(o.id, "Aprobado para Q1");
    const r = await guardarRecomendacion(jorge, { ...recomendacion(o.id, a.id), recomendaciones: [] }, { clientId: "c" });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    expect(!r.ok && r.problemas[0]!.campo).toBe("recomendaciones");
  });
});
