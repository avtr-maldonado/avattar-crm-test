import { formatPercent, formatUSD, sum, type Money } from "@/lib/money";
import { ETIQUETA_TIPO_DE_NEGOCIO } from "@/lib/etiquetas";
import {
  agruparVentas,
  historicoDeVentas,
  rentabilidad,
  type TotalAgrupado,
  type VentaGanada,
} from "@/lib/domain/analisis";
import type { FiltrosDeAnalisis } from "@/lib/filters/analisis";
import { StatTile } from "@/components/ui/primitivas";
import { filasDeMargen, filasDeRentabilidad, puntosDeAvance, puntosHistoricos } from "./graficas/datos";
import { Tarjeta } from "./graficas/comun";
import { TarjetaDeAvance, TarjetaDeMargen, TarjetaDeRentabilidad, TarjetaHistorica } from "./graficas/TarjetasDeVentas";
import {
  AGRUPACIONES_HISTORICAS,
  DIMENSIONES_DE_AVANCE,
  DIMENSIONES_DE_RENTABILIDAD,
  type AgrupacionHistorica,
  type DimensionDeAvance,
  type DimensionDeRentabilidad,
} from "./graficas/tipos";

/**
 * A · Análisis de ventas: los cuatro indicadores y las cuatro gráficas.
 *
 * Componente de servidor: recibe las ventas ya acotadas por `lib/scope`, agrega
 * con las funciones puras de `lib/domain/analisis` **para cada agrupación** y
 * las convierte en puntos con `graficas/datos`. El cliente solo elige cuál
 * dibujar (decisiones §35).
 *
 * - Avance contra objetivo (1) y rentabilidad (3) miran el **año fiscal
 *   elegido** por `actualCloseDate` (§10.2).
 * - El histórico (2) mira **toda la historia**: comparar años exige más de uno.
 * - La cuota es consolidada: se suma de los renglones de objetivos que la
 *   sesión alcanza (§10.3) y no se reparte por cliente, producto ni tipo. Como
 *   producto y tipo ya no son filtros (§36), siempre es comparable con lo ganado.
 * - La utilidad solo llega con `VER_COSTO` (INV-02); sin ella no hay serie de
 *   utilidad ni gráficas de rentabilidad, y la tarjeta lo dice.
 */
export type CuotasDeVenta = {
  /** Índice 0..3 = Q1..Q4. */
  cuotaVenta: readonly Money[];
  cuotaAnualVenta: Money | null;
};

type TrimestreEnCurso = { fiscalYear: number; quarter: number };

/** Un objeto por opción de agrupación, calculado una vez en el servidor. */
function porOpcion<T extends string, R>(opciones: readonly { valor: T }[], calcular: (valor: T) => R): Record<T, R> {
  const r = {} as Record<T, R>;
  for (const o of opciones) r[o.valor] = calcular(o.valor);
  return r;
}

export function PestanaVentas({
  ventasDelAnio,
  historico,
  cuotas,
  filtros,
  fiscalYearStartMonth,
  trimestreEnCurso,
  verCosto,
}: {
  ventasDelAnio: VentaGanada[];
  historico: VentaGanada[];
  cuotas: CuotasDeVenta[];
  filtros: FiltrosDeAnalisis;
  fiscalYearStartMonth: number;
  /** El trimestre fiscal de hoy: lo que no ha empezado no se mide. */
  trimestreEnCurso: TrimestreEnCurso;
  verCosto: boolean;
}) {
  const { anio } = filtros;

  const cuotasPorTrimestre = [0, 1, 2, 3].map((i) => sum(cuotas.map((c) => c.cuotaVenta[i]!)));
  // RN-32 · si coexisten, la anual manda para el reporte de año.
  const cuotaAnual = sum(cuotas.map((c) => c.cuotaAnualVenta ?? sum([...c.cuotaVenta])));

  const agrupar = (dimension: DimensionDeAvance) =>
    agruparVentas(ventasDelAnio, dimension, { fiscalYearStartMonth, etiquetaDeTipo: ETIQUETA_TIPO_DE_NEGOCIO });
  const avance = porOpcion(DIMENSIONES_DE_AVANCE, agrupar);
  const total = avance.trimestre.total;
  const cumplimiento = cuotaAnual.isZero() ? null : total.importe.div(cuotaAnual);
  const utilidadVisible = verCosto && total.utilidad !== null;

  const variantesDeAvance = porOpcion(DIMENSIONES_DE_AVANCE, (d) =>
    puntosDeAvance(avance[d], d, {
      anio,
      cuotasPorTrimestre,
      trimestreEnCurso,
      utilidadVisible,
    }),
  );
  const variantesHistoricas = porOpcion(AGRUPACIONES_HISTORICAS, (a: AgrupacionHistorica) =>
    puntosHistoricos(historicoDeVentas(historico, a, fiscalYearStartMonth), verCosto),
  );
  const rentable = verCosto
    ? porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d: DimensionDeRentabilidad) => rentabilidad(ventasDelAnio, d, ETIQUETA_TIPO_DE_NEGOCIO))
    : null;

  return (
    <>
      <Indicadores
        anio={anio}
        total={total}
        cuotaAnual={cuotaAnual}
        cumplimiento={cumplimiento}
        utilidadVisible={utilidadVisible}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <TarjetaDeAvance anio={anio} inicial={filtros.g1} variantes={variantesDeAvance} />
        <TarjetaHistorica
          inicial={filtros.g2}
          variantes={variantesHistoricas}
          conUtilidad={verCosto && Object.values(variantesHistoricas).some((v) => v.some((p) => p.utilidad !== null))}
        />
        {rentable ? (
          <>
            <TarjetaDeRentabilidad anio={anio} inicial={filtros.g3} variantes={porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d) => filasDeRentabilidad(rentable[d]))} />
            <TarjetaDeMargen anio={anio} inicial={filtros.g3} variantes={porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d) => filasDeMargen(rentable[d]))} />
          </>
        ) : (
          <div className="xl:col-span-2">
            <Tarjeta titulo="Rentabilidad y margen" descripcion={`Ganadas en ${anio} cuya cotización trae costo. Venta, costo y utilidad salen de la cotización.`}>
              <p className="rounded-sm border border-dashed border-borde-fuerte px-4 py-6 text-center text-sm text-texto-tenue">
                La rentabilidad necesita el costo de cada venta y tu rol no lo ve. Dirección y administración sí.
              </p>
            </Tarjeta>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────── Indicadores

function Indicadores({
  anio,
  total,
  cuotaAnual,
  cumplimiento,
  utilidadVisible,
}: {
  anio: number;
  total: TotalAgrupado;
  cuotaAnual: Money;
  cumplimiento: Money | null;
  utilidadVisible: boolean;
}) {
  const ticketPromedio = total.cuantas > 0 ? total.importe.div(total.cuantas) : null;
  const margen = utilidadVisible && !total.importe.isZero() ? total.utilidad!.div(total.importe) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        denso
        etiqueta={`Ganado ${anio}`}
        valor={formatUSD(total.importe)}
        subtexto={`${total.cuantas} ${total.cuantas === 1 ? "negocio" : "negocios"} por fecha de cierre real`}
      />
      <StatTile
        denso
        etiqueta="Cuota consolidada"
        valor={formatUSD(cuotaAnual)}
        subtexto="suma de las cuotas del alcance"
      />
      <StatTile
        denso
        etiqueta="Cumplimiento"
        valor={cumplimiento ? formatPercent(cumplimiento, 0) : "Sin cuota"}
        subtexto={
          cumplimiento
            ? cumplimiento.gte(1)
              ? `${formatUSD(total.importe.minus(cuotaAnual))} arriba de la cuota`
              : `faltan ${formatUSD(cuotaAnual.minus(total.importe))}`
            : `no hay cuota fijada para ${anio}`
        }
        tono={cumplimiento?.gte(1) ? "exito" : "neutro"}
      />
      {utilidadVisible ? (
        <StatTile
          denso
          etiqueta="Utilidad de venta"
          valor={formatUSD(total.utilidad!)}
          subtexto={margen ? `${formatPercent(margen)} de margen sobre lo ganado` : "sin importe ganado"}
          tono={margen !== null && margen.isNegative() ? "peligro" : "neutro"}
        />
      ) : (
        <StatTile
          denso
          etiqueta="Ticket promedio"
          valor={ticketPromedio ? formatUSD(ticketPromedio) : "—"}
          subtexto={ticketPromedio ? "importe medio por negocio ganado" : "sin negocios ganados"}
        />
      )}
    </div>
  );
}
