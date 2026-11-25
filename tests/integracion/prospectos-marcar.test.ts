import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { PermissionCode, Session } from "@/lib/auth/permissions";
import { getLeadDetail } from "@/lib/scope/leads";
import { crearProspecto, marcarActividadDeProspecto, registrarActividadDeProspecto } from "@/lib/domain/lead";

/**
 * Marcar como hecha una actividad del prospecto sin abrirla · decisiones §69.
 *
 * Lo que afirman: el clic hace lo mismo que editar y marcarla (primer contacto,
 * paso a Contactado); se deshace con otro clic; una agendada en el futuro queda
 * hecha ahora; y quien no gestiona ni es el asignado no la marca.
 */
async function sesionDe(correo: string, permisos: PermissionCode[]): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  return { userId: u.id, email: u.email, name: u.name, role: u.role, countryCodes: u.countryCodes, permissions: new Set(permisos), limits: {} };
}

let gestor: Session;
let ajeno: Session;
let canalId: string;
let tipoId: string;
const creados: string[] = [];

beforeAll(async () => {
  [gestor, ajeno] = await Promise.all([
    sesionDe("as@avattar.com", ["VER_PROSPECTOS", "GESTIONAR_PROSPECTOS"]),
    sesionDe("ic@avattar.com", ["VER_PROSPECTOS"]),
  ]);
  canalId = (await prisma.leadChannel.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
  tipoId = (await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
});

afterAll(async () => {
  if (creados.length === 0) return;
  await prisma.activity.deleteMany({ where: { leadId: { in: creados } } });
  await prisma.leadStageTransition.deleteMany({ where: { leadId: { in: creados } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: creados } } });
  await prisma.lead.deleteMany({ where: { id: { in: creados } } });
});

async function prospectoConAgendada(cuando: Date) {
  const alta = await crearProspecto(
    gestor,
    { contactName: "Marcar Prueba §69", companyName: "Novatek §69", countryCode: "MX", channelId: canalId },
    { leadFirstContactSlaHours: 24 },
  );
  if (!alta.ok) throw new Error("no se creó el prospecto");
  creados.push(alta.datos.id);
  const lead = (await getLeadDetail(gestor, alta.datos.id))!;
  const act = await registrarActividadDeProspecto(gestor, lead, { typeId: tipoId, subject: "Llamada de prueba", hecha: false, cuando });
  if (!act.ok) throw new Error("no se agendó");
  return { leadId: lead.id, actividadId: act.datos.id };
}

describe("marcarActividadDeProspecto", () => {
  it("marcarla hecha sella el primer contacto y pasa el prospecto a Contactado", async () => {
    const { leadId, actividadId } = await prospectoConAgendada(new Date(Date.now() - 3_600_000));
    const r = await marcarActividadDeProspecto(gestor, (await getLeadDetail(gestor, leadId))!, actividadId, true);
    expect(r.ok).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true, contactedAt: true, lastActivityAt: true } });
    expect(lead.stage).toBe("CONTACTADO");
    expect(lead.contactedAt).not.toBeNull();
    expect(lead.lastActivityAt).not.toBeNull();
  });

  it("otro clic la regresa a pendiente", async () => {
    const { leadId, actividadId } = await prospectoConAgendada(new Date(Date.now() - 3_600_000));
    await marcarActividadDeProspecto(gestor, (await getLeadDetail(gestor, leadId))!, actividadId, true);
    const r = await marcarActividadDeProspecto(gestor, (await getLeadDetail(gestor, leadId))!, actividadId, false);
    expect(r.ok).toBe(true);
    const a = await prisma.activity.findUniqueOrThrow({ where: { id: actividadId }, select: { completedAt: true } });
    expect(a.completedAt).toBeNull();
  });

  it("una agendada para pasado mañana, marcada hoy, queda hecha ahora", async () => {
    const enDosDias = new Date(Date.now() + 2 * 86_400_000);
    const { leadId, actividadId } = await prospectoConAgendada(enDosDias);
    const antes = Date.now();
    await marcarActividadDeProspecto(gestor, (await getLeadDetail(gestor, leadId))!, actividadId, true);
    const a = await prisma.activity.findUniqueOrThrow({ where: { id: actividadId }, select: { completedAt: true } });
    expect(a.completedAt!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(a.completedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("quien no gestiona ni es el asignado no la marca", async () => {
    const { leadId, actividadId } = await prospectoConAgendada(new Date(Date.now() - 3_600_000));
    const lead = (await getLeadDetail(gestor, leadId))!;
    const r = await marcarActividadDeProspecto(ajeno, lead, actividadId, true);
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });
  });
});
