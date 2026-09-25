import Link from "next/link";
import clsx from "clsx";
import { formatPercent, formatUSD, money } from "@/lib/money";
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
import { Reporte, TablaDeAnalisis, type CeldaDeAnalisis, type FilaDeAnalisis } from "./TablaDeAnalisis";

/**
 * B · Forecast: los reportes 4, 5 y 6.
 *
 * - El embudo (4) agrupa lo **abierto** por trimestre de cierre estimado
 *   (`expectedCloseDate`, §10.2) y dentro por cliente o por vendedor. El
 *   ponderado es importe × probabilidad de etapa (RN-01); la probabilidad
 *   mínima y las categorías de pronóstico recortan antes de agrupar y viven
 *   en la URL como todo lo demás (INV-10).
 * - El ciclo de venta (5) mide del alta al cierre real de las ganadas del año.
 * - Antigüedad y estancamiento (6) usan las mismas banderas del kanban
 *   (INV-11): un reporte que las calculara aparte diría otra cosa que el tablero.
 */

const SEGUNDAS = [
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "vendedor", etiqueta: "Vendedor" },
] as const;

const PROBABILIDADES = [
  { valor: "", etiqueta: "Cualquiera" },
  { valor: "25", etiqueta: "≥ 25 %" },
  { valor: "50", etiqueta: "≥ 50 %" },
  { valor: "75", etiqueta: "≥ 75 %" },
] as const;

const CATEGORIAS: ForecastCategory[] = ["COMPROMISO", "MEJOR_CASO", "PIPELINE", "OMITIDA"];

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
  hrefDe: (cambios: Record<string, string | readonly string[] | null>) => string;
  fiscalYearStartMonth: number;
  ahora: Date;
}) {
  const { anio } = filtros;

  const embudo = embudoDeForecast(abiertas, {
    segunda: filtros.g4,
    probabilidadMinima: filtros.prob === null ? null : money(filtros.prob).div(100),
    categorias: new Set(filtros.pron),
    fiscalYearStartMonth,
  });
  const ciclo = cicloDeVenta(ventasDelAnio, fiscalYearStartMonth);
  const antiguedad = antiguedadYEstancamiento(abiertas, ahora);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          etiqueta="Abierto en el embudo"
          valor={formatUSD(embudo.total.total)}
          subtexto={`${embudo.total.cuantas} ${embudo.total.cuantas === 1 ? "oportunidad" : "oportunidades"} con los filtros del embudo`}
        />
        <StatTile
          etiqueta="Ponderado"
          valor={formatUSD(embudo.total.ponderado)}
          subtexto="importe × probabilidad de etapa"
          tono="acento"
        />
        <StatTile
          etiqueta="Ciclo de venta medio"
          valor={ciclo.promedioDias === null ? "Sin datos suficientes" : dias(ciclo.promedioDias)}
          subtexto={
            ciclo.promedioDias === null
              ? `ninguna ganada en ${anio} con estos filtros`
              : `mediana ${dias(ciclo.medianaDias)} · ${ciclo.cuantas} ${ciclo.cuantas === 1 ? "cierre" : "cierres"} en ${anio}`
          }
        />
        <StatTile
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

      <Reporte
        titulo="Embudo por trimestre de cierre"
        fechaQueManda="Abiertas por fecha de cierre estimado. El ponderado es importe × probabilidad de la etapa (RN-01)."
        agrupacion={{
          etiqueta: "Dentro de cada trimestre, por",
          opciones: SEGUNDAS,
          activa: filtros.g4,
          hrefDe: (v) => hrefDe({ g4: v }),
        }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
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

        <TablaDeAnalisis
          columnas={[
            { titulo: `Trimestre · ${filtros.g4 === "cliente" ? "cliente" : "vendedor"}` },
            { titulo: "Oportunidades", alineacion: "derecha" },
            { titulo: "Importe", alineacion: "derecha" },
            { titulo: "Ponderado", alineacion: "derecha" },
            { titulo: "Peso en el trimestre", alineacion: "derecha" },
          ]}
          filas={embudo.trimestres.flatMap((t): FilaDeAnalisis[] => [
            {
              clave: t.clave,
              nivel: "grupo",
              celdas: [t.etiqueta, String(t.cuantas), formatUSD(t.total), formatUSD(t.ponderado), ""],
            },
            ...t.subgrupos.map((s): FilaDeAnalisis => {
              const peso = t.total.isZero() ? money(0) : s.total.div(t.total);
              return {
                clave: `${t.clave}:${s.clave}`,
                nivel: "detalle",
                celdas: [
                  s.etiqueta,
                  String(s.cuantas),
                  formatUSD(s.total),
                  formatUSD(s.ponderado),
                  { texto: formatPercent(peso), barra: peso.toNumber() },
                ],
              };
            }),
          ])}
          total={["Total", String(embudo.total.cuantas), formatUSD(embudo.total.total), formatUSD(embudo.total.ponderado), ""]}
          vacio="Ninguna oportunidad abierta cumple los filtros del embudo. Quita la probabilidad mínima o las categorías para ver más."
        />
      </Reporte>

      <Reporte
        titulo="Ciclo de venta medio"
        fechaQueManda={`Del alta al cierre real, en días, sobre las ganadas en ${anio}. La mediana aguanta el negocio de dos años que sesga el promedio.`}
      >
        {ciclo.promedioDias === null ? (
          <p className="rounded-sm border border-dashed border-borde-fuerte px-4 py-6 text-center text-sm text-texto-tenue">
            Sin datos suficientes: ninguna oportunidad ganada en {anio} con estos filtros. El ciclo se mide sobre lo que ya cerró.
          </p>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <TablaDeAnalisis
              columnas={[
                { titulo: "Vendedor" },
                { titulo: "Cierres", alineacion: "derecha" },
                { titulo: "Días promedio", alineacion: "derecha" },
              ]}
              filas={ciclo.porVendedor.map((f) => ({
                clave: f.clave,
                celdas: [f.etiqueta, String(f.cuantas), dias(f.promedioDias)],
              }))}
              total={["Todos", String(ciclo.cuantas), `${dias(ciclo.promedioDias)} · mediana ${dias(ciclo.medianaDias)}`]}
              vacio="Sin cierres."
            />
            <TablaDeAnalisis
              columnas={[
                { titulo: "Trimestre de cierre" },
                { titulo: "Cierres", alineacion: "derecha" },
                { titulo: "Días promedio", alineacion: "derecha" },
              ]}
              filas={ciclo.porTrimestre.map((f) => ({
                clave: f.clave,
                celdas: [f.etiqueta, String(f.cuantas), dias(f.promedioDias)],
              }))}
              vacio="Sin cierres."
            />
          </div>
        )}
      </Reporte>

      <Reporte
        titulo="Antigüedad y estancamiento"
        fechaQueManda="Abiertas, medidas hoy: días en la etapa contra el límite de la etapa, edad desde el alta, y cierre estimado ya vencido. Mismas señales que el tablero."
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
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
          <StatTile
            denso
            etiqueta="Edad promedio"
            valor={dias(antiguedad.resumen.edadPromedioDias)}
            subtexto="desde el alta"
          />
        </div>

        <div className="space-y-4">
          <TablaDeAnalisis
            columnas={[
              { titulo: "Vendedor" },
              { titulo: "Abiertas", alineacion: "derecha" },
              { titulo: "Estancadas", alineacion: "derecha" },
              { titulo: "Sin actividad", alineacion: "derecha" },
              { titulo: "Vencidas", alineacion: "derecha" },
              { titulo: "Edad", alineacion: "derecha" },
            ]}
            filas={antiguedad.porVendedor.map((f) => ({
              clave: f.clave,
              celdas: [
                f.etiqueta,
                String(f.cuantas),
                alerta(f.estancadas),
                alerta(f.sinActividad),
                alerta(f.vencidas),
                dias(f.edadPromedioDias),
              ],
            }))}
            total={[
              "Total",
              String(antiguedad.resumen.cuantas),
              alerta(antiguedad.resumen.estancadas),
              alerta(antiguedad.resumen.sinActividad),
              alerta(antiguedad.resumen.vencidas),
              dias(antiguedad.resumen.edadPromedioDias),
            ]}
            vacio="Ninguna oportunidad abierta con estos filtros."
          />
          <div>
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
                  {
                    texto: `${d.diasEnEtapa} / ${d.limite}`,
                    tono: d.estancada ? "peligro" : "titulo",
                    negrita: d.estancada,
                  },
                  { texto: dias(d.edadDias), tono: d.vencida ? "peligro" : "titulo" },
                  formatUSD(d.importe),
                ],
              }))}
              vacio="Ninguna oportunidad abierta con estos filtros."
            />
            {antiguedad.detalle.length > 0 ? (
              <p className="mt-2 text-xs text-texto-tenue">
                Las {antiguedad.detalle.length} de mayor importe. «En etapa» son los días en la etapa actual contra el límite de esa etapa; en coral, ya lo pasó.
              </p>
            ) : null}
          </div>
        </div>
      </Reporte>
    </>
  );
}

function dias(n: number | null): string {
  return n === null ? "—" : `${n} ${n === 1 ? "día" : "días"}`;
}

function alerta(n: number): CeldaDeAnalisis {
  return n > 0 ? { texto: String(n), tono: "peligro", negrita: true } : { texto: "0", tono: "tenue" };
}
