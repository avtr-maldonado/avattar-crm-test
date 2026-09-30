"use client";

import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoCompacto, formatoDeEje } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion } from "./comun";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import type { PuntoHistorico } from "./tipos";

const ALTO = 288;
const ANCHO_POR_PERIODO = 72;

/**
 * Reporte 2 · lo ganado por periodo como barras y la utilidad como línea
 * encima, las dos en dólares sobre el mismo eje. La variación va en el
 * tooltip: es un por ciento y no comparte eje con el dinero.
 */
export function GraficaHistorica({ puntos, conUtilidad, vacio }: { puntos: PuntoHistorico[]; conUtilidad: boolean; vacio: string }) {
  const anima = useAnimacion();
  if (puntos.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(280, puntos.length * ANCHO_POR_PERIODO) }}>
          <ResponsiveContainer width="100%" height={ALTO}>
            <ComposedChart data={puntos} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barCategoryGap="32%">
              <CartesianGrid vertical={false} stroke={PALETA.rejilla} />
              <XAxis dataKey="etiqueta" interval={0} tickLine={false} axisLine={{ stroke: PALETA.rejilla }} tick={TIPOGRAFIA_DE_EJE} />
              <YAxis width={56} tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} tickFormatter={formatoDeEje} />
              <Tooltip cursor={{ fill: PALETA.cursor }} content={<TooltipDeGrafica />} />
              <Bar
                dataKey="ganado"
                name="Ganado"
                fill={PALETA.ganado}
                radius={[3, 3, 0, 0]}
                minPointSize={2}
                isAnimationActive={anima}
                animationDuration={350}
              >
                <LabelList dataKey="ganado" position="top" formatter={(v: unknown) => formatoCompacto(Number(v))} style={ETIQUETA_DE_BARRA} />
              </Bar>
              {conUtilidad ? (
                <Line
                  type="monotone"
                  dataKey="utilidad"
                  name="Utilidad"
                  stroke={PALETA.utilidad}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: PALETA.utilidad, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={anima}
                  animationDuration={350}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Leyenda
        series={[
          { etiqueta: "Ganado", color: PALETA.ganado },
          ...(conUtilidad ? [{ etiqueta: "Utilidad", color: PALETA.utilidad, linea: true }] : []),
        ]}
      />
    </div>
  );
}
