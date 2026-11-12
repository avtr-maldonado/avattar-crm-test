import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import type { Analista, PeticionDeAnalisis, RespuestaDeAnalista } from "@/lib/agente/analista";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { analizarOportunidad, anotarCambio, solicitarAnalisis } from "@/lib/domain/fichaDeAnalisis";
import { listInsights } from "@/lib/scope/insights";
import { estadoDeAnalisis, tomarParaAnalizar } from "@/lib/scope/agente";

/**
 * El agente de análisis a demanda · decisiones §62 y §63. El analista es
 * falso: devuelve lo que la prueba le dice y anota lo que le pidieron. Nada
 * llama a la API. La matriz se declara en la sesión, no se lee de la base.
 */
async function sesionDe(correo: string, permisos: string[]): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos),
    limits: {},
  };
}

const CON_PERMISO = ["VER_OPORTUNIDADES_PROPIAS", "VER_OPORTUNIDADES_OFICINA", "CREAR_OPORTUNIDAD", "ANALIZAR_CON_IA"];
const SIN_PERMISO = ["VER_OPORTUNIDADES_PROPIAS", "VER_OPORTUNIDADES_OFICINA", "CREAR_OPORTUNIDAD"];

const creadas: string[] = [];
let jorge: Session;
let jorgeSinPermiso: Session;
let tipoLlamada: string;

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com", CON_PERMISO);
  jorgeSinPermiso = await sesionDe("jm@avattar.com", SIN_PERMISO);
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
  await prisma.milestone.deleteMany({ where: { opportunityId: { in: creadas } } });
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

function ficha(activityId: string, cita = "Aprobado para Q1") {
  return {
    estado: { etiqueta: "EN_RIESGO", diagnostico: "Hay presupuesto aprobado pero no hay fecha de firma." },
    fortalezas: [{ descripcion: "Presupuesto aprobado", fuente: { activity_id: activityId, cita } }],
    riesgos: [{ descripcion: "Sin fecha de firma", fuente: { activity_id: activityId, cita } }],
    siguientes_pasos: [],
    recomendaciones: [
      { descripcion: "Pedir fecha al patrocinador", fuente: { activity_id: activityId, cita } },
      { descripcion: "Averiguar el proceso de compra", fuente: null },
    ],
  };
}

/** Devuelve, en orden, cada salida de la lista; anota cada petición. */
function analistaFalso(salidas: unknown[]): Analista & { peticiones: PeticionDeAnalisis[] } {
  const peticiones: PeticionDeAnalisis[] = [];
  return {
    peticiones,
    async analizar(p): Promise<RespuestaDeAnalista> {
      peticiones.push(p);
      const salida = salidas[peticiones.length - 1];
      if (salida instanceof Error) throw salida;
      return { salida, modelo: "modelo-de-prueba", tokens: { entrada: 1200, salida: 300 } };
    },
  };
}

describe("solicitarAnalisis · «Analizar con IA» (§63)", () => {
  it("sin el permiso de la matriz se rechaza, aunque sea el propietario", async () => {
    const o = await unaOportunidad("Sin permiso");
    const r = await solicitarAnalisis(jorgeSinPermiso, o.id);
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    expect(r.ok ? "" : r.problemas[0]!.mensaje).toMatch(/Analizar con IA/);
    expect((await estadoDeAnalisis(o.id))!.analysisStartedAt).toBeNull();
  });

  it("con permiso y sin ficha previa, deja la oportunidad «analizando» sin preguntar", async () => {
    const o = await unaOportunidad("Primera vez");
    const ahora = new Date("2026-11-11T15:00:00Z");
    const r = await solicitarAnalisis(jorge, o.id, { ahora });
    expect(r).toMatchObject({ ok: true });
    expect((await estadoDeAnalisis(o.id))!.analysisStartedAt).toEqual(ahora);
  });

  it("mientras está analizando, una segunda pulsación es CONFLICTO y no toma el bloqueo dos veces", async () => {
    const o = await unaOportunidad("Doble clic");
    const ahora = new Date("2026-11-11T15:00:00Z");
    expect(await solicitarAnalisis(jorge, o.id, { ahora })).toMatchObject({ ok: true });
    const otra = await solicitarAnalisis(jorge, o.id, { ahora: new Date(ahora.getTime() + 60_000) });
    expect(otra).toMatchObject({ ok: false, motivo: "CONFLICTO" });
    expect(await tomarParaAnalizar(o.id, new Date(ahora.getTime() + 60_000))).toBe(false);
    // Un bloqueo más viejo que el plazo se considera abandonado.
    expect(await tomarParaAnalizar(o.id, new Date(ahora.getTime() + 20 * 60_000))).toBe(true);
  });

  it("si nada cambió desde la última ficha, pide confirmación; confirmado, analiza; con un cambio posterior, no pregunta", async () => {
    const o = await unaOportunidad("Sin cambios");
    const act = await unaActividad(o.id, "El patrocinador dijo: Aprobado para Q1.");
    const t0 = new Date("2026-11-11T15:00:00Z");
    expect(await solicitarAnalisis(jorge, o.id, { ahora: t0 })).toMatchObject({ ok: true });
    expect(await analizarOportunidad(o.id, analistaFalso([ficha(act.id)]), { ahora: t0 })).toMatchObject({ resultado: "OK" });

    const t1 = new Date("2026-11-11T15:30:00Z");
    const aviso = await solicitarAnalisis(jorge, o.id, { ahora: t1, zona: "America/Mexico_City" });
    expect(aviso).toMatchObject({ ok: false, motivo: "CONFIRMACION" });
    expect(aviso.ok ? "" : aviso.problemas[0]!.mensaje).toMatch(/Nada ha cambiado/);
    expect((await estadoDeAnalisis(o.id))!.analysisStartedAt).toBeNull();

    expect(await solicitarAnalisis(jorge, o.id, { ahora: t1, confirmado: true })).toMatchObject({ ok: true });
    await prisma.opportunity.update({ where: { id: o.id }, data: { analysisStartedAt: null } });

    // La ficha se guarda con la hora real de la base; el cambio posterior va después de ella.
    const despues = new Date(Date.now() + 60_000);
    await anotarCambio(prisma, o.id, despues);
    expect(await solicitarAnalisis(jorge, o.id, { ahora: new Date(despues.getTime() + 5 * 60_000) })).toMatchObject({ ok: true });
  });

  it("una cerrada no se analiza: COMPUERTA", async () => {
    const o = await unaOportunidad("Cerrada");
    await prisma.opportunity.update({ where: { id: o.id }, data: { status: "GANADA", actualCloseDate: new Date() } });
    expect(await solicitarAnalisis(jorge, o.id)).toMatchObject({ ok: false, motivo: "COMPUERTA" });
  });
});

describe("analizarOportunidad · con un analista falso", () => {
  it("guarda la ficha como versión del agente, con tokens, quien la pidió en la bitácora, y suelta el bloqueo", async () => {
    const o = await unaOportunidad("Análisis que se guarda");
    const act = await unaActividad(o.id, "El patrocinador dijo: Aprobado para Q1, falta la firma.");
    const analista = analistaFalso([ficha(act.id)]);
    await tomarParaAnalizar(o.id, new Date());

    const r = await analizarOportunidad(o.id, analista, { pedidoPor: jorge.userId });
    expect(r).toMatchObject({ resultado: "OK" });
    expect(analista.peticiones).toHaveLength(1);
    expect(analista.peticiones[0]!.expediente).toContain(o.folio);
    expect(analista.peticiones[0]!.expediente).toContain(`activity_id: ${act.id}`);

    const fichas = await listInsights(jorge, o.id);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({ origin: "AGENTE", generatedBy: null, inputTokens: 1200, outputTokens: 300, model: "modelo-de-prueba" });

    const bit = await prisma.auditLog.findFirst({ where: { entity: "Opportunity", entityId: o.id, action: "GENERAR_ANALISIS" } });
    expect(bit?.byUserId).toBe(jorge.userId);

    const e = (await estadoDeAnalisis(o.id))!;
    expect(e.analysisStartedAt).toBeNull();
    expect(e.analysisError).toBeNull();
    expect(e.ultimaFichaEn).not.toBeNull();
  });

  it("una cita que no aparece pide corrección una vez; si la segunda sirve, se guarda", async () => {
    const o = await unaOportunidad("Análisis corregido");
    const act = await unaActividad(o.id, "Aprobado para Q1 por el comité.");
    const analista = analistaFalso([ficha(act.id, "esto no está en la actividad"), ficha(act.id)]);

    expect(await analizarOportunidad(o.id, analista)).toMatchObject({ resultado: "OK" });
    expect(analista.peticiones).toHaveLength(2);
    expect(analista.peticiones[1]!.correccion?.problemas[0]?.mensaje).toMatch(/no aparece/);
    expect(await listInsights(jorge, o.id)).toHaveLength(1);
  });

  it("si la corrección tampoco sirve, no guarda nada, anota el error y suelta el bloqueo; el siguiente clic vuelve a intentar", async () => {
    const o = await unaOportunidad("Análisis fallido");
    const act = await unaActividad(o.id, "Aprobado para Q1 por el comité.");
    const analista = analistaFalso([ficha(act.id, "inventada"), ficha(act.id, "también inventada")]);
    await tomarParaAnalizar(o.id, new Date());

    expect(await analizarOportunidad(o.id, analista)).toMatchObject({ resultado: "FALLA" });
    expect(await listInsights(jorge, o.id)).toHaveLength(0);
    const e = (await estadoDeAnalisis(o.id))!;
    expect(e.analysisError).toMatch(/no aparece/);
    expect(e.analysisStartedAt).toBeNull();
    expect(await solicitarAnalisis(jorge, o.id)).toMatchObject({ ok: true });
  });

  it("si la API falla, el error queda escrito y el bloqueo se suelta", async () => {
    const o = await unaOportunidad("API caída");
    const analista = analistaFalso([new Error("la API no responde")]);
    await tomarParaAnalizar(o.id, new Date());
    expect(await analizarOportunidad(o.id, analista)).toMatchObject({ resultado: "FALLA" });
    const e = (await estadoDeAnalisis(o.id))!;
    expect(e.analysisError).toContain("la API no responde");
    expect(e.analysisStartedAt).toBeNull();
  });

  it("una salida que no cumple el esquema (sin recomendaciones) es una falla, no una ficha", async () => {
    const o = await unaOportunidad("Análisis sin acciones");
    const act = await unaActividad(o.id, "Aprobado para Q1.");
    const analista = analistaFalso([{ ...ficha(act.id), recomendaciones: [] }, { ...ficha(act.id), recomendaciones: [] }]);
    expect(await analizarOportunidad(o.id, analista)).toMatchObject({ resultado: "FALLA" });
    expect((await estadoDeAnalisis(o.id))!.analysisError).toMatch(/recomendaci/);
  });
});
