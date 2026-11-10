import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { PermissionCode, Session } from "@/lib/auth/permissions";
import { coincidenciasParaConvertir, getLeadDetail, listLeads, vendedoresParaAsignar } from "@/lib/scope/leads";
import {
  asignarProspectos,
  cambiarEtapaDeProspecto,
  convertirProspecto,
  crearProspecto,
  descartarProspecto,
  importarProspectos,
  registrarActividadDeProspecto,
} from "@/lib/domain/lead";

/**
 * Prospectos · decisiones §58, contra la base real.
 *
 * Lo que afirman: el alcance por rol (Marketing y Gerencia por país, el vendedor
 * solo los asignados, Preventa nada); el alta con folio PRO- y el SLA del país;
 * la asignación masiva con bitácora; el descarte con motivo obligatorio; la
 * actividad hecha que sella el primer contacto; y la tabla de transiciones.
 *
 * Los permisos se declaran en la prueba, no se leen de la matriz. El usuario de
 * Marketing se crea aquí si no existe. Todo lo creado se borra al final.
 */
async function sesionDe(correo: string, permisos: PermissionCode[]): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  return { userId: u.id, email: u.email, name: u.name, role: u.role, countryCodes: u.countryCodes, permissions: new Set(permisos), limits: {} };
}

const SLA = { leadFirstContactSlaHours: 24 };
const GESTION: PermissionCode[] = ["VER_PROSPECTOS", "GESTIONAR_PROSPECTOS"];

let marketing: Session;
let admin: Session;
let paulina: Session;
let ivan: Session;
let canalId: string;
let motivoId: string;
let tipoActividadId: string;
const creados: string[] = [];

beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: "mk@avattar.com" },
    update: { role: "MARKETING", countryCodes: ["MX"], active: true, deletedAt: null },
    create: { email: "mk@avattar.com", name: "Marketing Avattar", initials: "MA", role: "MARKETING", countryCodes: ["MX"] },
  });
  [marketing, admin, paulina, ivan] = await Promise.all([
    sesionDe("mk@avattar.com", GESTION),
    sesionDe("as@avattar.com", [...GESTION, "CONVERTIR_PROSPECTO", "CREAR_OPORTUNIDAD", "VER_OPORTUNIDADES_OFICINA"]),
    sesionDe("pe@avattar.com", ["VER_PROSPECTOS", "CONVERTIR_PROSPECTO", "CREAR_OPORTUNIDAD", "VER_OPORTUNIDADES_PROPIAS"]),
    sesionDe("ic@avattar.com", []),
  ]);
  canalId = (await prisma.leadChannel.findFirstOrThrow({ select: { id: true } })).id;
  motivoId = (await prisma.leadDiscardReason.findFirstOrThrow({ select: { id: true } })).id;
  tipoActividadId = (await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
});

afterAll(async () => {
  if (creados.length === 0) return;
  await prisma.activity.deleteMany({ where: { leadId: { in: creados } } });
  await prisma.leadStageTransition.deleteMany({ where: { leadId: { in: creados } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: creados } } });
  await prisma.lead.deleteMany({ where: { id: { in: creados } } });
});

async function unProspecto(sesion: Session, extra: Partial<Parameters<typeof crearProspecto>[1]> = {}) {
  const r = await crearProspecto(
    sesion,
    { contactName: "Laura García Prueba", email: `laura.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@novatek.test`, companyName: "Novatek Prueba", countryCode: "MX", channelId: canalId, ...extra },
    SLA,
  );
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("no se creó");
  creados.push(r.datos.id);
  return (await getLeadDetail(admin, r.datos.id))!;
}

describe("crearProspecto · alta con folio y SLA del país", () => {
  it("Marketing crea: folio PRO-AAAA-NNNNN, etapa NUEVO, SLA a 24 h, transición inicial", async () => {
    const l = await unProspecto(marketing);
    expect(l.folio).toMatch(/^PRO-\d{4}-\d{5}$/);
    expect(l.stage).toBe("NUEVO");
    expect(l.firstContactDueAt.getTime() - l.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(l.transitions).toHaveLength(1);
    expect(l.transitions[0]!.toStage).toBe("NUEVO");
  });

  it("sin GESTIONAR_PROSPECTOS no se crea; fuera de sus países tampoco", async () => {
    const sinPermiso = await crearProspecto(paulina, { contactName: "X Y", companyName: "Z", countryCode: "MX", channelId: canalId }, SLA);
    expect(sinPermiso).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    const otroPais = await crearProspecto(marketing, { contactName: "X Y", companyName: "Z", countryCode: "CO", channelId: canalId }, SLA);
    expect(otroPais).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("exige nombre, empresa y un correo con forma de correo", async () => {
    const r = await crearProspecto(marketing, { contactName: "A", companyName: "", countryCode: "MX", channelId: canalId, email: "no-es" }, SLA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.map((p) => p.campo)).toEqual(expect.arrayContaining(["contactName", "companyName", "email"]));
  });
});

describe("alcance por rol · INV-01", () => {
  it("Marketing de MX ve los de MX y no los de CO; Administración ve ambos", async () => {
    const mx = await unProspecto(marketing);
    const co = await unProspecto(admin, { countryCode: "CO" });
    const deMarketing = await listLeads(marketing, {});
    expect(deMarketing.some((l) => l.id === mx.id)).toBe(true);
    expect(deMarketing.some((l) => l.id === co.id)).toBe(false);
    const deAdmin = await listLeads(admin, {});
    expect(deAdmin.some((l) => l.id === co.id)).toBe(true);
    expect(await getLeadDetail(marketing, co.id)).toBeNull();
  });

  it("el vendedor ve solo los asignados; Preventa, ninguno", async () => {
    const l = await unProspecto(marketing);
    expect((await listLeads(paulina, {})).some((x) => x.id === l.id)).toBe(false);
    const r = await asignarProspectos(marketing, [l], paulina.userId);
    expect(r.ok).toBe(true);
    expect((await listLeads(paulina, {})).some((x) => x.id === l.id)).toBe(true);
    expect(await listLeads(ivan, {})).toEqual([]);
  });

  it("el vendedor no ve lo que lleva su nombre pero sigue antes de Asignado (§59)", async () => {
    const creado = await unProspecto(marketing, { assignedToId: paulina.userId });
    // Con vendedor pero devuelto a Calificado: lleva su nombre y aún no es suyo.
    await prisma.lead.update({ where: { id: creado.id }, data: { stage: "CALIFICADO" } });
    const l = (await getLeadDetail(admin, creado.id))!;
    expect(l.assignedToId).toBe(paulina.userId);
    expect((await listLeads(paulina, {})).some((x) => x.id === l.id)).toBe(false);
    expect(await getLeadDetail(paulina, l.id)).toBeNull();
    expect((await listLeads(admin, {})).some((x) => x.id === l.id)).toBe(true);
  });

  it("la oficina activa recorta", async () => {
    const co = await unProspecto(admin, { countryCode: "CO" });
    expect((await listLeads(admin, { pais: "MX" })).some((x) => x.id === co.id)).toBe(false);
    expect((await listLeads(admin, { pais: "CO" })).some((x) => x.id === co.id)).toBe(true);
  });
});

describe("asignarProspectos · masivo, con bitácora", () => {
  it("pasa a ASIGNADO, sella la transición y deja ASIGNAR_PROSPECTO por prospecto", async () => {
    const a = await unProspecto(marketing);
    const b = await unProspecto(marketing);
    const r = await asignarProspectos(marketing, [a, b], paulina.userId);
    expect(r).toMatchObject({ ok: true, datos: { asignados: 2 } });
    const filas = await prisma.lead.findMany({ where: { id: { in: [a.id, b.id] } }, select: { stage: true, assignedToId: true } });
    expect(filas.every((f) => f.stage === "ASIGNADO" && f.assignedToId === paulina.userId)).toBe(true);
    const trazas = await prisma.auditLog.count({ where: { entity: "Lead", entityId: { in: [a.id, b.id] }, action: "ASIGNAR_PROSPECTO" } });
    expect(trazas).toBe(2);
  });

  it("rechaza a quien no opera en el país del prospecto; los vendedores válidos son los del país", async () => {
    const l = await unProspecto(admin, { countryCode: "CO" });
    const r = await asignarProspectos(admin, [l], paulina.userId);
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    const deMX = await vendedoresParaAsignar("MX");
    expect(deMX.some((v) => v.id === paulina.userId)).toBe(true);
    expect(deMX.some((v) => v.id === marketing.userId)).toBe(false);
  });

  it("el vendedor no asigna", async () => {
    const l = await unProspecto(marketing);
    expect(await asignarProspectos(paulina, [l], paulina.userId)).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});

describe("cambiarEtapaDeProspecto · la tabla de transiciones", () => {
  it("de NUEVO a ACEPTADO no se puede; a EN_VALIDACION sí, y a CONTACTADO sella el primer contacto", async () => {
    const l = await unProspecto(marketing);
    expect(await cambiarEtapaDeProspecto(marketing, l, "ACEPTADO")).toMatchObject({ ok: false, motivo: "VALIDACION" });
    expect((await cambiarEtapaDeProspecto(marketing, l, "EN_VALIDACION")).ok).toBe(true);
    const l2 = (await getLeadDetail(marketing, l.id))!;
    expect((await cambiarEtapaDeProspecto(marketing, l2, "CONTACTADO")).ok).toBe(true);
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { contactedAt: true, stage: true } });
    expect(fila.stage).toBe("CONTACTADO");
    expect(fila.contactedAt).not.toBeNull();
  });

  it("a ASIGNADO solo con vendedor; de ASIGNADO a ACEPTADO lo decide el asignado", async () => {
    const l = await unProspecto(marketing);
    expect(await cambiarEtapaDeProspecto(marketing, l, "ASIGNADO")).toMatchObject({ ok: false, motivo: "VALIDACION" });
    await asignarProspectos(marketing, [l], paulina.userId);
    const asignado = (await getLeadDetail(admin, l.id))!;
    expect((await cambiarEtapaDeProspecto(paulina, asignado, "ACEPTADO")).ok).toBe(true);
  });

  it("un terminal no se mueve", async () => {
    const l = await unProspecto(marketing);
    expect((await descartarProspecto(marketing, l, motivoId)).ok).toBe(true);
    const d = (await getLeadDetail(admin, l.id))!;
    expect(await cambiarEtapaDeProspecto(admin, d, "NUEVO")).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });
});

describe("descartarProspecto · motivo obligatorio", () => {
  it("sin motivo rechaza; con motivo queda DESCARTADO con bitácora", async () => {
    const l = await unProspecto(marketing);
    expect(await descartarProspecto(marketing, l, "")).toMatchObject({ ok: false, motivo: "VALIDACION" });
    expect((await descartarProspecto(marketing, l, motivoId)).ok).toBe(true);
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { stage: true, discardReasonId: true } });
    expect(fila).toEqual({ stage: "DESCARTADO", discardReasonId: motivoId });
    expect(await prisma.auditLog.count({ where: { entity: "Lead", entityId: l.id, action: "DESCARTAR_PROSPECTO" } })).toBe(1);
  });
});

describe("registrarActividadDeProspecto", () => {
  it("una hecha sella el primer contacto y pasa de NUEVO a CONTACTADO; una agendada fija la próxima", async () => {
    const l = await unProspecto(marketing);
    const hecha = await registrarActividadDeProspecto(marketing, l, { typeId: tipoActividadId, subject: "Llamada inicial", hecha: true, cuando: new Date() });
    expect(hecha.ok).toBe(true);
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { stage: true, contactedAt: true, lastActivityAt: true } });
    expect(fila.stage).toBe("CONTACTADO");
    expect(fila.contactedAt).not.toBeNull();
    expect(fila.lastActivityAt).not.toBeNull();

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const l2 = (await getLeadDetail(marketing, l.id))!;
    const agendada = await registrarActividadDeProspecto(marketing, l2, { typeId: tipoActividadId, subject: "Demo", hecha: false, cuando: manana });
    expect(agendada.ok).toBe(true);
    const despues = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { nextActivityAt: true } });
    expect(despues.nextActivityAt?.getTime()).toBe(manana.getTime());
  });

  it("una llamada del prospecto guarda su transcripción; un tipo que no la admite la rechaza (§60)", async () => {
    const l = await unProspecto(marketing);
    const [conTranscripcion, sinTranscripcion] = await Promise.all([
      prisma.activityType.findFirstOrThrow({ where: { hasTranscript: true, active: true }, select: { id: true } }),
      prisma.activityType.findFirstOrThrow({ where: { hasTranscript: false, active: true }, select: { id: true } }),
    ]);
    const r = await registrarActividadDeProspecto(marketing, l, { typeId: conTranscripcion.id, subject: "Llamada inicial", hecha: true, transcript: " Hola, ¿tienen presupuesto? " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: r.datos.id }, select: { transcript: true } })).transcript).toBe("Hola, ¿tienen presupuesto?");

    const l2 = (await getLeadDetail(marketing, l.id))!;
    const mal = await registrarActividadDeProspecto(marketing, l2, { typeId: sinTranscripcion.id, subject: "Correo", hecha: true, transcript: "no" });
    expect(mal).toMatchObject({ ok: false, motivo: "VALIDACION", problemas: [{ campo: "transcript" }] });
  });
});

describe("convertirProspecto · cuenta, persona y oportunidad, reutilizando lo que existe (§58)", () => {
  async function pipelineMX() {
    return prisma.pipeline.findFirstOrThrow({ where: { countryCode: "MX", active: true }, select: { id: true } });
  }
  type Conversion = Parameters<typeof convertirProspecto>[2];
  // Lo que el panel manda por omisión sin coincidencias: cuenta y persona nuevas con los datos del prospecto.
  const datosDeConversion = async (name: string, extra: Partial<Conversion> = {}): Promise<Conversion> => ({
    cuenta: { nueva: { name: `Cuenta ${name}`, type: "PROSPECTO" } },
    persona: { nueva: { name: "Laura García Prueba" } },
    name,
    pipelineId: (await pipelineMX()).id,
    estimatedAmount: "250000",
    expectedCloseDate: new Date("2027-03-15T12:00:00Z"),
    businessType: "NUEVO" as const,
    ...extra,
  });
  const umbrales = { meddicMinToClosing: 70 };
  const cuentasCreadas: string[] = [];
  const oportunidadesCreadas: string[] = [];

  afterAll(async () => {
    if (oportunidadesCreadas.length) {
      await prisma.activity.updateMany({ where: { opportunityId: { in: oportunidadesCreadas } }, data: { opportunityId: null } });
      await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: oportunidadesCreadas } } });
      await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: oportunidadesCreadas } } });
      await prisma.lead.updateMany({ where: { opportunityId: { in: oportunidadesCreadas } }, data: { opportunityId: null, personId: null, organizationId: null } });
      await prisma.opportunity.deleteMany({ where: { id: { in: oportunidadesCreadas } } });
    }
    if (cuentasCreadas.length) {
      await prisma.person.deleteMany({ where: { organizationId: { in: cuentasCreadas } } });
      await prisma.organization.deleteMany({ where: { id: { in: cuentasCreadas } } });
    }
  });

  it("crea cuenta y persona cuando no existen, abre la oportunidad, re-apunta las actividades y deja el prospecto convertido", async () => {
    const empresa = `Empresa Nueva ${Date.now()}`;
    const l = await unProspecto(marketing, { companyName: empresa, email: `nuevo.${Date.now()}@empresa-nueva.test` });
    await registrarActividadDeProspecto(marketing, l, { typeId: tipoActividadId, subject: "Primera llamada", hecha: true });
    await asignarProspectos(marketing, [(await getLeadDetail(admin, l.id))!], paulina.userId);
    let d = (await getLeadDetail(admin, l.id))!;
    await cambiarEtapaDeProspecto(paulina, d, "ACEPTADO");
    d = (await getLeadDetail(admin, l.id))!;

    const r = await convertirProspecto(
      paulina,
      d,
      await datosDeConversion(`${empresa} · CRM`, {
        cuenta: { nueva: { name: empresa, type: "PROSPECTO", industry: "Tecnología", city: "Monterrey" } },
        persona: { nueva: { name: d.contactName, jobTitle: "Gerente de TI", email: d.email, phone: "+52 81 0000 0000" } },
      }),
      umbrales,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    oportunidadesCreadas.push(r.datos.opportunityId);
    expect(r.datos.cuentaReutilizada).toBe(false);
    expect(r.datos.personaReutilizada).toBe(false);

    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { stage: true, opportunityId: true, organizationId: true, personId: true } });
    expect(fila.stage).toBe("CONVERTIDO");
    expect(fila.opportunityId).toBe(r.datos.opportunityId);
    expect(fila.organizationId).not.toBeNull();
    cuentasCreadas.push(fila.organizationId!);

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: r.datos.opportunityId }, select: { ownerId: true, organizationId: true, primaryPersonId: true } });
    expect(opp.ownerId).toBe(paulina.userId);
    expect(opp.organizationId).toBe(fila.organizationId);
    expect(opp.primaryPersonId).toBe(fila.personId);
    const persona = await prisma.person.findUniqueOrThrow({ where: { id: fila.personId! }, select: { ownerId: true, jobTitle: true, phone: true } });
    expect(persona.ownerId).toBe(paulina.userId);
    expect(persona.jobTitle).toBe("Gerente de TI");
    expect(persona.phone).toBe("+52 81 0000 0000");
    const cuentaCreada = await prisma.organization.findUniqueOrThrow({ where: { id: fila.organizationId! }, select: { industry: true, city: true, ownerId: true } });
    expect(cuentaCreada).toEqual({ industry: "Tecnología", city: "Monterrey", ownerId: paulina.userId });

    const actividades = await prisma.activity.findMany({ where: { leadId: l.id }, select: { opportunityId: true } });
    expect(actividades.length).toBeGreaterThan(0);
    expect(actividades.every((a) => a.opportunityId === r.datos.opportunityId)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: "Lead", entityId: l.id, action: "CONVERTIR_PROSPECTO" } })).toBe(1);
  });

  it("reutiliza la cuenta por nombre y la persona por correo, sin duplicar", async () => {
    const empresa = `Empresa Existente ${Date.now()}`;
    const correo = `laura.${Date.now()}@existente.test`;
    const cuenta = await prisma.organization.create({ data: { name: empresa, type: "PROSPECTO", countryCode: "MX", ownerId: paulina.userId }, select: { id: true } });
    cuentasCreadas.push(cuenta.id);
    const persona = await prisma.person.create({ data: { organizationId: cuenta.id, name: "Laura Existente", initials: "LE", email: correo, ownerId: paulina.userId }, select: { id: true } });

    const l = await unProspecto(admin, { companyName: empresa.toUpperCase(), email: correo.toUpperCase() });
    await asignarProspectos(admin, [(await getLeadDetail(admin, l.id))!], paulina.userId);
    const d = (await getLeadDetail(admin, l.id))!;
    // Administración convierte desde Asignado, saltando la aceptación; el panel manda lo que el lector encontró.
    const encontrado = await coincidenciasParaConvertir(admin, d);
    expect(encontrado.cuenta?.id).toBe(cuenta.id);
    expect(encontrado.persona?.id).toBe(persona.id);
    expect(encontrado.contactos.some((c) => c.id === persona.id)).toBe(true);
    const r = await convertirProspecto(admin, d, await datosDeConversion(`${empresa} · renovación`, { cuenta: { id: cuenta.id }, persona: { id: persona.id } }), umbrales);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    oportunidadesCreadas.push(r.datos.opportunityId);
    expect(r.datos.cuentaReutilizada).toBe(true);
    expect(r.datos.personaReutilizada).toBe(true);
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, select: { organizationId: true, personId: true } });
    expect(fila.organizationId).toBe(cuenta.id);
    expect(fila.personId).toBe(persona.id);
    expect(await prisma.organization.count({ where: { name: { equals: empresa, mode: "insensitive" }, deletedAt: null } })).toBe(1);
  });

  it("una cuenta nueva homónima se rechaza con el dato; una persona de otra cuenta también (§59)", async () => {
    const empresa = `Empresa Homónima ${Date.now()}`;
    const cuenta = await prisma.organization.create({ data: { name: empresa, type: "PROSPECTO", countryCode: "MX", ownerId: paulina.userId }, select: { id: true } });
    cuentasCreadas.push(cuenta.id);
    const ajena = await prisma.person.create({ data: { organizationId: cuenta.id, name: "Ajena", initials: "AJ", ownerId: paulina.userId }, select: { id: true } });
    const otra = await prisma.organization.create({ data: { name: `Otra ${Date.now()}`, type: "PROSPECTO", countryCode: "MX", ownerId: paulina.userId }, select: { id: true } });
    cuentasCreadas.push(otra.id);

    const l = await unProspecto(admin, { companyName: empresa });
    await asignarProspectos(admin, [(await getLeadDetail(admin, l.id))!], paulina.userId);
    const d = (await getLeadDetail(admin, l.id))!;
    const homonima = await convertirProspecto(admin, d, await datosDeConversion("Homónima · CRM", { cuenta: { nueva: { name: empresa.toLowerCase(), type: "CLIENTE" } } }), umbrales);
    expect(homonima).toMatchObject({ ok: false, motivo: "VALIDACION", problemas: [{ campo: "organizacionNombre" }] });
    const ajenaEnOtra = await convertirProspecto(admin, d, await datosDeConversion("Ajena · CRM", { cuenta: { id: otra.id }, persona: { id: ajena.id } }), umbrales);
    expect(ajenaEnOtra).toMatchObject({ ok: false, motivo: "VALIDACION", problemas: [{ campo: "persona" }] });
    expect((await getLeadDetail(admin, l.id))!.stage).toBe("ASIGNADO");
  });

  it("desde Nuevo no se convierte; Marketing no convierte; un convertido no se vuelve a convertir", async () => {
    const l = await unProspecto(marketing);
    expect(await convertirProspecto(admin, l, await datosDeConversion("X"), umbrales)).toMatchObject({ ok: false, motivo: "VALIDACION" });
    await asignarProspectos(marketing, [(await getLeadDetail(admin, l.id))!], paulina.userId);
    const asignado = (await getLeadDetail(admin, l.id))!;
    expect(await convertirProspecto(marketing, asignado, await datosDeConversion("X"), umbrales)).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});

describe("importarProspectos · las filas válidas, en una transacción, con bitácora (§58)", () => {
  it("crea cada una con su folio y el SLA de su país, y deja una sola entrada con el conteo", async () => {
    const sufijo = Date.now();
    const filas = [1, 2, 3].map((n) => ({ contactName: `Importado ${n} ${sufijo}`, companyName: `Importadora ${sufijo}`, countryCode: "MX" as const, channelId: canalId, email: `imp.${n}.${sufijo}@importada.test` }));
    const r = await importarProspectos(marketing, filas, { MX: 24 });
    expect(r).toMatchObject({ ok: true, datos: { creados: 3 } });
    if (!r.ok) return;
    creados.push(...r.datos.ids);
    const hechos = await prisma.lead.findMany({ where: { id: { in: r.datos.ids } }, select: { folio: true, stage: true, firstContactDueAt: true, createdAt: true } });
    expect(hechos).toHaveLength(3);
    expect(new Set(hechos.map((h) => h.folio)).size).toBe(3);
    expect(hechos.every((h) => h.stage === "NUEVO" && h.firstContactDueAt.getTime() - h.createdAt.getTime() === 24 * 3600 * 1000)).toBe(true);
    const traza = await prisma.auditLog.findFirst({ where: { entity: "Lead", action: "IMPORTAR_PROSPECTOS", entityId: r.datos.ids[0]! }, select: { after: true } });
    expect(traza?.after).toMatchObject({ creados: 3 });
  });

  it("el vendedor no importa; una fila fuera de sus países tumba el lote entero", async () => {
    const fila = { contactName: "X Y", companyName: "Z Z", countryCode: "MX" as const, channelId: canalId };
    expect(await importarProspectos(paulina, [fila], { MX: 24 })).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
    expect(await importarProspectos(marketing, [fila, { ...fila, countryCode: "CO" }], { MX: 24, CO: 24 })).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});
