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
import { enElLapso, etiquetaDeLapso, trimestresDelLapso } from "@/lib/filters/lapso";
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
  ventasDelLapso,
  historico,
  cuotas,
  filtros,
  fiscalYearStartMonth,
  trimestreEnCurso,
  verCosto,
}: {
  /** Las ganadas por cierre real dentro del lapso (§45). */
  ventasDelLapso: VentaGanada[];
  historico: VentaGanada[];
  cuotas: CuotasDeVenta[];
  filtros: FiltrosDeAnalisis;
  fiscalYearStartMonth: number;
  /** El trimestre fiscal de hoy: lo que no ha empezado no se mide. */
  trimestreEnCurso: TrimestreEnCurso;
  verCosto: boolean;
}) {
  const { anio, lapso } = filtros;
  const etiqueta = etiquetaDeLapso(lapso);
  const prosa = enElLapso(lapso);
  // La cuota existe por trimestre: solo se compara con un año o un trimestre
  // fiscal completos (§45). Con un mes o un rango no hay trimestres que dibujar
  // ni cuota que reclamar.
  const trimestres = trimestresDelLapso(lapso);

  const cuotasPorTrimestre = [0, 1, 2, 3].map((i) => sum(cuotas.map((c) => c.cuotaVenta[i]!)));
  // RN-32 · si coexisten, la anual manda para el reporte de año.
  const cuotaAnual = sum(cuotas.map((c) => c.cuotaAnualVenta ?? sum([...c.cuotaVenta])));
  const cuotaDelLapso = lapso.tipo === "anio" ? cuotaAnual : lapso.tipo === "trimestre" ? cuotasPorTrimestre[lapso.quarter - 1]! : null;

  const agrupar = (dimension: DimensionDeAvance) =>
    agruparVentas(ventasDelLapso, dimension, { fiscalYearStartMonth, etiquetaDeTipo: ETIQUETA_TIPO_DE_NEGOCIO });
  const avance = porOpcion(DIMENSIONES_DE_AVANCE, agrupar);
  const total = avance.trimestre.total;
  const cumplimiento = cuotaDelLapso === null || cuotaDelLapso.isZero() ? null : total.importe.div(cuotaDelLapso);
  const utilidadVisible = verCosto && total.utilidad !== null;

  // Cada punto lleva las ventas que lo suman, para el detalle al pulsar (§43).
  const variantesDeAvance = porOpcion(DIMENSIONES_DE_AVANCE, (d) =>
    puntosDeAvance(avance[d], d, {
      anio,
      trimestres,
      cuotasPorTrimestre,
      trimestreEnCurso,
      utilidadVisible,
      ventas: ventasDelLapso,
    }),
  );
  const variantesHistoricas = porOpcion(AGRUPACIONES_HISTORICAS, (a: AgrupacionHistorica) =>
    puntosHistoricos(historicoDeVentas(historico, a, fiscalYearStartMonth), verCosto, historico),
  );
  const rentable = verCosto
    ? porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d: DimensionDeRentabilidad) => rentabilidad(ventasDelLapso, d, ETIQUETA_TIPO_DE_NEGOCIO))
    : null;

  return (
    <>
      <Indicadores
        etiqueta={etiqueta}
        total={total}
        cuota={cuotaDelLapso}
        cumplimiento={cumplimiento}
        utilidadVisible={utilidadVisible}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <TarjetaDeAvance lapso={prosa} inicial={filtros.g1} variantes={variantesDeAvance} />
        <TarjetaHistorica
          inicial={filtros.g2}
          variantes={variantesHistoricas}
          conUtilidad={verCosto && Object.values(variantesHistoricas).some((v) => v.some((p) => p.utilidad !== null))}
        />
        {rentable ? (
          <>
            <TarjetaDeRentabilidad
              lapso={prosa}
              inicial={filtros.g3}
              variantes={porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d) => filasDeRentabilidad(rentable[d], ventasDelLapso))}
            />
            <TarjetaDeMargen
              lapso={prosa}
              inicial={filtros.g3}
              variantes={porOpcion(DIMENSIONES_DE_RENTABILIDAD, (d) => filasDeMargen(rentable[d], ventasDelLapso))}
            />
          </>
        ) : (
          <div className="xl:col-span-2">
            <Tarjeta titulo="Rentabilidad y margen">
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
  etiqueta,
  total,
  cuota,
  cumplimiento,
  utilidadVisible,
}: {
  /** «Año fiscal 2026», «Q3 2026», «sep 2026»… */
  etiqueta: string;
  total: TotalAgrupado;
  /** La cuota del lapso: la anual, la del trimestre, o nula con un mes o un rango (§45). */
  cuota: Money | null;
  cumplimiento: Money | null;
  utilidadVisible: boolean;
}) {
  const ticketPromedio = total.cuantas > 0 ? total.importe.div(total.cuantas) : null;
  const margen = utilidadVisible && !total.importe.isZero() ? total.utilidad!.div(total.importe) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        denso
        etiqueta={`Ganado · ${etiqueta}`}
        valor={formatUSD(total.importe)}
        subtexto={`${total.cuantas} ${total.cuantas === 1 ? "negocio" : "negocios"} por fecha de cierre real`}
      />
      <StatTile
        denso
        etiqueta="Cuota consolidada"
        valor={cuota ? formatUSD(cuota) : "—"}
        subtexto={cuota ? "suma de las cuotas del alcance" : "la cuota es por trimestre fiscal"}
      />
      <StatTile
        denso
        etiqueta="Cumplimiento"
        valor={cumplimiento ? formatPercent(cumplimiento, 0) : cuota ? "Sin cuota" : "—"}
        subtexto={
          cumplimiento && cuota
            ? cumplimiento.gte(1)
              ? `${formatUSD(total.importe.minus(cuota))} arriba de la cuota`
              : `faltan ${formatUSD(cuota.minus(total.importe))}`
            : cuota
              ? `no hay cuota fijada para ${etiqueta.toLocaleLowerCase("es")}`
              : "sin cuota comparable en este lapso"
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
