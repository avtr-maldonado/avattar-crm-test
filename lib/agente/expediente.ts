import type {
  BusinessType,
  ForecastCategory,
  MeddicComponent,
  MeddicStatus,
  MilestoneStatus,
  OpportunityStatus,
} from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import type { ActividadCitable } from "@/lib/domain/insightFuentes";
import { NOMBRE_COMPONENTE } from "@/lib/domain/meddic";
import { leerFicha } from "./ficha";
import type { RiskFlag } from "@/lib/domain/riskFlags";

/**
 * El expediente: lo que el modelo lee de una oportunidad · decisiones §62. Puro.
 *
 * Es lo mismo que el MCP deja ver (§61): ficha, etapa, MEDDIC, hitos, la
 * cotización por sus líneas, banderas calculadas y las actividades con notas,
 * resultado y transcripción. **Nunca costo, utilidad ni margen** (INV-02): el
 * tipo no los tiene, así que no hay forma de que el texto los nombre; una
 * prueba lo vigila de todos modos.
 */
export type Expediente = {
  id: string;
  folio: string;
  name: string;
  status: OpportunityStatus;
  amount: Decimal;
  estimatedAmount: Decimal;
  forecastCategory: ForecastCategory;
  businessType: BusinessType;
  expectedCloseDate: Date;
  stageEnteredAt: Date;
  lastActivityAt: Date | null;
  nextActivityAt: Date | null;
  createdAt: Date;
  meddicScore: number | null;
  organization: { name: string; industry: string | null; city: string | null };
  primaryPerson: { name: string; jobTitle: string | null; committeeRole: { name: string } | null } | null;
  stage: { name: string; probability: Decimal; staleAfterDays: number; isClosing: boolean };
  country: { name: string; timezone: string };
  owner: { name: string };
  supportUsers: { user: { name: string } }[];
  meddic: { component: MeddicComponent; status: MeddicStatus; evidence: string | null; person: { name: string } | null }[];
  milestones: { position: number; description: string; dueDate: Date; amount: Decimal; status: MilestoneStatus }[];
  quote: {
    netSubtotal: Decimal;
    lines: { description: string; quantity: Decimal; unitPrice: Decimal; discountRate: Decimal }[];
  } | null;
  /** Se ordenan aquí de la más reciente a la más antigua, venga como venga. */
  activities: {
    id: string;
    subject: string;
    startsAt: Date;
    completedAt: Date | null;
    notes: string | null;
    outcome: string | null;
    transcript: string | null;
    type: { name: string };
    user: { name: string };
  }[];
  /** El último análisis, si lo hay, para que el modelo diga qué cambió. */
  insights: { generatedAt: Date; payload: unknown }[];
  banderas: RiskFlag[];
};

/** Una transcripción más larga se recorta: el modelo lee lo reciente completo y el resto queda en la actividad. */
export const LIMITE_TRANSCRIPCION = 12_000;

const BANDERA: Record<RiskFlag, string> = {
  SIN_ACTIVIDAD: "Sin actividad reciente",
  ESTANCADA: "Estancada en la etapa",
};

const PRONOSTICO: Record<ForecastCategory, string> = {
  PIPELINE: "Pipeline",
  MEJOR_CASO: "Mejor caso",
  COMPROMISO: "Compromiso",
  OMITIDA: "Omitida",
};

const TIPO_DE_NEGOCIO: Record<BusinessType, string> = {
  NUEVO: "Negocio nuevo",
  EXPANSION: "Expansión",
  RENOVACION: "Renovación",
};

const ESTADO_MEDDIC: Record<MeddicStatus, string> = {
  NO_EVALUADO: "no evaluado",
  AUSENTE: "ausente",
  PARCIAL: "parcial",
  CONFIRMADO: "confirmado",
};

function fecha(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "sin fecha";
}

function usd(d: Decimal): string {
  return `USD ${d.toFixed(2)}`;
}

function dias(desde: Date, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000));
}

function recortar(texto: string): string {
  return texto.length > LIMITE_TRANSCRIPCION ? `${texto.slice(0, LIMITE_TRANSCRIPCION)} […recortada]` : texto;
}

/** El expediente como texto en español, por secciones, para el mensaje del modelo. */
export function textoDeExpediente(e: Expediente, ahora: Date = new Date()): string {
  const partes: string[] = [];

  partes.push(
    `# Oportunidad ${e.folio} · ${e.name}`,
    `- Cuenta: ${e.organization.name}${e.organization.industry ? ` (${e.organization.industry})` : ""}${e.organization.city ? `, ${e.organization.city}` : ""}`,
    `- País: ${e.country.name}`,
    `- Contacto principal: ${
      e.primaryPerson
        ? `${e.primaryPerson.name}${e.primaryPerson.jobTitle ? `, ${e.primaryPerson.jobTitle}` : ""}${e.primaryPerson.committeeRole ? ` · rol en el comité: ${e.primaryPerson.committeeRole.name}` : ""}`
        : "ninguno"
    }`,
    `- Propietario: ${e.owner.name}${e.supportUsers.length ? ` · preventa: ${e.supportUsers.map((s) => s.user.name).join(", ")}` : ""}`,
    `- Tipo: ${TIPO_DE_NEGOCIO[e.businessType]} · pronóstico: ${PRONOSTICO[e.forecastCategory]}`,
    `- Importe: ${usd(e.amount)} (estimado al abrir: ${usd(e.estimatedAmount)})`,
    `- Cierre estimado: ${fecha(e.expectedCloseDate)} · creada el ${fecha(e.createdAt)} (${dias(e.createdAt, ahora)} días)`,
  );

  partes.push(
    "",
    "## Etapa y tiempos",
    `- Etapa: ${e.stage.name} (probabilidad ${e.stage.probability.times(100).toFixed(0)} %${e.stage.isClosing ? ", etapa de cierre" : ""})`,
    `- En esta etapa desde ${fecha(e.stageEnteredAt)} (${dias(e.stageEnteredAt, ahora)} días; se considera estancada a los ${e.stage.staleAfterDays})`,
    `- Última actividad hecha: ${fecha(e.lastActivityAt)} · próxima agendada: ${fecha(e.nextActivityAt)}`,
    `- Banderas calculadas: ${e.banderas.length ? e.banderas.map((b) => BANDERA[b]).join(", ") : "ninguna"}`,
  );

  partes.push("", `## MEDDIC (puntaje ${e.meddicScore ?? "sin calcular"})`);
  if (e.meddic.length === 0) partes.push("- Sin componentes evaluados.");
  for (const m of e.meddic) {
    partes.push(
      `- ${NOMBRE_COMPONENTE[m.component]}: ${ESTADO_MEDDIC[m.status]}${m.person ? ` · persona: ${m.person.name}` : ""}${m.evidence ? ` · evidencia: ${m.evidence}` : ""}`,
    );
  }

  partes.push("", "## Cotización");
  if (!e.quote || e.quote.lines.length === 0) partes.push("- Sin cotización con líneas.");
  else {
    partes.push(`- Neto: ${usd(e.quote.netSubtotal)}`);
    for (const l of e.quote.lines) {
      partes.push(
        `- ${l.description}: ${l.quantity.toString()} × ${usd(l.unitPrice)}${l.discountRate.gt(0) ? ` con ${l.discountRate.times(100).toFixed(1)} % de descuento` : ""}`,
      );
    }
  }

  partes.push("", "## Hitos de cobro");
  if (e.milestones.length === 0) partes.push("- Sin hitos capturados.");
  for (const h of e.milestones) {
    partes.push(`- ${h.position}. ${h.description}: ${usd(h.amount)} el ${fecha(h.dueDate)} · ${h.status === "CUMPLIDO" ? "cumplido" : "pendiente"}`);
  }

  const anterior = e.insights[0];
  if (anterior) {
    const p = leerFicha(anterior.payload);
    partes.push(
      "",
      `## Análisis anterior (${fecha(anterior.generatedAt)})`,
      `- Estado: ${p?.etiqueta ?? "desconocido"}`,
      `- Diagnóstico: ${p?.diagnostico ?? ""}`,
    );
  }

  const actividades = ordenadas(e.activities);
  partes.push("", `## Actividades (${actividades.length}, de la más reciente a la más antigua)`);
  if (actividades.length === 0) partes.push("- Ninguna registrada.");
  for (const a of actividades) {
    partes.push(
      "",
      `### ${a.type.name} · ${a.subject} · ${fecha(a.startsAt)} · ${a.completedAt ? "hecha" : "pendiente"} · ${a.user.name}`,
      `activity_id: ${a.id}`,
    );
    if (a.notes) partes.push(`Notas: ${a.notes}`);
    if (a.outcome) partes.push(`Resultado: ${a.outcome}`);
    if (a.transcript) partes.push(`Transcripción:\n${recortar(a.transcript)}`);
  }

  return partes.join("\n");
}

/** De la más reciente a la más antigua, venga como venga: el orden es parte del contrato con el modelo. */
function ordenadas<T extends { startsAt: Date; id: string }>(actividades: readonly T[]): T[] {
  return [...actividades].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.id.localeCompare(a.id));
}

/** Las actividades del expediente en la forma que `validarFuentes` compara. */
export function actividadesCitables(e: Expediente): ActividadCitable[] {
  return ordenadas(e.activities).map((a) => ({
    id: a.id,
    opportunityId: e.id,
    subject: a.subject,
    notes: a.notes,
    outcome: a.outcome,
    transcript: a.transcript,
  }));
}
