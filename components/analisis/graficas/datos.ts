import { formatPercent, formatUSD, type Money } from "@/lib/money";
import {
  completarTrimestres,
  type AporteDeRentabilidad,
  type AporteDeVenta,
  type DimensionDeVenta,
  type FilaAgrupada,
  type FilaDeRentabilidad,
  type FilaHistorica,
  type TotalAgrupado,
  type TrimestreConCuota,
  type VentaGanada,
} from "@/lib/domain/analisis";
import { itemDeVenta, notaDeUtilidad, porId } from "./items";
import type { DetalleDePunto, FilaApilada, FilaDeMargen, ItemDePunto, PuntoHistorico, SerieDeAvance } from "./tipos";

/**
 * De las filas agregadas de `lib/domain/analisis` a los puntos de las gráficas.
 *
 * Corre en el servidor, dentro de `PestanaVentas`: recibe `Decimal`, decide el
 * orden, qué se atenúa y qué dice cada tooltip, y entrega números y textos.
 * La gráfica no calcula ni formatea dinero; solo dibuja lo que llega.
 *
 * Reglas que se conservan de las tablas que sustituyen (decisiones §28):
 * - Por trimestre se pintan los cuatro, cronológicos, aunque estén en cero; por
 *   cliente, producto o tipo, de mayor a menor ganado. El total no es una barra.
 * - Sin cuota no se inventa una: ni serie ni renglón en el tooltip.
 * - La utilidad solo aparece con `VER_COSTO` (INV-02): el servidor la omite.
 *
 * Cada punto lleva además sus **ítems** (decisiones §43): las ventas que lo
 * suman, resueltas por id contra la lista acotada que llegó de `lib/scope`.
 * Un aporte cuya venta no esté en la lista se omite: nada se inventa.
 */
const NOTA_PRODUCTO =
  "Por producto, cada venta se reparte entre las líneas de su cotización; el número de negocios de una barra cuenta en cuántas oportunidades aparece ese producto.";

const numero = (m: Money): number => m.toNumber();

function negocios(cuantas: number): DetalleDePunto {
  return { etiqueta: "Negocios", texto: String(cuantas) };
}

function utilidadDe(u: Money | null): DetalleDePunto {
  if (u === null) return { etiqueta: "Utilidad", texto: "sin costo", tono: "tenue" };
  return { etiqueta: "Utilidad", texto: formatUSD(u), ...(u.isNegative() ? { tono: "peligro" as const } : {}) };
}

function cumplimientoDe(t: TrimestreConCuota): DetalleDePunto {
  // Un trimestre que no ha empezado no se mide (C-02); el que corre no se reclama.
  if (t.cumplimiento === null || t.estado === "futuro") return { etiqueta: "Cumplimiento", texto: "—", tono: "tenue" };
  const texto = formatPercent(t.cumplimiento, 0);
  if (t.cumplimiento.gte(1)) return { etiqueta: "Cumplimiento", texto, tono: "exito" };
  return t.estado === "cerrado" ? { etiqueta: "Cumplimiento", texto, tono: "peligro" } : { etiqueta: "Cumplimiento", texto };
}

/** Las ventas de una fila, con lo que cada una puso en ella. */
function itemsDeVenta(aportes: readonly AporteDeVenta[], indice: ReadonlyMap<string, VentaGanada>): ItemDePunto[] {
  return aportes.flatMap((a) => {
    const v = indice.get(a.id);
    return v ? [itemDeVenta(v, formatUSD(a.importe))] : [];
  });
}

export function puntosDeAvance(
  agrupado: { filas: readonly FilaAgrupada[]; total: TotalAgrupado },
  dimension: DimensionDeVenta,
  opciones: {
    /** El año fiscal de la cuota: el del inicio del lapso. */
    anio: number;
    /**
     * Las claves de trimestre que se dibujan y se comparan con la cuota
     * (`trimestresDelLapso`, §45): los cuatro de un año, el único de un
     * trimestre. Nulo con un mes o un rango: se dibuja solo lo que hubo y no
     * hay cuota, porque la cuota existe por trimestre completo.
     */
    trimestres: readonly string[] | null;
    /** Nula cuando la cuota no es comparable con los filtros (producto o tipo). */
    cuotasPorTrimestre: readonly Money[] | null;
    trimestreEnCurso: { fiscalYear: number; quarter: number };
    utilidadVisible: boolean;
    /** Las ventas de donde salen las filas: para listar las de cada barra (§43). */
    ventas: readonly VentaGanada[];
  },
): SerieDeAvance {
  const { filas, total } = agrupado;
  if (total.cuantas === 0) return { puntos: [], conCuota: false, nota: null };
  const indice = porId(opciones.ventas);

  if (dimension === "trimestre" && opciones.trimestres !== null) {
    const cuotas = opciones.cuotasPorTrimestre;
    const conCuota = cuotas !== null && cuotas.some((c) => !c.isZero());
    const visibles = new Set(opciones.trimestres);
    const trimestres = completarTrimestres(filas, opciones.anio, conCuota ? cuotas : [], opciones.trimestreEnCurso).filter((t) =>
      visibles.has(t.clave),
    );
    const puntos = trimestres.map((t) => {
      const detalle: DetalleDePunto[] = [
        { etiqueta: "Ganado", texto: formatUSD(t.importe) },
        negocios(t.cuantas),
        { etiqueta: "Participación", texto: formatPercent(t.participacion) },
        ...(opciones.utilidadVisible ? [utilidadDe(t.utilidad)] : []),
      ];
      if (conCuota) {
        detalle.push(
          t.cuota.isZero() ? { etiqueta: "Cuota", texto: "—", tono: "tenue" } : { etiqueta: "Cuota", texto: formatUSD(t.cuota) },
          cumplimientoDe(t),
        );
      }
      if (t.estado === "en_curso") detalle.push({ etiqueta: "Estado", texto: "En curso" });
      if (t.estado === "futuro") detalle.push({ etiqueta: "Estado", texto: "No ha empezado", tono: "tenue" });
      return {
        clave: t.clave,
        etiqueta: t.etiqueta,
        valor: numero(t.importe),
        ...(conCuota ? { cuota: numero(t.cuota) } : {}),
        ...(t.estado === "futuro" ? { tenue: true } : {}),
        detalle,
        items: itemsDeVenta(t.aportes, indice),
      };
    });
    return { puntos, conCuota, nota: null };
  }

  // Por trimestre sin cuota comparable (un mes, un rango): lo que hubo, cronológico.
  // Por cliente, producto o tipo: de mayor a menor ganado.
  const ordenadas = dimension === "trimestre" ? [...filas] : [...filas].sort((a, b) => b.importe.minus(a.importe).toNumber());
  const puntos = ordenadas.map((f) => ({
      clave: f.clave,
      etiqueta: f.etiqueta,
      valor: numero(f.importe),
      ...(f.clave === "__sin_cotizacion" ? { tenue: true } : {}),
      detalle: [
        { etiqueta: "Ganado", texto: formatUSD(f.importe) },
        negocios(f.cuantas),
        { etiqueta: "Participación", texto: formatPercent(f.participacion) },
        ...(opciones.utilidadVisible ? [utilidadDe(f.utilidad)] : []),
      ],
      items: itemsDeVenta(f.aportes, indice),
    }));
  return { puntos, conCuota: false, nota: dimension === "producto" ? NOTA_PRODUCTO : null };
}

function variacionDe(v: Money | null): DetalleDePunto {
  if (v === null) return { etiqueta: "Variación", texto: "—", tono: "tenue" };
  const texto = `${v.isNegative() ? "−" : "+"}${formatPercent(v.abs(), 0)}`;
  return { etiqueta: "Variación", texto, tono: v.isNegative() ? "peligro" : "exito" };
}

export function puntosHistoricos(
  h: { filas: readonly FilaHistorica[] },
  utilidadVisible: boolean,
  ventas: readonly VentaGanada[],
): PuntoHistorico[] {
  const indice = porId(ventas);
  return h.filas.map((f) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    ganado: numero(f.importe),
    utilidad: utilidadVisible && f.utilidad !== null ? numero(f.utilidad) : null,
    detalle: [
      { etiqueta: "Ganado", texto: formatUSD(f.importe) },
      ...(utilidadVisible ? [utilidadDe(f.utilidad)] : []),
      variacionDe(f.variacion),
      { etiqueta: "Participación", texto: formatPercent(f.participacion) },
      negocios(f.cuantas),
    ],
    items: itemsDeVenta(f.aportes, indice),
  }));
}

function margenDe(m: Money): DetalleDePunto {
  return { etiqueta: "Margen", texto: formatPercent(m), ...(m.isNegative() ? { tono: "peligro" as const } : {}) };
}

/**
 * Las ventas de una fila de rentabilidad. Estas gráficas solo existen con
 * `VER_COSTO` (INV-02): el lector no manda costo sin él y la pestaña no las
 * pinta, así que aquí el costo de cada venta sí se escribe.
 */
function itemsDeRentabilidad(
  aportes: readonly AporteDeRentabilidad[],
  indice: ReadonlyMap<string, VentaGanada>,
  modo: "venta" | "margen",
): ItemDePunto[] {
  return aportes.flatMap((a) => {
    const v = indice.get(a.id);
    if (!v) return [];
    const utilidad = a.importe.minus(a.costo);
    const tono = utilidad.isNegative() ? ("peligro" as const) : undefined;
    if (modo === "venta") return [itemDeVenta(v, formatUSD(a.importe), { nota: notaDeUtilidad(utilidad, a.costo), tono })];
    const margen = a.importe.isZero() ? a.importe : utilidad.div(a.importe);
    return [itemDeVenta(v, formatPercent(margen), { nota: `Venta ${formatUSD(a.importe)} · Utilidad ${formatUSD(utilidad)}`, tono })];
  });
}

export function filasDeRentabilidad(r: { filas: readonly FilaDeRentabilidad[] }, ventas: readonly VentaGanada[]): FilaApilada[] {
  const indice = porId(ventas);
  return [...r.filas]
    .sort((a, b) => b.importe.minus(a.importe).toNumber())
    .map((f) => ({
      clave: f.clave,
      etiqueta: f.etiqueta,
      costo: numero(f.costo),
      // Una pérdida no cabe en una barra apilada: la barra muestra el costo y el
      // tooltip dice la utilidad negativa en coral.
      utilidad: Math.max(0, numero(f.utilidad)),
      venta: numero(f.importe),
      detalle: [
        { etiqueta: "Venta", texto: formatUSD(f.importe) },
        { etiqueta: "Costo", texto: formatUSD(f.costo) },
        utilidadDe(f.utilidad),
        margenDe(f.margen),
        negocios(f.cuantas),
      ],
      items: itemsDeRentabilidad(f.aportes, indice, "venta"),
    }));
}

export function filasDeMargen(r: { filas: readonly FilaDeRentabilidad[] }, ventas: readonly VentaGanada[]): FilaDeMargen[] {
  const indice = porId(ventas);
  return [...r.filas]
    .sort((a, b) => b.margen.minus(a.margen).toNumber())
    .map((f) => ({
      clave: f.clave,
      etiqueta: f.etiqueta,
      margen: Math.max(0, numero(f.margen)),
      margenTexto: formatPercent(f.margen),
      negativo: f.margen.isNegative(),
      detalle: [
        margenDe(f.margen),
        { etiqueta: "Venta", texto: formatUSD(f.importe) },
        utilidadDe(f.utilidad),
        negocios(f.cuantas),
      ],
      items: itemsDeRentabilidad(f.aportes, indice, "margen"),
    }));
}
