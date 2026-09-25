import { formatPercent, formatUSD, sum, type Money } from "@/lib/money";
import { ETIQUETA_TIPO_DE_NEGOCIO } from "@/lib/etiquetas";
import {
  agruparVentas,
  completarTrimestres,
  historicoDeVentas,
  rentabilidad,
  type FilaAgrupada,
  type TotalAgrupado,
  type VentaGanada,
} from "@/lib/domain/analisis";
import type { FiltrosDeAnalisis } from "@/lib/filters/analisis";
import { StatTile } from "@/components/ui/primitivas";
import { Reporte, TablaDeAnalisis, type CeldaDeAnalisis } from "./TablaDeAnalisis";

/**
 * A · Análisis de ventas: los reportes 1, 2 y 3.
 *
 * Componente de servidor: recibe las ventas ya acotadas por `lib/scope` y
 * agrega con las funciones puras de `lib/domain/analisis`. Aquí solo se
 * formatea y se decide qué columna se muestra.
 *
 * - Avance contra objetivo (1) y rentabilidad (3) miran el **año fiscal
 *   elegido** por `actualCloseDate` (§10.2).
 * - El histórico (2) mira **toda la historia**: comparar años exige más de uno.
 * - La cuota es consolidada: se suma de los renglones de objetivos que la
 *   sesión alcanza (§10.3) y no se reparte por cliente, producto ni tipo.
 *   Con filtro de producto o de tipo, el cumplimiento no es comparable y no
 *   se pinta.
 * - La utilidad solo llega con `VER_COSTO` (INV-02); sin ella, la columna no
 *   existe y el reporte 3 lo dice.
 */

const DIMENSIONES = [
  { valor: "trimestre", etiqueta: "Trimestre" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "producto", etiqueta: "Producto" },
  { valor: "tipo", etiqueta: "Tipo de negocio" },
] as const;

const HISTORICO = [
  { valor: "anio", etiqueta: "Año" },
  { valor: "trimestre", etiqueta: "Trimestre" },
] as const;

const RENTABILIDAD = [
  { valor: "producto", etiqueta: "Producto" },
  { valor: "tipo", etiqueta: "Tipo de negocio" },
  { valor: "cliente", etiqueta: "Cliente" },
] as const;

const TITULO_DE_DIMENSION: Record<string, string> = {
  trimestre: "Trimestre",
  cliente: "Cliente",
  producto: "Producto",
  tipo: "Tipo de negocio",
  anio: "Año fiscal",
};

const NADA: CeldaDeAnalisis = { texto: "—", tono: "tenue" };
const UTILIDAD = { titulo: "Utilidad", alineacion: "derecha" as const };

export type CuotasDeVenta = {
  /** Índice 0..3 = T1..T4. */
  cuotaVenta: readonly Money[];
  cuotaAnualVenta: Money | null;
};

type TrimestreEnCurso = { fiscalYear: number; quarter: number };
type HrefDe = (cambios: Record<string, string | null>) => string;

export function PestanaVentas({
  ventasDelAnio,
  historico,
  cuotas,
  filtros,
  hrefDe,
  fiscalYearStartMonth,
  trimestreEnCurso,
  verCosto,
  pisoDeMargen,
}: {
  ventasDelAnio: VentaGanada[];
  historico: VentaGanada[];
  cuotas: CuotasDeVenta[];
  filtros: FiltrosDeAnalisis;
  hrefDe: HrefDe;
  fiscalYearStartMonth: number;
  /** El trimestre fiscal de hoy: lo que no ha empezado no se mide. */
  trimestreEnCurso: TrimestreEnCurso;
  verCosto: boolean;
  /** De la política comercial del país (INV-05): verde en o sobre él, coral debajo. */
  pisoDeMargen: Money;
}) {
  const { anio } = filtros;

  // La cuota no existe por producto ni por tipo: con esos filtros, comparar
  // lo ganado de un producto contra la cuota de todo sería engañar.
  const cuotaComparable = !filtros.producto && !filtros.tipo;
  const cuotasPorTrimestre = [0, 1, 2, 3].map((i) => sum(cuotas.map((c) => c.cuotaVenta[i]!)));
  // RN-32 · si coexisten, la anual manda para el reporte de año.
  const cuotaAnual = sum(cuotas.map((c) => c.cuotaAnualVenta ?? sum([...c.cuotaVenta])));

  const avance = agruparVentas(ventasDelAnio, filtros.g1, {
    fiscalYearStartMonth,
    etiquetaDeTipo: ETIQUETA_TIPO_DE_NEGOCIO,
  });
  const cumplimiento = cuotaComparable && !cuotaAnual.isZero() ? avance.total.importe.div(cuotaAnual) : null;
  const utilidadVisible = verCosto && avance.total.utilidad !== null;

  return (
    <>
      <Indicadores
        anio={anio}
        total={avance.total}
        cuotaAnual={cuotaAnual}
        cuotaComparable={cuotaComparable}
        cumplimiento={cumplimiento}
        utilidadVisible={utilidadVisible}
        pisoDeMargen={pisoDeMargen}
      />

      <Reporte
        titulo="Avance contra objetivo consolidado"
        fechaQueManda={`Ganadas por fecha de cierre real dentro del año fiscal ${anio}. La cuota se compara en el total y por trimestre.`}
        agrupacion={{
          etiqueta: "Agrupar por",
          opciones: DIMENSIONES,
          activa: filtros.g1,
          hrefDe: (v) => hrefDe({ g1: v }),
        }}
      >
        {filtros.g1 === "trimestre" && cuotaComparable ? (
          <AvancePorTrimestre
            anio={anio}
            filas={avance.filas}
            total={avance.total}
            cuotasPorTrimestre={cuotasPorTrimestre}
            cuotaAnual={cuotaAnual}
            cumplimiento={cumplimiento}
            trimestreEnCurso={trimestreEnCurso}
            utilidadVisible={utilidadVisible}
          />
        ) : (
          <AvancePorDimension
            anio={anio}
            dimension={filtros.g1}
            filas={avance.filas}
            total={avance.total}
            cumplimiento={cumplimiento}
            utilidadVisible={utilidadVisible}
          />
        )}
      </Reporte>

      <Reporte
        titulo="Histórico de venta"
        fechaQueManda="Toda la historia por fecha de cierre real; el filtro de año no aplica aquí. La variación es contra el periodo anterior con ventas."
        agrupacion={{
          etiqueta: "Agrupar por",
          opciones: HISTORICO,
          activa: filtros.g2,
          hrefDe: (v) => hrefDe({ g2: v }),
        }}
      >
        <Historico historico={historico} agrupar={filtros.g2} fiscalYearStartMonth={fiscalYearStartMonth} verCosto={verCosto} />
      </Reporte>

      <Reporte
        titulo="Rentabilidad"
        fechaQueManda={`Ganadas en ${anio} cuya cotización trae costo. Venta, costo y utilidad salen de la cotización; el margen se compara con el piso de ${formatPercent(pisoDeMargen, 0)}.`}
        agrupacion={
          verCosto
            ? {
                etiqueta: "Agrupar por",
                opciones: RENTABILIDAD,
                activa: filtros.g3,
                hrefDe: (v) => hrefDe({ g3: v }),
              }
            : undefined
        }
      >
        {verCosto ? (
          <Rentabilidad anio={anio} ventas={ventasDelAnio} dimension={filtros.g3} pisoDeMargen={pisoDeMargen} />
        ) : (
          <p className="rounded-sm border border-dashed border-borde-fuerte px-4 py-6 text-center text-sm text-texto-tenue">
            La rentabilidad necesita el costo de cada venta y tu rol no lo ve. Dirección y administración sí.
          </p>
        )}
      </Reporte>
    </>
  );
}

// ─────────────────────────────────────────────────────────── Indicadores

function Indicadores({
  anio,
  total,
  cuotaAnual,
  cuotaComparable,
  cumplimiento,
  utilidadVisible,
  pisoDeMargen,
}: {
  anio: number;
  total: TotalAgrupado;
  cuotaAnual: Money;
  cuotaComparable: boolean;
  cumplimiento: Money | null;
  utilidadVisible: boolean;
  pisoDeMargen: Money;
}) {
  const ticketPromedio = total.cuantas > 0 ? total.importe.div(total.cuantas) : null;
  const margen = utilidadVisible && !total.importe.isZero() ? total.utilidad!.div(total.importe) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        etiqueta={`Ganado ${anio}`}
        valor={formatUSD(total.importe)}
        subtexto={`${total.cuantas} ${total.cuantas === 1 ? "negocio" : "negocios"} por fecha de cierre real`}
      />
      <StatTile
        etiqueta="Cuota consolidada"
        valor={cuotaComparable ? formatUSD(cuotaAnual) : "—"}
        subtexto={cuotaComparable ? "suma de las cuotas del alcance" : "no se reparte por producto ni por tipo"}
      />
      <StatTile
        etiqueta="Cumplimiento"
        valor={cumplimiento ? formatPercent(cumplimiento, 0) : "Sin cuota"}
        subtexto={
          cumplimiento
            ? cumplimiento.gte(1)
              ? `${formatUSD(total.importe.minus(cuotaAnual))} arriba de la cuota`
              : `faltan ${formatUSD(cuotaAnual.minus(total.importe))}`
            : cuotaComparable
              ? `no hay cuota fijada para ${anio}`
              : "sin cuota comparable con estos filtros"
        }
        tono={cumplimiento?.gte(1) ? "exito" : "neutro"}
      />
      {utilidadVisible ? (
        <StatTile
          etiqueta="Utilidad de venta"
          valor={formatUSD(total.utilidad!)}
          subtexto={margen ? `${formatPercent(margen)} de margen sobre lo ganado` : "sin importe ganado"}
          tono={margen === null || margen.gte(pisoDeMargen) ? "exito" : "peligro"}
        />
      ) : (
        <StatTile
          etiqueta="Ticket promedio"
          valor={ticketPromedio ? formatUSD(ticketPromedio) : "—"}
          subtexto={ticketPromedio ? "importe medio por negocio ganado" : "sin negocios ganados"}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────── 1 · Avance contra objetivo

function AvancePorTrimestre({
  anio,
  filas,
  total,
  cuotasPorTrimestre,
  cuotaAnual,
  cumplimiento,
  trimestreEnCurso,
  utilidadVisible,
}: {
  anio: number;
  filas: FilaAgrupada[];
  total: TotalAgrupado;
  cuotasPorTrimestre: Money[];
  cuotaAnual: Money;
  cumplimiento: Money | null;
  trimestreEnCurso: TrimestreEnCurso;
  utilidadVisible: boolean;
}) {
  return (
    <TablaDeAnalisis
      columnas={[
        { titulo: "Trimestre" },
        { titulo: "Negocios", alineacion: "derecha" },
        { titulo: "Ganado", alineacion: "derecha" },
        { titulo: "Cuota", alineacion: "derecha" },
        { titulo: "Cumplimiento", alineacion: "derecha" },
        { titulo: "Participación", alineacion: "derecha" },
        ...(utilidadVisible ? [UTILIDAD] : []),
      ]}
      filas={completarTrimestres(filas, anio, cuotasPorTrimestre, trimestreEnCurso).map((f) => {
        // Un trimestre por venir no tiene nada que mostrar salvo su cuota; el
        // que corre se compara sin coral: todavía no se le puede reclamar.
        if (f.estado === "futuro") {
          return {
            clave: f.clave,
            celdas: [
              { texto: f.etiqueta, tono: "tenue" },
              NADA,
              NADA,
              f.cuota.isZero() ? NADA : { texto: formatUSD(f.cuota), tono: "tenue" },
              { texto: "no ha empezado", tono: "tenue" },
              NADA,
              ...(utilidadVisible ? [NADA] : []),
            ],
          };
        }
        return {
          clave: f.clave,
          celdas: [
            f.estado === "en_curso" ? `${f.etiqueta} · en curso` : f.etiqueta,
            String(f.cuantas),
            formatUSD(f.importe),
            f.cuota.isZero() ? NADA : formatUSD(f.cuota),
            f.cumplimiento
              ? {
                  texto: formatPercent(f.cumplimiento, 0),
                  tono: f.cumplimiento.gte(1) ? "exito" : f.estado === "cerrado" ? "peligro" : "titulo",
                }
              : NADA,
            { texto: formatPercent(f.participacion), barra: f.participacion.toNumber() },
            ...(utilidadVisible ? [f.cuantas === 0 ? NADA : utilidadCelda(f.utilidad)] : []),
          ],
        };
      })}
      total={[
        "Total",
        String(total.cuantas),
        formatUSD(total.importe),
        cuotaAnual.isZero() ? "—" : formatUSD(cuotaAnual),
        cumplimiento ? { texto: formatPercent(cumplimiento, 0), tono: cumplimiento.gte(1) ? "exito" : "peligro" } : "—",
        "100 %",
        ...(utilidadVisible ? [utilidadCelda(total.utilidad)] : []),
      ]}
      vacio={`Ninguna oportunidad ganada en ${anio} con estos filtros.`}
    />
  );
}

function AvancePorDimension({
  anio,
  dimension,
  filas,
  total,
  cumplimiento,
  utilidadVisible,
}: {
  anio: number;
  dimension: FiltrosDeAnalisis["g1"];
  filas: FilaAgrupada[];
  total: TotalAgrupado;
  cumplimiento: Money | null;
  utilidadVisible: boolean;
}) {
  return (
    <>
      <TablaDeAnalisis
        columnas={[
          { titulo: TITULO_DE_DIMENSION[dimension]! },
          { titulo: "Negocios", alineacion: "derecha" },
          { titulo: "Ganado", alineacion: "derecha" },
          { titulo: "Participación", alineacion: "derecha" },
          ...(utilidadVisible ? [UTILIDAD] : []),
        ]}
        filas={filas.map((f) => ({
          clave: f.clave,
          celdas: [
            f.clave === "__sin_cotizacion" ? { texto: f.etiqueta, tono: "tenue" } : f.etiqueta,
            String(f.cuantas),
            formatUSD(f.importe),
            { texto: formatPercent(f.participacion), barra: f.participacion.toNumber() },
            ...(utilidadVisible ? [utilidadCelda(f.utilidad)] : []),
          ],
        }))}
        total={[
          cumplimiento ? `Total · ${formatPercent(cumplimiento, 0)} de la cuota` : "Total",
          String(total.cuantas),
          formatUSD(total.importe),
          "100 %",
          ...(utilidadVisible ? [utilidadCelda(total.utilidad)] : []),
        ]}
        vacio={`Ninguna oportunidad ganada en ${anio} con estos filtros.`}
      />
      {dimension === "producto" && filas.length > 0 ? (
        <p className="mt-2 text-xs text-texto-tenue">
          Por producto, cada venta se reparte entre las líneas de su cotización; el número de negocios de una fila
          cuenta en cuántas oportunidades aparece ese producto.
        </p>
      ) : null}
    </>
  );
}

// ──────────────────────────────────────────────── 2 · Histórico de venta

function Historico({
  historico,
  agrupar,
  fiscalYearStartMonth,
  verCosto,
}: {
  historico: VentaGanada[];
  agrupar: FiltrosDeAnalisis["g2"];
  fiscalYearStartMonth: number;
  verCosto: boolean;
}) {
  const h = historicoDeVentas(historico, agrupar, fiscalYearStartMonth);
  const conUtilidad = verCosto && h.total.utilidad !== null;

  return (
    <TablaDeAnalisis
      columnas={[
        { titulo: TITULO_DE_DIMENSION[agrupar]! },
        { titulo: "Negocios", alineacion: "derecha" },
        { titulo: "Ganado", alineacion: "derecha" },
        { titulo: "Variación", alineacion: "derecha" },
        { titulo: "Participación", alineacion: "derecha" },
        ...(conUtilidad ? [UTILIDAD] : []),
      ]}
      filas={h.filas.map((f) => ({
        clave: f.clave,
        celdas: [
          f.etiqueta,
          String(f.cuantas),
          formatUSD(f.importe),
          f.variacion === null
            ? NADA
            : {
                texto: `${f.variacion.isNegative() ? "−" : "+"}${formatPercent(f.variacion.abs(), 0)}`,
                tono: f.variacion.isNegative() ? "peligro" : "exito",
              },
          { texto: formatPercent(f.participacion), barra: f.participacion.toNumber() },
          ...(conUtilidad ? [utilidadCelda(f.utilidad)] : []),
        ],
      }))}
      total={[
        "Total",
        String(h.total.cuantas),
        formatUSD(h.total.importe),
        "",
        "100 %",
        ...(conUtilidad ? [utilidadCelda(h.total.utilidad)] : []),
      ]}
      vacio="Todavía no hay oportunidades ganadas con estos filtros. El histórico se llena conforme se cierran negocios."
    />
  );
}

// ────────────────────────────────────────────────────── 3 · Rentabilidad

function Rentabilidad({
  anio,
  ventas,
  dimension,
  pisoDeMargen,
}: {
  anio: number;
  ventas: VentaGanada[];
  dimension: FiltrosDeAnalisis["g3"];
  pisoDeMargen: Money;
}) {
  const r = rentabilidad(ventas, dimension, ETIQUETA_TIPO_DE_NEGOCIO);
  const margen = (m: Money): CeldaDeAnalisis => ({
    texto: formatPercent(m),
    tono: m.gte(pisoDeMargen) ? "exito" : "peligro",
    negrita: true,
  });

  return (
    <TablaDeAnalisis
      columnas={[
        { titulo: TITULO_DE_DIMENSION[dimension]! },
        { titulo: "Negocios", alineacion: "derecha" },
        { titulo: "Venta", alineacion: "derecha" },
        { titulo: "Costo", alineacion: "derecha" },
        { titulo: "Utilidad", alineacion: "derecha" },
        { titulo: "Margen", alineacion: "derecha" },
      ]}
      filas={r.filas.map((f) => ({
        clave: f.clave,
        celdas: [
          f.etiqueta,
          String(f.cuantas),
          formatUSD(f.importe),
          formatUSD(f.costo),
          formatUSD(f.utilidad),
          margen(f.margen),
        ],
      }))}
      total={[
        "Total",
        String(r.total.cuantas),
        formatUSD(r.total.importe),
        formatUSD(r.total.costo),
        formatUSD(r.total.utilidad),
        margen(r.total.margen),
      ]}
      vacio={`Ninguna venta ganada en ${anio} tiene cotización con costo. Sin costo no hay rentabilidad que calcular.`}
    />
  );
}

function utilidadCelda(u: Money | null): CeldaDeAnalisis {
  return u === null ? { texto: "sin costo", tono: "tenue" } : formatUSD(u);
}
