import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { PermissionCode, Session } from "@/lib/auth/permissions";
import { catalogosDeProspectos, catalogosDeProspectosParaAdministrar, getLeadDetail } from "@/lib/scope/leads";
import { crearProspecto, editarProspecto } from "@/lib/domain/lead";
import { crearCampana, crearCanal, editarCampana, editarCanal } from "@/lib/domain/leadCatalog";

/**
 * Canales y campañas de prospectos administrables · decisiones §68, contra la base real.
 *
 * Lo que afirman: solo quien gestiona prospectos los administra; el homónimo se
 * rechaza sin importar mayúsculas ni espacios; eliminar es desactivar (MD-05),
 * deja bitácora y no borra la fila; lo inactivo sale del alta pero queda en los
 * filtros; y un prospecto conserva al editarse el canal o la campaña que ya tenía
 * aunque estén inactivos.
 *
 * Todo lo creado lleva el prefijo «zz Prueba §68» y se borra al final.
 */
async function sesionDe(correo: string, permisos: PermissionCode[]): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  return { userId: u.id, email: u.email, name: u.name, role: u.role, countryCodes: u.countryCodes, permissions: new Set(permisos), limits: {} };
}

const PREFIJO = "zz Prueba §68";
const sufijo = Date.now().toString(36);
const nombre = (n: string) => `${PREFIJO} ${n} ${sufijo}`;

let gestor: Session;
let sinPermiso: Session;
const prospectos: string[] = [];

beforeAll(async () => {
  [gestor, sinPermiso] = await Promise.all([
    sesionDe("as@avattar.com", ["VER_PROSPECTOS", "GESTIONAR_PROSPECTOS"]),
    sesionDe("as@avattar.com", ["VER_PROSPECTOS"]),
  ]);
});

afterAll(async () => {
  if (prospectos.length > 0) {
    await prisma.leadStageTransition.deleteMany({ where: { leadId: { in: prospectos } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: prospectos } } });
    await prisma.lead.deleteMany({ where: { id: { in: prospectos } } });
  }
  const campanas = await prisma.leadCampaign.findMany({ where: { name: { startsWith: PREFIJO } }, select: { id: true } });
  const canales = await prisma.leadChannel.findMany({ where: { name: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = [...campanas, ...canales].map((x) => x.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.leadCampaign.deleteMany({ where: { id: { in: campanas.map((c) => c.id) } } });
  await prisma.leadChannel.deleteMany({ where: { id: { in: canales.map((c) => c.id) } } });
});

describe("canales", () => {
  it("quien gestiona prospectos crea un canal, activo y con bitácora", async () => {
    const r = await crearCanal(gestor, { name: `  ${nombre("Webinar")}  ` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const canal = await prisma.leadChannel.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(canal).toMatchObject({ name: nombre("Webinar"), active: true });
    const log = await prisma.auditLog.findFirst({ where: { entity: "LeadChannel", entityId: canal.id, action: "EDITAR_CATALOGO" } });
    expect(log).not.toBeNull();
  });

  it("sin GESTIONAR_PROSPECTOS no se administra", async () => {
    const r = await crearCanal(sinPermiso, { name: nombre("Prohibido") });
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("rechaza el homónimo sin importar mayúsculas ni espacios, y lo nombra", async () => {
    await crearCanal(gestor, { name: nombre("Podcast") });
    const r = await crearCanal(gestor, { name: nombre("Podcast").toUpperCase().replace(" ", "   ") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("VALIDACION");
    expect(r.problemas[0]).toMatchObject({ campo: "name" });
    expect(r.problemas[0].mensaje).toContain(nombre("Podcast"));
  });

  it("renombrar a un nombre que ya existe también se rechaza", async () => {
    const a = await crearCanal(gestor, { name: nombre("Radio") });
    await crearCanal(gestor, { name: nombre("Prensa") });
    if (!a.ok) throw new Error("no se creó");
    const r = await editarCanal(gestor, a.datos.id, { name: nombre("prensa") });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });

  it("desactivar no borra: sale del alta, queda en los filtros y se puede reactivar", async () => {
    const c = await crearCanal(gestor, { name: nombre("Feria") });
    if (!c.ok) throw new Error("no se creó");
    const r = await editarCanal(gestor, c.datos.id, { active: false });
    expect(r.ok).toBe(true);

    const fila = await prisma.leadChannel.findUnique({ where: { id: c.datos.id } });
    expect(fila?.active).toBe(false);
    const cat = await catalogosDeProspectos();
    expect(cat.canales.some((x) => x.id === c.datos.id)).toBe(false);
    expect(cat.canalesParaFiltrar.some((x) => x.id === c.datos.id)).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { entity: "LeadChannel", entityId: c.datos.id, action: "EDITAR_CATALOGO" }, orderBy: { at: "desc" } });
    expect(log?.after).toMatchObject({ active: false });

    expect((await editarCanal(gestor, c.datos.id, { active: true })).ok).toBe(true);
    expect((await prisma.leadChannel.findUnique({ where: { id: c.datos.id } }))?.active).toBe(true);
  });

  it("un guardado que no cambia nada no escribe bitácora", async () => {
    const c = await crearCanal(gestor, { name: nombre("Quieto") });
    if (!c.ok) throw new Error("no se creó");
    await editarCanal(gestor, c.datos.id, { name: nombre("Quieto"), active: true });
    const logs = await prisma.auditLog.count({ where: { entity: "LeadChannel", entityId: c.datos.id } });
    expect(logs).toBe(1);
  });
});

describe("campañas", () => {
  it("se crea con canal opcional y se cambia de canal", async () => {
    const canal = await crearCanal(gestor, { name: nombre("Canal de campaña") });
    if (!canal.ok) throw new Error("no se creó");
    const r = await crearCampana(gestor, { name: nombre("Lanzamiento"), channelId: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await editarCampana(gestor, r.datos.id, { channelId: canal.datos.id })).ok).toBe(true);
    const fila = await prisma.leadCampaign.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(fila.channelId).toBe(canal.datos.id);
  });

  it("no se liga a un canal inactivo", async () => {
    const canal = await crearCanal(gestor, { name: nombre("Canal apagado") });
    if (!canal.ok) throw new Error("no se creó");
    await editarCanal(gestor, canal.datos.id, { active: false });
    const r = await crearCampana(gestor, { name: nombre("Huérfana"), channelId: canal.datos.id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemas[0]).toMatchObject({ campo: "channelId" });
  });

  it("el lector de Configuración trae activas e inactivas con su uso", async () => {
    const r = await crearCampana(gestor, { name: nombre("Contada") });
    if (!r.ok) throw new Error("no se creó");
    await editarCampana(gestor, r.datos.id, { active: false });
    const { campanas } = await catalogosDeProspectosParaAdministrar();
    const fila = campanas.find((c) => c.id === r.datos.id);
    expect(fila).toMatchObject({ active: false, usos: 0 });
  });

  it("un prospecto conserva al editarse la campaña que ya tenía aunque esté inactiva, pero no elige otra inactiva", async () => {
    const canalId = (await prisma.leadChannel.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
    const vieja = await crearCampana(gestor, { name: nombre("Vieja") });
    const otra = await crearCampana(gestor, { name: nombre("Otra vieja") });
    if (!vieja.ok || !otra.ok) throw new Error("no se crearon");
    const alta = await crearProspecto(
      gestor,
      { contactName: "Laura Prueba §68", companyName: "Novatek §68", countryCode: "MX", channelId: canalId, campaignId: vieja.datos.id },
      { leadFirstContactSlaHours: 24 },
    );
    if (!alta.ok) throw new Error("no se creó el prospecto");
    prospectos.push(alta.datos.id);
    await editarCampana(gestor, vieja.datos.id, { active: false });
    await editarCampana(gestor, otra.datos.id, { active: false });

    const lead = (await getLeadDetail(gestor, alta.datos.id))!;
    const conserva = await editarProspecto(gestor, lead, { channelId: canalId, campaignId: vieja.datos.id, notes: "sigue" });
    expect(conserva.ok).toBe(true);

    const cambia = await editarProspecto(gestor, lead, { campaignId: otra.datos.id });
    expect(cambia).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });
});
