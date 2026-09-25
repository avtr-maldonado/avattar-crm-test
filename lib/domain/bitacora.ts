import { formatUSD, money } from "@/lib/money";

/**
 * La bitácora de una oportunidad · P-02, pestaña Bitácora.
 *
 * Una sola historia armada desde cuatro fuentes que ya existían por separado:
 * las transiciones de etapa, la auditoría (`AuditLog`) de la oportunidad y de
 * su cotización, las actividades **hechas**, y el alta. Nada se guarda de más:
 * la bitácora es una lectura, no una tabla nueva.
 *
 * Es pura para poder probarla sin base y para que la pantalla no arme nada:
 * recibe los eventos ya ordenados y con su texto.
 */

export type TipoDeEvento =
  | "CREACION"
  | "ETAPA"
  | "CIERRE"
  | "PROPIETARIO"
  | "COTIZACION"
  | "ACTIVIDAD"
  | "GANADA"
  | "PERDIDA";

export type FiltroDeBitacora = "todo" | "etapas" | "cotizacion" | "actividades" | "cambios";

export type EventoDeBitacora = {
  id: string;
  tipo: TipoDeEvento;
  cuando: Date;
  quien: string;
  titulo: string;
  detalle?: string;
  /** Solo en ETAPA: avanzó pese a una compuerta en advertencia (§8.3). */
  conAdvertencia?: boolean;
};

type Persona = { name: string };

export type FuentesDeBitacora = {
  oportunidad: { createdAt: Date; createdBy: Persona };
  transiciones: {
    id: string;
    atDate: Date;
    gateOverride: boolean;
    fromStage: { name: string } | null;
    toStage: { name: string };
    byUser: Persona;
  }[];
  auditoria: {
    id: string;
    at: Date;
    action: string;
    before: unknown;
    after: unknown;
    byUser: Persona;
  }[];
  actividades: {
    id: string;
    subject: string;
    completedAt: Date | null;
    type: { name: string };
    user: Persona;
  }[];
  /** INV-02 · sin él, los cambios de costo se nombran pero no se cifran. */
  verCosto: boolean;
};

/** Lo que `EDITAR_COTIZACION` guarda en `after.linea`. */
type LineaAuditada = {
  descripcion: string;
  campo?: "quantity" | "unitPrice" | "discountRate" | "unitCost";
  de?: string;
  a?: string;
  alta?: boolean;
  baja?: boolean;
};

const NOMBRE_DE_CAMPO: Record<NonNullable<LineaAuditada["campo"]>, string> = {
  quantity: "cantidad",
  unitPrice: "precio",
  discountRate: "descuento",
  unitCost: "costo unitario",
};

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  // Los cierres se guardan al mediodía UTC: leerlos en UTC da el día correcto.
  timeZone: "UTC",
});

export function construirBitacora(f: FuentesDeBitacora): EventoDeBitacora[] {
  const eventos: EventoDeBitacora[] = [];

  // La transición sin origen es el alta: nadie «se movió» a la primera etapa.
  const nacimiento = f.transiciones.find((t) => t.fromStage === null);
  eventos.push({
    id: "creacion",
    tipo: "CREACION",
    cuando: f.oportunidad.createdAt,
    quien: f.oportunidad.createdBy.name,
    titulo: nacimiento ? `Creada en ${nacimiento.toStage.name}` : "Creada",
  });

  for (const t of f.transiciones) {
    if (t.fromStage === null) continue;
    eventos.push({
      id: t.id,
      tipo: "ETAPA",
      cuando: t.atDate,
      quien: t.byUser.name,
      titulo: `Etapa: ${t.fromStage.name} → ${t.toStage.name}`,
      conAdvertencia: t.gateOverride,
    });
  }

  for (const a of f.auditoria) {
    const evento = eventoDeAuditoria(a, f.verCosto);
    if (evento) eventos.push(evento);
  }

  for (const a of f.actividades) {
    if (!a.completedAt) continue;
    eventos.push({
      id: a.id,
      tipo: "ACTIVIDAD",
      cuando: a.completedAt,
      quien: a.user.name,
      titulo: `${a.type.name}: ${a.subject}`,
    });
  }

  // Descendente. Empates: la creación al final, que es donde empieza a leerse.
  return eventos.sort((x, y) => {
    const d = y.cuando.getTime() - x.cuando.getTime();
    if (d !== 0) return d;
    return (x.tipo === "CREACION" ? 1 : 0) - (y.tipo === "CREACION" ? 1 : 0);
  });
}

function eventoDeAuditoria(
  a: FuentesDeBitacora["auditoria"][number],
  verCosto: boolean,
): EventoDeBitacora | null {
  const antes = (a.before ?? {}) as Record<string, unknown>;
  const despues = (a.after ?? {}) as Record<string, unknown>;

  switch (a.action) {
    case "CAMBIAR_CIERRE_ESTIMADO":
      return {
        id: a.id,
        tipo: "CIERRE",
        cuando: a.at,
        quien: a.byUser.name,
        titulo: `Cierre estimado: ${fecha(antes.expectedCloseDate)} → ${fecha(despues.expectedCloseDate)}`,
      };

    // El resultado de la oportunidad (§25): con el importe o el motivo, y desde
    // qué etapa se cerró, porque ganar o perder no mueve de columna.
    case "MARCAR_GANADA":
      return {
        id: a.id,
        tipo: "GANADA",
        cuando: a.at,
        quien: a.byUser.name,
        titulo: `Ganada · ${importe(despues.amount)}`,
        detalle: despues.stage ? `Desde ${String(despues.stage)}` : undefined,
      };

    case "MARCAR_PERDIDA": {
      const motivo = typeof despues.lossReason === "string" ? despues.lossReason : "sin motivo";
      const competidor =
        typeof despues.lossCompetitor === "string" && despues.lossCompetitor
          ? `Competidor: ${despues.lossCompetitor}`
          : null;
      const desde = despues.stage ? `Desde ${String(despues.stage)}` : null;
      return {
        id: a.id,
        tipo: "PERDIDA",
        cuando: a.at,
        quien: a.byUser.name,
        titulo: `Perdida · ${motivo}`,
        detalle: [competidor, desde].filter(Boolean).join(" · ") || undefined,
      };
    }

    case "CAMBIAR_PROPIETARIO":
      return {
        id: a.id,
        tipo: "PROPIETARIO",
        cuando: a.at,
        quien: a.byUser.name,
        titulo: "Propietario reasignado",
      };

    case "EDITAR_COTIZACION": {
      // Un alta o una baja traen una línea; un guardado trae la lista de lo
      // que cambió. Los dos se leen como una sola entrada.
      const lineas = Array.isArray(despues.lineas)
        ? (despues.lineas as LineaAuditada[])
        : despues.linea
          ? [despues.linea as LineaAuditada]
          : [];
      return {
        id: a.id,
        tipo: "COTIZACION",
        cuando: a.at,
        quien: a.byUser.name,
        titulo: `Cotización: ${importe(antes.netSubtotal)} → ${importe(despues.netSubtotal)}`,
        detalle: lineas.length
          ? lineas.map((l) => detalleDeLinea(l, verCosto)).join("; ")
          : undefined,
      };
    }

    default:
      return null;
  }
}

function detalleDeLinea(l: LineaAuditada, verCosto: boolean): string {
  if (l.alta) return `Se agregó «${l.descripcion}»`;
  if (l.baja) return `Se quitó «${l.descripcion}»`;
  if (!l.campo) return l.descripcion;

  const nombre = NOMBRE_DE_CAMPO[l.campo];
  // INV-02 · el costo se nombra —hubo un cambio— pero no se cifra sin permiso.
  if (l.campo === "unitCost" && !verCosto) return `${l.descripcion} · ${nombre}`;
  // El descuento viaja como porcentaje ya: solo le falta el signo.
  const unidad = l.campo === "discountRate" ? " %" : "";
  return `${l.descripcion} · ${nombre} ${l.de ?? "?"}${unidad} → ${l.a ?? "?"}${unidad}`;
}

function fecha(valor: unknown): string {
  const d = typeof valor === "string" || valor instanceof Date ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? FECHA.format(d) : "—";
}

function importe(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number" ? formatUSD(money(String(valor))) : "—";
}

const GRUPOS: Record<Exclude<FiltroDeBitacora, "todo">, ReadonlySet<TipoDeEvento>> = {
  etapas: new Set(["ETAPA", "CREACION"]),
  cotizacion: new Set(["COTIZACION"]),
  actividades: new Set(["ACTIVIDAD"]),
  cambios: new Set(["CIERRE", "PROPIETARIO", "GANADA", "PERDIDA"]),
};

export const FILTROS_DE_BITACORA: { valor: FiltroDeBitacora; etiqueta: string }[] = [
  { valor: "todo", etiqueta: "Todo" },
  { valor: "etapas", etiqueta: "Etapas" },
  { valor: "cotizacion", etiqueta: "Cotización" },
  { valor: "actividades", etiqueta: "Actividades" },
  { valor: "cambios", etiqueta: "Cambios" },
];

/** Un filtro que no existe es «todo»: la URL puede traer cualquier cosa. */
export function filtrarBitacora(eventos: EventoDeBitacora[], filtro: string): EventoDeBitacora[] {
  const tipos = (GRUPOS as Record<string, ReadonlySet<TipoDeEvento> | undefined>)[filtro];
  if (!tipos) return eventos;
  return eventos.filter((e) => tipos.has(e.tipo));
}
