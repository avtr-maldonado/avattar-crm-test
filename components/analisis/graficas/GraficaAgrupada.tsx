"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acortar } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion } from "./comun";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import type { FilaDeGrupos, SerieConColor } from "./tipos";

const ALTO = 240;
const ANCHO_POR_BARRA = 26;
const HOLGURA_POR_GRUPO = 40;

/**
 * Barras **agrupadas**, nunca apiladas: una barra por serie dentro de cada
 * grupo. Sirve para conteos que se traslapan (estancadas, sin actividad y
 * vencidas son subconjuntos de las abiertas) y para conteos por tipo. Las
 * series llegan como datos, con su color puesto por la tarjeta.
 */
export function GraficaAgrupada({
  filas,
  series,
  vacio,
}: {
  filas: FilaDeGrupos[];
  series: readonly SerieConColor[];
  vacio: string;
}) {
  const anima = useAnimacion();
  if (filas.length === 0 || series.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;
  const anchoPorGrupo = Math.max(96, series.length * ANCHO_POR_BARRA + HOLGURA_POR_GRUPO);

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(280, filas.length * anchoPorGrupo) }}>
          <ResponsiveContainer width="100%" height={ALTO}>
            <BarChart data={filas} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={3}>
              <CartesianGrid vertical={false} stroke={PALETA.rejilla} />
              <XAxis
                dataKey="etiqueta"
                interval={0}
                tickLine={false}
                axisLine={{ stroke: PALETA.rejilla }}
                tick={TIPOGRAFIA_DE_EJE}
                tickFormatter={(v: string) => acortar(v, 18)}
              />
              <YAxis width={32} tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} allowDecimals={false} />
              <Tooltip cursor={{ fill: PALETA.cursor }} content={<TooltipDeGrafica />} />
              {series.map((s) => (
                <Bar
                  key={s.clave}
                  dataKey={(f: FilaDeGrupos) => f.valores[s.clave] ?? 0}
                  name={s.etiqueta}
                  fill={s.color}
                  radius={[2, 2, 0, 0]}
                  minPointSize={1}
                  isAnimationActive={anima}
                  animationDuration={350}
                >
                  <LabelList dataKey={(f: FilaDeGrupos) => f.valores[s.clave] ?? 0} position="top" style={ETIQUETA_DE_BARRA} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Leyenda series={series} />
    </div>
  );
}
