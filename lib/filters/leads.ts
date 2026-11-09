import type { LeadStage, Prisma } from "@prisma/client";
import { ETAPAS_ABIERTAS, ETAPAS_DE_PROSPECTO } from "@/lib/domain/leadStages";

/**
 * Los filtros de Prospectos · decisiones §58. Viven en la URL (INV-10) y se
 * aplican **después** del alcance: `whereDeProspectos` devuelve lo que se suma
 * al `AND` de `leadScope`, nunca lo sustituye.
 *
 * Sin etapas elegidas se ven las abiertas: lo que se está trabajando. Las
 * cerradas —Convertido, Descartado, Rechazado— se piden con la pastilla.
 */
export type FiltrosDeProspectos = {
  etapas: LeadStage[];
  canales: string[];
  campanas: string[];
  vendedores: string[];
  /** `YYYY-MM-DD`, sobre la fecha de ingreso. */
  desde: string | null;
  hasta: string | null;
  /** Solo los asignados a quien mira. */
  mios: boolean;
  /** El buscador: contacto, empresa, correo o teléfono. */
  q: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fecha(v: string | null): string | null {
  return v !== null && FECHA.test(v) ? v : null;
}

export function parseFiltrosDeProspectos(sp: URLSearchParams): FiltrosDeProspectos {
  return {
    etapas: sp.getAll("etapa").filter((e): e is LeadStage => (ETAPAS_DE_PROSPECTO as readonly string[]).includes(e)),
    canales: sp.getAll("canal").filter(Boolean),
    campanas: sp.getAll("campana").filter(Boolean),
    vendedores: sp.getAll("vendedor").filter(Boolean),
    desde: fecha(sp.get("desde")),
    hasta: fecha(sp.get("hasta")),
    mios: sp.get("mios") === "1",
    q: (sp.get("q") ?? "").trim(),
  };
}

/** Un día después, para que `hasta` sea inclusivo con un `lt`. */
function diaSiguiente(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function whereDeProspectos(f: FiltrosDeProspectos, session: { userId: string }): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    stage: { in: f.etapas.length > 0 ? f.etapas : [...ETAPAS_ABIERTAS] },
  };
  if (f.canales.length > 0) where.channelId = { in: f.canales };
  if (f.campanas.length > 0) where.campaignId = { in: f.campanas };
  if (f.mios) where.assignedToId = session.userId;
  else if (f.vendedores.length > 0) where.assignedToId = { in: f.vendedores };
  if (f.desde || f.hasta) {
    where.createdAt = {
      ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00Z`) } : {}),
      ...(f.hasta ? { lt: diaSiguiente(f.hasta) } : {}),
    };
  }
  if (f.q) {
    const contiene = { contains: f.q, mode: "insensitive" as const };
    where.OR = [{ contactName: contiene }, { companyName: contiene }, { email: contiene }, { phone: contiene }];
  }
  return where;
}

/** La URL de la pantalla con estos filtros y lo que no es filtro (vista, prospecto abierto). */
export function hrefDeProspectos(f: FiltrosDeProspectos, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(extra)) if (valor) p.set(clave, valor);
  for (const e of f.etapas) p.append("etapa", e);
  for (const c of f.canales) p.append("canal", c);
  for (const c of f.campanas) p.append("campana", c);
  for (const v of f.vendedores) p.append("vendedor", v);
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (f.mios) p.set("mios", "1");
  if (f.q) p.set("q", f.q);
  const qs = p.toString();
  return qs ? `/prospectos?${qs}` : "/prospectos";
}
