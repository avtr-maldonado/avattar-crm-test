import type { RiskEvidence } from "@/lib/domain/riskFlags";
import { toClient, type Money } from "@/lib/money";

/**
 * Lo que el agente ve de una oportunidad y de sus actividades · decisiones §61.
 *
 * Funciones puras que toman lo que los lectores de `lib/scope` devuelven y
 * arman el DTO de cada herramienta. **Aquí no entra el costo, la utilidad ni el
 * margen**, tenga o no la sesión `VER_COSTO`: el análisis de una oportunidad
 * no los necesita y así INV-02 no depende de lo que haga el cliente de IA. Los
 * tipos de entrada son estructurales y mínimos: aceptan el resultado real del
 * lector, que trae más, y solo se copia lo nombrado.
 */
type Fecha = Date | null | undefined;

const iso = (d: Fecha): string | null => (d ? d.toISOString() : null);
const dia = (d: Fecha): string | null => (d ? d.toISOString().slice(0, 10) : null);
const usd = (m: Money): string => toClient(m);

export type OportunidadDeListaEntrada = {
  id: string;
  folio: string;
  name: string;
  amount: Money;
  status: "ABIERTA" | "GANADA" | "PERDIDA";
  forecastCategory: string;
  expectedCloseDate: Fecha;
  lastActivityAt: Fecha;
  organization: { name: string };
  stage: { name: string; probability: Money };
  owner: { name: string };
};

/** Lo que la fila de lista y la ficha tienen en común. */
function comunes(o: OportunidadDeListaEntrada) {
  return {
    opportunity_id: o.id,
    folio: o.folio,
    nombre: o.name,
    importe_usd: usd(o.amount),
    estatus: o.status,
    pronostico: o.forecastCategory,
    cierre_estimado: dia(o.expectedCloseDate),
    propietario: o.owner.name,
    ultima_actividad: iso(o.lastActivityAt),
  };
}

export function aOportunidadDeLista(o: OportunidadDeListaEntrada) {
  return {
    ...comunes(o),
    cuenta: o.organization.name,
    etapa: o.stage.name,
    probabilidad: toClient(o.stage.probability),
  };
}

export type FichaEntrada = OportunidadDeListaEntrada & {
  estimatedAmount: Money;
  businessType: string;
  countryCode: string;
  createdAt: Date;
  actualCloseDate: Fecha;
  stageEnteredAt: Date;
  nextActivityAt: Fecha;
  meddicScore: number | null;
  organization: { name: string; industry?: string | null; city?: string | null };
  primaryPerson: { name: string; jobTitle: string | null; committeeRole: { name: string } | null } | null;
  pipeline: { name: string };
  meddic: { component: string; status: string; evidence: string | null; person: { name: string } | null }[];
  quotes: { netSubtotal: Money; _count: { lines: number } }[];
  milestones: { description: string; dueDate: Fecha; amount: Money; status: string }[];
  supportUsers: { user: { name: string; role: string } }[];
};

export type ExtrasDeFicha = {
  banderas: RiskEvidence[];
  totalDeActividades: number;
  recomendaciones: { generatedAt: Date; etiqueta: string | null; generatedBy: string }[];
};

export function aFichaDeOportunidad(o: FichaEntrada, extras: ExtrasDeFicha) {
  const cotizacion = o.quotes[0] && o.quotes[0]._count.lines > 0 ? o.quotes[0] : null;
  const preventa = o.supportUsers.find((s) => s.user.role === "PREVENTA")?.user.name ?? null;
  // En la ficha, cuenta y etapa son objetos; por eso parte de `comunes` y no
  // de la fila de lista: la salida debe ser exactamente el contrato.
  return {
    ...comunes(o),
    tipo_de_negocio: o.businessType,
    pais: o.countryCode,
    pipeline: o.pipeline.name,
    cuenta: { nombre: o.organization.name, industria: o.organization.industry ?? null, ciudad: o.organization.city ?? null },
    contacto_principal: o.primaryPerson
      ? { nombre: o.primaryPerson.name, puesto: o.primaryPerson.jobTitle, rol_en_comite: o.primaryPerson.committeeRole?.name ?? null }
      : null,
    preventa,
    etapa: { nombre: o.stage.name, probabilidad: toClient(o.stage.probability), desde: o.stageEnteredAt.toISOString() },
    importe_estimado_usd: usd(o.estimatedAmount),
    cotizacion: cotizacion ? { neto_usd: usd(cotizacion.netSubtotal), lineas: cotizacion._count.lines } : null,
    cierre_real: dia(o.actualCloseDate),
    creada: o.createdAt.toISOString(),
    proxima_actividad: iso(o.nextActivityAt),
    total_de_actividades: extras.totalDeActividades,
    meddic: {
      puntaje: o.meddicScore,
      componentes: o.meddic.map((m) => ({
        componente: m.component,
        estado: m.status,
        evidencia: m.evidence,
        persona: m.person?.name ?? null,
      })),
    },
    hitos: o.milestones.map((h) => ({ descripcion: h.description, vence: dia(h.dueDate), importe_usd: usd(h.amount), estado: h.status })),
    banderas: extras.banderas.map((b) =>
      b.flag === "SIN_ACTIVIDAD"
        ? { bandera: b.flag, dias_sin_contacto: b.diasSinContacto }
        : { bandera: b.flag, dias_en_etapa: b.diasEnEtapa, limite: b.limite },
    ),
    recomendaciones_previas: extras.recomendaciones.map((r) => ({
      fecha: r.generatedAt.toISOString(),
      etiqueta: r.etiqueta,
      por: r.generatedBy,
    })),
  };
}

export type ActividadEntrada = {
  id: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  transcript: string | null;
  startsAt: Date;
  durationMin: number | null;
  completedAt: Fecha;
  type: { name: string };
  user: { name: string };
  opportunity: { id: string; folio: string } | null;
};

/** El extracto de la lista: notas, si no resultado, si no transcripción; recortado con «…». */
export function extracto(a: Pick<ActividadEntrada, "notes" | "outcome" | "transcript">, max: number): string | null {
  const texto = a.notes?.trim() || a.outcome?.trim() || a.transcript?.trim() || null;
  if (!texto) return null;
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

export function aActividadDeLista(a: ActividadEntrada, largoDeExtracto: number) {
  return {
    activity_id: a.id,
    tipo: a.type.name,
    asunto: a.subject,
    fecha: a.startsAt.toISOString(),
    duracion_min: a.durationMin,
    hecha: a.completedAt != null,
    responsable: a.user.name,
    extracto: extracto(a, largoDeExtracto),
    tiene_transcripcion: !!a.transcript,
    longitud_transcripcion: a.transcript?.length ?? 0,
  };
}

export function aNota(a: ActividadEntrada) {
  return {
    activity_id: a.id,
    opportunity_id: a.opportunity?.id ?? null,
    folio: a.opportunity?.folio ?? null,
    tipo: a.type.name,
    asunto: a.subject,
    fecha: a.startsAt.toISOString(),
    hecha: a.completedAt != null,
    responsable: a.user.name,
    notas: a.notes,
    resultado: a.outcome,
    transcripcion: a.transcript,
  };
}
