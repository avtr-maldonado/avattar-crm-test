import Link from "next/link";
import clsx from "clsx";
import { formatUSD, money } from "@/lib/money";
import { ETIQUETA_CATEGORIA } from "@/lib/etiquetas";
import {
  antiguedadYEstancamiento,
  cicloDeVenta,
  embudoDeForecast,
  type OportunidadAbierta,
  type VentaGanada,
} from "@/lib/domain/analisis";
import type { FiltrosDeAnalisis } from "@/lib/filters/analisis";
import type { ForecastCategory } from "@/lib/dto";
import { ControlSegmentado, StatTile } from "@/components/ui/primitivas";
import { TablaDeAnalisis, type CeldaDeAnalisis } from "./TablaDeAnalisis";
import { Tarjeta } from "./graficas/comun";
import {
  barrasDeCiclo,
  dias,
  distribucionDelPipeline,
  estadoDeEtapa,
  estadoPorVendedor,
  puntosDeAntiguedad,
  puntosDeEmbudo,
  serieDeCiclo,
} from "./graficas/datosDeForecast";
import { TarjetaDeCiclo, TarjetaDeDispersion, TarjetaDeDistribucion, TarjetaDeEmbudo, TarjetaDeEstado } from "./graficas/TarjetasDeForecast";

/**
 * B · Forecast: los reportes 4, 5 y 6, en gráficas (decisiones §37).
 *
 * Componente de servidor: recibe lo abierto y lo ganado ya acotados por
 * `lib/scope`, agrega con las funciones puras de `lib/domain/analisis` y
 * convierte con `graficas/datosDeForecast`. El cliente solo dibuja y conmuta.
 *
 * - El embudo (4) agrupa lo **abierto** por trimestre de cierre estimado
 *   (`expectedCloseDate`, §10.2). El ponderado es importe × probabilidad de
 *   etapa (RN-01); la probabilidad mínima y las categorías de pronóstico
 *   recortan antes de agregar y viven en la URL como todo lo demás (INV-10).
 *   La distribución por cliente o vendedor suma los subgrupos de todos los
 *   trimestres y conmuta al instante (`g4`).
 * - El ciclo de venta (5) mide del alta al cierre real de las ganadas del año:
 *   por vendedor con la mediana de referencia, o por trimestre como línea (`g5`).
 * - Antigüedad y estancamiento (6) usan las mismas banderas del kanban
 *   (INV-11): un reporte que las calculara aparte diría otra cosa que el
 *   tablero. La banda «en riesgo» (75 % del límite de etapa) es de presentación.
 */

const PROBABILIDADES = [
  { valor: "", etiqueta: "Cualquiera" },
  { valor: "25", etiqueta: "≥ 25 %" },
  { valor: "50", etiqueta: "≥ 50 %" },
  { valor: "75", etiqueta: "≥ 75 %" },
] as const;

const CATEGORIAS: ForecastCategory[] = ["COMPROMISO", "MEJOR_CASO", "PIPELINE", "OMITIDA"];

type HrefDe = (cambios: Record<string, string | readonly string[] | null>) => string;

export function PestanaForecast({
  abiertas,
  ventasDelAnio,
  filtros,
  hrefDe,
  fiscalYearStartMonth,
  ahora,
}: {
  abiertas: OportunidadAbierta[];
  ventasDelAnio: VentaGanada[];
  filtros: FiltrosDeAnalisis;
  hrefDe: HrefDe;
  fiscalYearStartMonth: number;
  ahora: Date;
}) {
  const { anio } = filtros;

  const opcionesDeEmbudo = {
    probabilidadMinima: filtros.prob === null ? null : money(filtros.prob).div(100),
    categorias: new Set(filtros.pron),
    fiscalYearStartMonth,
  };
  // Los trimestres y el total no dependen de la segunda agrupación; los
  // subgrupos sí, y la distribución necesita las dos variantes.
  const embudoPorCliente = embudoDeForecast(abiertas, { ...opcionesDeEmbudo, segunda: "cliente" });
  const embudoPorVendedor = embudoDeForecast(abiertas, { ...opcionesDeEmbudo, segunda: "vendedor" });
  const embudo = embudoPorCliente;
  const ciclo = cicloDeVenta(ventasDelAnio, fiscalYearStartMonth);
  const antiguedad = antiguedadYEstancamiento(abiertas, ahora);
  const dispersion = puntosDeAntiguedad(antiguedad);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          denso
          etiqueta="Abierto en el embudo"
          valor={formatUSD(embudo.total.total)}
          subtexto={`${embudo.total.cuantas} ${embudo.total.cuantas === 1 ? "oportunidad" : "oportunidades"} con los filtros del embudo`}
        />
        <StatTile denso etiqueta="Ponderado" valor={formatUSD(embudo.total.ponderado)} subtexto="importe × probabilidad de etapa" tono="acento" />
        <StatTile
          denso
          etiqueta="Ciclo de venta medio"
          valor={ciclo.promedioDias === null ? "Sin datos suficientes" : dias(ciclo.promedioDias)}
          subtexto={
            ciclo.promedioDias === null
              ? `ninguna ganada en ${anio} con estos filtros`
              : `mediana ${dias(ciclo.medianaDias)} · ${ciclo.cuantas} ${ciclo.cuantas === 1 ? "cierre" : "cierres"} en ${anio}`
          }
        />
        <StatTile
          denso
          etiqueta="Estancadas"
          valor={String(antiguedad.resumen.estancadas)}
          subtexto={
            antiguedad.resumen.estancadas === 0
              ? "ninguna pasó el límite de su etapa"
              : `${formatUSD(antiguedad.resumen.importeEstancado)} detenidos más allá del límite de etapa`
          }
          tono={antiguedad.resumen.estancadas > 0 ? "peligro" : "exito"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TarjetaDeEmbudo puntos={puntosDeEmbudo(embudo)} filtros={<FiltrosDelEmbudo filtros={filtros} hrefDe={hrefDe} />} />
        <TarjetaDeDistribucion
          inicial={filtros.g4}
          variantes={{ cliente: distribucionDelPipeline(embudoPorCliente), vendedor: distribucionDelPipeline(embudoPorVendedor) }}
        />

        <TarjetaDeCiclo anio={anio} inicial={filtros.g5} barras={barrasDeCiclo(ciclo)} serie={serieDeCiclo(ciclo)} />
        <TarjetaDeEstado estado={estadoPorVendedor(antiguedad)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              denso
              etiqueta="Sin actividad"
              valor={String(antiguedad.resumen.sinActividad)}
              subtexto="abiertas sin actividad reciente ni siguiente paso"
              tono={antiguedad.resumen.sinActividad > 0 ? "peligro" : "neutro"}
            />
            <StatTile
              denso
              etiqueta="Cierre vencido"
              valor={String(antiguedad.resumen.vencidas)}
              subtexto="abiertas con cierre estimado en el pasado"
              tono={antiguedad.resumen.vencidas > 0 ? "alerta" : "neutro"}
            />
            <StatTile denso etiqueta="Edad promedio" valor={dias(antiguedad.resumen.edadPromedioDias)} subtexto="desde el alta" />
          </div>
        </TarjetaDeEstado>

        <TarjetaDeDispersion puntos={dispersion.puntos} edadPromedio={dispersion.edadPromedio} />
        <Tarjeta titulo="Las de mayor importe" descripcion="Las abiertas que más pesan, con su etapa medida hoy. El folio lleva a la oportunidad.">
          <TablaDeAnalisis
            columnas={[
              { titulo: "Folio" },
              { titulo: "Oportunidad" },
              { titulo: "Etapa" },
              { titulo: "En etapa", alineacion: "derecha" },
              { titulo: "Edad", alineacion: "derecha" },
              { titulo: "Importe", alineacion: "derecha" },
            ]}
            filas={antiguedad.detalle.map((d) => ({
              clave: d.id,
              celdas: [
                { texto: d.folio, href: `/oportunidades/${d.id}` },
                `${d.nombre} · ${d.cliente}`,
                d.etapa,
                enEtapa(d.diasEnEtapa, d.limite),
                { texto: dias(d.edadDias), tono: d.vencida ? "peligro" : "titulo" },
                formatUSD(d.importe),
              ],
            }))}
            vacio="Ninguna oportunidad abierta con estos filtros."
          />
          {antiguedad.detalle.length > 0 ? (
            <p className="mt-2 text-xs text-texto-tenue">
              Las {antiguedad.detalle.length} de mayor importe. «En etapa» son los días en la etapa actual contra el límite de esa
              etapa: en coral ya lo pasó; en azul marino va entre el 75 % y el límite.
            </p>
          ) : null}
        </Tarjeta>
      </div>
    </>
  );
}

/** «15 / 14» con el tono del estado de etapa (§37): la misma regla que la dispersión. */
function enEtapa(diasEnEtapa: number, limite: number): CeldaDeAnalisis {
  const estado = estadoDeEtapa(diasEnEtapa, limite);
  return {
    texto: `${diasEnEtapa} / ${limite}`,
    tono: estado === "estancada" ? "peligro" : estado === "en_riesgo" ? "alerta" : "titulo",
    negrita: estado !== "en_tiempo",
  };
}

/** Los filtros del embudo: enlaces, porque recortan antes de agregar y eso pasa en el servidor. */
function FiltrosDelEmbudo({ filtros, hrefDe }: { filtros: FiltrosDeAnalisis; hrefDe: HrefDe }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-texto-tenue">Probabilidad de etapa</span>
        <ControlSegmentado
          opciones={PROBABILIDADES}
          activa={filtros.prob === null ? "" : (String(filtros.prob) as (typeof PROBABILIDADES)[number]["valor"])}
          hrefDe={(v) => hrefDe({ prob: v || null })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-texto-tenue">Pronóstico</span>
        {CATEGORIAS.map((c) => {
          const activa = filtros.pron.includes(c);
          const siguientes = activa ? filtros.pron.filter((x) => x !== c) : [...filtros.pron, c];
          return (
            <Link
              key={c}
              href={hrefDe({ pron: siguientes })}
              aria-pressed={activa}
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-rapido ease-estandar",
                activa
                  ? "border-acento bg-acento/10 font-semibold text-texto-titulo"
                  : "border-borde text-texto-tenue hover:text-texto-cuerpo",
              )}
            >
              {ETIQUETA_CATEGORIA[c]}
            </Link>
          );
        })}
        {filtros.pron.length === 0 ? <span className="text-xs text-texto-tenue">· todas</span> : null}
      </div>
    </div>
  );
}
