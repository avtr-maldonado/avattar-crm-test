import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { PermissionCode, Session } from "@/lib/auth/permissions";
import { getLeadDetail, rubricaParaAdministrar, rubricaVigente } from "@/lib/scope/leads";
import { calificarProspecto, cambiarEtapaDeProspecto, crearProspecto } from "@/lib/domain/lead";
import { guardarRubrica } from "@/lib/domain/leadCatalog";

/**
 * La rúbrica de calificación de prospectos · decisiones §71, contra la base real.
 *
 * Lo que afirman: la rúbrica se guarda como hoja completa y sus activos suman 100; solo quien
 * gestiona prospectos la edita; calificar solo en En validación y Contactado, por quien gestiona;
 * el puntaje es la suma de lo marcado y se guarda con el nombre y el peso de ese momento, así que
 * cambiar la rúbrica después no lo mueve; calificar otra vez reemplaza, no acumula.
 *
 * La rúbrica de DEV es compartida: se guarda al empezar y se restaura al final.
 */
async function sesionDe(correo: string, permisos: PermissionCode[]): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  return { userId: u.id, email: u.email, name: u.name, role: u.role, countryCodes: u.countryCodes, permissions: new Set(permisos), limits: {} };
}

const sufijo = Date.now().toString(36);
let gestor: Session;
let sinPermiso: Session;
let canalId: string;
let original: { id: string; name: string; weight: number; active: boolean; position: number }[];
const prospectos: string[] = [];

beforeAll(async () => {
  [gestor, sinPermiso] = await Promise.all([
    sesionDe("as@avattar.com", ["VER_PROSPECTOS", "GESTIONAR_PROSPECTOS"]),
    sesionDe("as@avattar.com", ["VER_PROSPECTOS"]),
  ]);
  canalId = (await prisma.leadChannel.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
  original = await prisma.leadScoringCriterion.findMany({ select: { id: true, name: true, weight: true, active: true, position: true } });
});

afterAll(async () => {
  if (prospectos.length > 0) {
    await prisma.leadScoreItem.deleteMany({ where: { leadId: { in: prospectos } } });
    await prisma.leadStageTransition.deleteMany({ where: { leadId: { in: prospectos } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: prospectos } } });
    await prisma.lead.deleteMany({ where: { id: { in: prospectos } } });
  }
  // Restaura la rúbrica: los originales como estaban y los creados aquí fuera.
  const ids = original.map((c) => c.id);
  await prisma.leadScoreItem.deleteMany({ where: { criterion: { id: { notIn: ids } } } });
  await prisma.leadScoringCriterion.deleteMany({ where: { id: { notIn: ids } } });
  for (const c of original) await prisma.leadScoringCriterion.update({ where: { id: c.id }, data: c });
  await prisma.auditLog.deleteMany({ where: { entity: "LeadScoringCriterion", byUserId: gestor.userId, at: { gte: new Date(Date.now() - 3_600_000) } } });
});

async function prospectoEn(etapa: "NUEVO" | "EN_VALIDACION" | "CONTACTADO") {
  const alta = await crearProspecto(
    gestor,
    { contactName: "Rúbrica Prueba §71", companyName: `Novatek §71 ${sufijo}`, countryCode: "MX", channelId: canalId },
    { leadFirstContactSlaHours: 24 },
  );
  if (!alta.ok) throw new Error("no se creó el prospecto");
  prospectos.push(alta.datos.id);
  if (etapa !== "NUEVO") {
    const r = await cambiarEtapaDeProspecto(gestor, (await getLeadDetail(gestor, alta.datos.id))!, etapa);
    if (!r.ok) throw new Error("no se movió de etapa");
  }
  return (await getLeadDetail(gestor, alta.datos.id))!;
}

describe("guardarRubrica", () => {
  it("rechaza una hoja cuyos activos no suman 100, con la cifra", async () => {
    const hoja = (await rubricaParaAdministrar()).map((c) => ({ id: c.id, name: c.name, weight: c.weight, active: c.active }));
    hoja[0] = { ...hoja[0]!, weight: hoja[0]!.weight + 5 };
    const r = await guardarRubrica(gestor, hoja);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("VALIDACION");
    expect(r.problemas.map((p) => p.mensaje).join(" ")).toMatch(/sobran 5/);
  });

  it("sin GESTIONAR_PROSPECTOS no se edita", async () => {
    const hoja = (await rubricaParaAdministrar()).map((c) => ({ id: c.id, name: c.name, weight: c.weight, active: c.active }));
    expect(await guardarRubrica(sinPermiso, hoja)).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });

  it("guarda renombres, pesos, un criterio nuevo y una baja en un viaje, con bitácora", async () => {
    const actual = await rubricaVigente();
    const [primero, segundo, ...resto] = actual;
    const hoja = [
      { id: primero!.id, name: `${primero!.name} ${sufijo}`, weight: primero!.weight, active: true },
      // El segundo se da de baja y su peso pasa al nuevo: la suma sigue en 100.
      { id: segundo!.id, name: segundo!.name, weight: segundo!.weight, active: false },
      ...resto.map((c) => ({ id: c.id, name: c.name, weight: c.weight, active: true })),
      { name: `Urgencia ${sufijo}`, weight: segundo!.weight, active: true },
    ];
    const r = await guardarRubrica(gestor, hoja);
    expect(r).toMatchObject({ ok: true });

    const despues = await rubricaVigente();
    expect(despues.map((c) => c.name)).toContain(`${primero!.name} ${sufijo}`);
    expect(despues.map((c) => c.name)).toContain(`Urgencia ${sufijo}`);
    expect(despues.map((c) => c.id)).not.toContain(segundo!.id);
    expect(despues.reduce((n, c) => n + c.weight, 0)).toBe(100);
    const log = await prisma.auditLog.findFirst({ where: { entity: "LeadScoringCriterion", action: "EDITAR_CATALOGO" }, orderBy: { at: "desc" } });
    expect(log?.byUserId).toBe(gestor.userId);

    // Una baja no se borra: sigue en la administración, inactiva (MD-05).
    const admin = await rubricaParaAdministrar();
    expect(admin.find((c) => c.id === segundo!.id)).toMatchObject({ active: false });
  });
});

describe("calificarProspecto", () => {
  it("en Contactado: el puntaje es la suma de lo marcado, con bitácora y quién calificó", async () => {
    const lead = await prospectoEn("CONTACTADO");
    const rubrica = await rubricaVigente();
    const marcados = rubrica.slice(0, 2);
    const r = await calificarProspecto(gestor, lead, marcados.map((c) => c.id));
    const esperado = marcados.reduce((n, c) => n + c.weight, 0);
    expect(r).toMatchObject({ ok: true, datos: { score: esperado } });

    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { score: true, scoredAt: true, scoredById: true } });
    expect(fila).toMatchObject({ score: esperado, scoredById: gestor.userId });
    expect(fila.scoredAt).not.toBeNull();
    const items = await prisma.leadScoreItem.findMany({ where: { leadId: lead.id } });
    expect(items).toHaveLength(rubrica.length);
    expect(items.filter((i) => i.met)).toHaveLength(2);
    const log = await prisma.auditLog.findFirst({ where: { entity: "Lead", entityId: lead.id, action: "CALIFICAR_PROSPECTO" } });
    expect(log?.after).toMatchObject({ score: esperado });
  });

  it("calificar otra vez reemplaza, no acumula", async () => {
    const lead = await prospectoEn("EN_VALIDACION");
    const rubrica = await rubricaVigente();
    await calificarProspecto(gestor, lead, rubrica.map((c) => c.id));
    const r = await calificarProspecto(gestor, (await getLeadDetail(gestor, lead.id))!, []);
    expect(r).toMatchObject({ ok: true, datos: { score: 0 } });
    expect(await prisma.leadScoreItem.count({ where: { leadId: lead.id } })).toBe(rubrica.length);
  });

  it("cambiar la rúbrica después no mueve un puntaje ya dado", async () => {
    const lead = await prospectoEn("CONTACTADO");
    const rubrica = await rubricaVigente();
    const r = await calificarProspecto(gestor, lead, [rubrica[0]!.id]);
    if (!r.ok) throw new Error("no calificó");
    // Otro peso para el criterio marcado (y el siguiente activo compensa para seguir en 100). La
    // hoja va completa, con los inactivos: si falta uno, el servicio responde CONFLICTO.
    const hoja = (await rubricaParaAdministrar()).map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      weight: c.id === rubrica[0]!.id ? c.weight - 1 : c.id === rubrica[1]!.id ? c.weight + 1 : c.weight,
    }));
    expect((await guardarRubrica(gestor, hoja)).ok).toBe(true);

    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { score: true } });
    expect(fila.score).toBe(r.datos.score);
    const item = await prisma.leadScoreItem.findFirstOrThrow({ where: { leadId: lead.id, criterionId: rubrica[0]!.id } });
    expect(item.weight).toBe(rubrica[0]!.weight);
  });

  it("fuera de En validación y Contactado no se califica", async () => {
    const lead = await prospectoEn("NUEVO");
    const r = await calificarProspecto(gestor, lead, []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("VALIDACION");
    expect(r.problemas[0]?.mensaje).toMatch(/En validación o Contactado/);
  });

  it("un criterio que no está activo se rechaza", async () => {
    const lead = await prospectoEn("CONTACTADO");
    const r = await calificarProspecto(gestor, lead, ["no-existe"]);
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });

  it("quien no gestiona el prospecto no lo califica", async () => {
    const lead = await prospectoEn("CONTACTADO");
    expect(await calificarProspecto(sinPermiso, lead, [])).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});
