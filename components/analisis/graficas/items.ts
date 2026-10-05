import { formatPercent, formatUSD, type Money } from "@/lib/money";
import type { ActividadHecha, OportunidadAbierta, VentaGanada } from "@/lib/domain/analisis";
import type { ItemDePunto, Tono } from "./tipos";

/**
 * De una venta, una abierta o una actividad al ítem que se lista al pulsar
 * una barra (decisiones §43). Corre en el servidor, junto con `datos*.ts`:
 * aquí se formatea dinero y fecha; el popup solo pinta.
 *
 * Los ítems llevan siempre el folio y el nombre, y el enlace a la ficha. El
 * costo no entra en ningún ítem salvo donde la gráfica ya lo exige
 * (rentabilidad y margen, que solo existen con `VER_COSTO`, INV-02).
 */
const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  // Los cierres se guardan al mediodía UTC: leerlos en UTC da el día correcto.
  timeZone: "UTC",
});

export function fechaDeItem(d: Date): string {
  return FECHA.format(d);
}

/** Índice por id, para resolver los ids que devuelve el dominio. */
export function porId<T extends { id: string }>(lista: readonly T[]): ReadonlyMap<string, T> {
  return new Map(lista.map((x) => [x.id, x]));
}

/** Resuelve ids contra el índice, saltando los que no estén: una lista acotada nunca inventa una fila. */
export function resolver<T extends { id: string }, R>(ids: readonly string[], indice: ReadonlyMap<string, T>, convertir: (x: T) => R): R[] {
  return ids.flatMap((id) => {
    const x = indice.get(id);
    return x ? [convertir(x)] : [];
  });
}

export function itemDeVenta(
  v: VentaGanada,
  cifra: string,
  opciones: { nota?: string; tono?: Tono } = {},
): ItemDePunto {
  return {
    clave: v.id,
    href: `/oportunidades/${v.id}`,
    titulo: `${v.folio} · ${v.name}`,
    subtitulo: `${v.organization.name} · ${v.owner.name}`,
    cifra,
    nota: opciones.nota ?? `Cerrada ${fechaDeItem(v.actualCloseDate)}`,
    ...(opciones.tono ? { tono: opciones.tono } : {}),
  };
}

export function itemDeAbierta(
  o: OportunidadAbierta,
  opciones: { cifra?: string; nota?: string; tono?: Tono } = {},
): ItemDePunto {
  return {
    clave: o.id,
    href: `/oportunidades/${o.id}`,
    titulo: `${o.folio} · ${o.name}`,
    subtitulo: `${o.organization.name} · ${o.owner.name}`,
    cifra: opciones.cifra ?? formatUSD(o.amount),
    nota: opciones.nota ?? `${o.stage.name} · ${formatPercent(o.stage.probability, 0)}`,
    ...(opciones.tono ? { tono: opciones.tono } : {}),
  };
}

export function itemDeActividad(a: ActividadHecha): ItemDePunto {
  return {
    clave: a.id,
    ...(a.opportunity ? { href: `/oportunidades/${a.opportunity.id}` } : {}),
    titulo: a.subject,
    subtitulo: a.opportunity ? `${a.opportunity.folio} · ${a.opportunity.name}` : "Sin oportunidad",
    cifra: fechaDeItem(a.completedAt),
    nota: `${a.tipo} · ${a.usuario.name}`,
  };
}

/** Importe y, si llegó, utilidad: el renglón de una venta en rentabilidad. */
export function notaDeUtilidad(utilidad: Money | null, costo?: Money): string {
  if (utilidad === null) return "Sin costo";
  const partes = [`Utilidad ${formatUSD(utilidad)}`];
  if (costo) partes.unshift(`Costo ${formatUSD(costo)}`);
  return partes.join(" · ");
}
