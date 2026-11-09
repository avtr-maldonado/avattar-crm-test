import type { Session } from "@/lib/auth/permissions";
import { convierteProspecto, decideComoVentas, gestionaProspecto } from "@/lib/domain/leadAccess";
import { estadoDeSla } from "@/lib/domain/leadSla";
import { esTerminal, ETIQUETA_DE_ETAPA } from "@/lib/domain/leadStages";
import type { auditoriaDeProspecto, LeadCard, LeadDetail } from "@/lib/scope/leads";
import { iniciales } from "@/lib/etiquetas";
import { diasDesde, formateadoresDe, type DatosDeProspecto } from "@/components/prospectos/formato";
import type { EventoDeHistoria } from "@/components/prospectos/DetalleDeProspecto";

/**
 * De lo que el lector trae a lo que la pantalla pinta · decisiones §58. Vive
 * junto a la página porque conoce la sesión: qué puede hacer cada quien con
 * cada prospecto se decide aquí, una vez, y los componentes solo obedecen.
 */
export type ContextoDeDatos = {
  session: Session;
  zona: string;
  ahora: Date;
  hrefDetalle: (id: string) => string;
};

export function aDatosDeProspecto(l: LeadCard, ctx: ContextoDeDatos): DatosDeProspecto {
  const f = formateadoresDe(ctx.zona);
  const terminal = esTerminal(l.stage);
  const gestiona = gestionaProspecto(ctx.session, l);
  const decide = decideComoVentas(ctx.session, l);
  // Convertir se ofrece desde Aceptado al asignado o a quien gestiona, y desde
  // Calificado o Asignado solo a quien gestiona: lo que el dominio acepta.
  const desdeDondeSePuede = l.stage === "ACEPTADO" || (gestiona && (l.stage === "CALIFICADO" || l.stage === "ASIGNADO"));
  return {
    id: l.id,
    folio: l.folio,
    contacto: l.contactName,
    iniciales: iniciales(l.contactName),
    correo: l.email,
    telefono: l.phone,
    empresa: l.companyName,
    countryCode: l.countryCode,
    canal: l.channel.name,
    campana: l.campaign?.name ?? null,
    etapa: l.stage,
    score: l.score,
    vendedor: l.assignedTo ? { id: l.assignedTo.id, nombre: l.assignedTo.name, iniciales: l.assignedTo.initials } : null,
    ingreso: f.fechaCorta.format(l.createdAt),
    dias: diasDesde(l.createdAt, ctx.ahora),
    proximaActividad: l.nextActivityAt ? f.fechaHora.format(l.nextActivityAt) : null,
    sla: estadoDeSla(l, ctx.ahora),
    href: ctx.hrefDetalle(l.id),
    puede: {
      asignar: gestiona && !terminal,
      descartar: (gestiona || decide) && !terminal,
      convertir: convierteProspecto(ctx.session, l) && desdeDondeSePuede,
      actividad: (gestiona || decide) && !terminal,
    },
  };
}

/** Transiciones y auditoría, en una sola línea de tiempo descendente. */
export function historiaDe(detalle: LeadDetail, auditoria: Awaited<ReturnType<typeof auditoriaDeProspecto>>, vendedores: { id: string; name: string }[]): EventoDeHistoria[] {
  const transiciones = detalle.transitions.map((t) => ({
    id: t.id,
    cuando: t.atDate,
    quien: t.byUser.name,
    texto: t.fromStage ? `${ETIQUETA_DE_ETAPA[t.fromStage]} → ${ETIQUETA_DE_ETAPA[t.toStage]}` : `Alta en ${ETIQUETA_DE_ETAPA[t.toStage]}`,
  }));
  const anotaciones = auditoria.flatMap((a) => {
    const despues = (a.after ?? {}) as Record<string, unknown>;
    const texto =
      a.action === "ASIGNAR_PROSPECTO"
        ? `Asignado a ${vendedores.find((v) => v.id === despues.assignedToId)?.name ?? "un vendedor"}`
        : a.action === "DESCARTAR_PROSPECTO"
          ? `Descartado · ${String(despues.motivo ?? "")}`
          : a.action === "CONVERTIR_PROSPECTO"
            ? `Convertido en ${String(despues.folio ?? "oportunidad")}`
            : null;
    return texto ? [{ id: a.id, cuando: a.at, quien: a.byUser.name, texto }] : [];
  });
  return [...transiciones, ...anotaciones].sort((x, y) => y.cuando.getTime() - x.cuando.getTime());
}
