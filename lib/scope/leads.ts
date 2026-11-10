import type { CountryCode, Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { etapasQueVe } from "@/lib/domain/leadAccess";
import { ETAPAS_ABIERTAS } from "@/lib/domain/leadStages";
import { buscarPersonasDeOrganizacion } from "./organizations";

/**
 * El alcance de prospectos · decisiones §58.
 *
 * El vendedor ve los que tiene asignados: un prospecto sin vendedor todavía no
 * es de nadie en ventas. Marketing y Gerencia ven los de sus países; Dirección
 * y Administración, todos; Preventa, ninguno. La oficina activa recorta dentro
 * del alcance (§16) y los filtros van después (INV-10). Todo pasa por aquí
 * (INV-01).
 */
export function leadScope(session: Session): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { deletedAt: null };
  switch (session.role) {
    case "VENDEDOR":
      // Los suyos, y solo desde Asignado (§59): antes de eso Marketing todavía decide.
      return { ...base, assignedToId: session.userId, stage: { in: [...etapasQueVe(session.role)] } };
    case "MARKETING":
    case "GERENTE_PAIS":
      return { ...base, countryCode: { in: session.countryCodes } };
    case "DIRECCION":
    case "ADMINISTRADOR":
      return base;
    case "PREVENTA":
      return { ...base, id: { in: [] } };
  }
}

export function withLeadScope(session: Session, where?: Prisma.LeadWhereInput): Prisma.LeadWhereInput {
  return where ? { AND: [leadScope(session), where] } : leadScope(session);
}

/** Lo que la fila y la tarjeta muestran. Explícito, nunca `select: *` (INV-02). */
export const leadCardSelect = {
  id: true,
  folio: true,
  contactName: true,
  email: true,
  phone: true,
  companyName: true,
  countryCode: true,
  stage: true,
  score: true,
  createdAt: true,
  stageEnteredAt: true,
  firstContactDueAt: true,
  contactedAt: true,
  lastActivityAt: true,
  nextActivityAt: true,
  assignedToId: true,
  channel: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, initials: true } },
} satisfies Prisma.LeadSelect;

export type LeadCard = Prisma.LeadGetPayload<{ select: typeof leadCardSelect }>;

export async function listLeads(session: Session, opciones: { where?: Prisma.LeadWhereInput; pais?: CountryCode } = {}): Promise<LeadCard[]> {
  return prisma.lead.findMany({
    // `undefined` no filtra: sin oficina, todo el alcance.
    where: { AND: [leadScope(session), { countryCode: opciones.pais }, opciones.where ?? {}] },
    select: leadCardSelect,
    orderBy: { createdAt: "desc" },
  });
}

const leadDetailSelect = {
  ...leadCardSelect,
  jobTitle: true,
  companyIndustry: true,
  notes: true,
  discardReasonId: true,
  organizationId: true,
  personId: true,
  opportunityId: true,
  createdBy: { select: { id: true, name: true } },
  discardReason: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
  person: { select: { id: true, name: true } },
  opportunity: { select: { id: true, folio: true, name: true } },
  transitions: {
    select: { id: true, fromStage: true, toStage: true, atDate: true, byUser: { select: { name: true } } },
    orderBy: { atDate: "desc" },
  },
  activities: {
    where: { deletedAt: null },
    select: {
      id: true,
      subject: true,
      notes: true,
      outcome: true,
      transcript: true,
      startsAt: true,
      durationMin: true,
      completedAt: true,
      externalEventId: true,
      type: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { startsAt: "desc" },
  },
} satisfies Prisma.LeadSelect;

export type LeadDetail = Prisma.LeadGetPayload<{ select: typeof leadDetailSelect }>;

export async function getLeadDetail(session: Session, id: string): Promise<LeadDetail | null> {
  return prisma.lead.findFirst({ where: withLeadScope(session, { id }), select: leadDetailSelect });
}

/** Lo que `AuditLog` guarda del prospecto: asignaciones, descarte, conversión. */
export async function auditoriaDeProspecto(leadId: string) {
  return prisma.auditLog.findMany({
    where: { entity: "Lead", entityId: leadId },
    select: { id: true, action: true, at: true, before: true, after: true, byUser: { select: { name: true } } },
    orderBy: { at: "desc" },
  });
}

/** Los catálogos activos: canales, campañas y motivos de descarte. */
export async function catalogosDeProspectos() {
  const [canales, campanas, motivosDeDescarte] = await Promise.all([
    prisma.leadChannel.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadCampaign.findMany({ where: { active: true }, select: { id: true, name: true, channelId: true }, orderBy: { name: "asc" } }),
    prisma.leadDiscardReason.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { canales, campanas, motivosDeDescarte };
}

/** A quién se le puede asignar un prospecto: vendedores y gerentes activos del país. */
export async function vendedoresParaAsignar(countryCode: CountryCode) {
  return prisma.user.findMany({
    where: { active: true, deletedAt: null, countryCodes: { has: countryCode }, role: { in: ["VENDEDOR", "GERENTE_PAIS"] } },
    select: { id: true, name: true, initials: true },
    orderBy: { name: "asc" },
  });
}

/** Abiertos sin vendedor o con el primer contacto vencido: el contador del menú. */
export async function contarProspectosPendientes(session: Session, pais?: CountryCode, ahora = new Date()): Promise<number> {
  return prisma.lead.count({
    where: {
      AND: [
        leadScope(session),
        {
          countryCode: pais,
          stage: { in: [...ETAPAS_ABIERTAS] },
          OR: [{ assignedToId: null }, { contactedAt: null, firstContactDueAt: { lt: ahora } }],
        },
      ],
    },
  });
}

/** Los correos que ya tienen un prospecto abierto: para no importar duplicados (§58). */
export async function correosConProspectoAbierto(correos: readonly string[]): Promise<Set<string>> {
  if (correos.length === 0) return new Set();
  const filas = await prisma.lead.findMany({
    where: { deletedAt: null, stage: { in: [...ETAPAS_ABIERTAS] }, email: { in: [...correos], mode: "insensitive" } },
    select: { email: true },
  });
  return new Set(filas.flatMap((f) => (f.email ? [f.email.toLowerCase()] : [])));
}

/** Lo que el panel de conversión necesita para arrancar (`estadoDeConversion`). */
export type CoincidenciasDeConversion = {
  cuenta: { id: string; nombre: string; detalle: string | null } | null;
  contactos: { id: string; nombre: string; detalle: string | null }[];
  persona: { id: string; nombre: string; detalle: string | null } | null;
};

/**
 * Qué existe ya de lo que trae el prospecto · decisiones §59: la cuenta con el
 * mismo nombre —en cualquier país, como el homónimo de §29— y, dentro de ella,
 * la persona con el mismo correo (o el mismo nombre, si no hay correo). La
 * lista de contactos es la que la sesión alcanza (`personScope`), más la
 * persona encontrada aunque no la alcance: reutilizarla es lo que evita el
 * duplicado, y al nacer la oportunidad la verá por ella.
 */
export async function coincidenciasParaConvertir(
  session: Session,
  lead: { companyName: string; contactName: string; email: string | null },
): Promise<CoincidenciasDeConversion> {
  const cuenta = await prisma.organization.findFirst({
    where: { name: { equals: lead.companyName, mode: "insensitive" }, deletedAt: null },
    select: { id: true, name: true, city: true },
  });
  if (!cuenta) return { cuenta: null, contactos: [], persona: null };

  const [visibles, encontrada] = await Promise.all([
    buscarPersonasDeOrganizacion(session, cuenta.id),
    prisma.person.findFirst({
      where: {
        organizationId: cuenta.id,
        deletedAt: null,
        ...(lead.email ? { email: { equals: lead.email, mode: "insensitive" } } : { name: { equals: lead.contactName, mode: "insensitive" } }),
      },
      select: { id: true, name: true, jobTitle: true },
    }),
  ]);
  const contactos = visibles.map((p) => ({ id: p.id, nombre: p.name, detalle: p.jobTitle ?? p.committeeRole?.name ?? null }));
  const persona = encontrada ? { id: encontrada.id, nombre: encontrada.name, detalle: encontrada.jobTitle } : null;
  if (persona && !contactos.some((c) => c.id === persona.id)) contactos.push(persona);
  return { cuenta: { id: cuenta.id, nombre: cuenta.name, detalle: cuenta.city }, contactos, persona };
}
