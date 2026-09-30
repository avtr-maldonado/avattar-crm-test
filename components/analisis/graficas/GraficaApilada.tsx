"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acortar, formatoCompacto, formatoDeEje } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion } from "./comun";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import type { FilaApilada } from "./tipos";

const ALTO_POR_FILA = 36;
const ALTO_MINIMO = 160;
const ALTO_MAXIMO_VISIBLE = 448;

/**
 * Reporte 3 · barras horizontales apiladas: costo + utilidad = venta, con la
 * venta al final de cada barra. El margen es un por ciento y no cabe en una
 * barra de dólares: va en el tooltip y en la gráfica de al lado.
 *
 * La altura crece con las filas; pasadas trece, el contenedor hace scroll
 * vertical en vez de aplastar las barras.
 */
export function GraficaApilada({ filas, vacio }: { filas: FilaApilada[]; vacio: string }) {
  const anima = useAnimacion();
  if (filas.length === 0) return <SinDatos texto={vacio} alto={ALTO_MINIMO} />;
  const alto = Math.max(ALTO_MINIMO, filas.length * ALTO_POR_FILA + 40);

  return (
    <div>
      <div className="overflow-y-auto" style={{ maxHeight: ALTO_MAXIMO_VISIBLE }}>
        <ResponsiveContainer width="100%" height={alto}>
          <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke={PALETA.rejilla} />
            <XAxis type="number" tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} tickFormatter={formatoDeEje} />
            <YAxis
              type="category"
              dataKey="etiqueta"
              width={148}
              tickLine={false}
              axisLine={false}
              tick={TIPOGRAFIA_DE_EJE}
              tickFormatter={(v: string) => acortar(v, 32)}
            />
            <Tooltip cursor={{ fill: PALETA.cursor }} content={<TooltipDeGrafica />} />
            <Bar dataKey="costo" name="Costo" stackId="venta" fill={PALETA.costo} isAnimationActive={anima} animationDuration={350} />
            <Bar
              dataKey="utilidad"
              name="Utilidad"
              stackId="venta"
              fill={PALETA.utilidad}
              radius={[0, 3, 3, 0]}
              minPointSize={1}
              isAnimationActive={anima}
              animationDuration={350}
            >
              <LabelList dataKey="venta" position="right" formatter={(v: unknown) => formatoCompacto(Number(v))} style={ETIQUETA_DE_BARRA} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Leyenda
        series={[
          { etiqueta: "Costo", color: PALETA.costo },
          { etiqueta: "Utilidad", color: PALETA.utilidad },
        ]}
      />
    </div>
  );
}
