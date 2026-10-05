"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatoCompacto, formatoDeEje } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion, useDetalle } from "./comun";
import { PanelDeDetalle } from "./PanelDeDetalle";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import { seleccionDe } from "./seleccion";
import type { PuntoDeEmbudo } from "./tipos";

const ALTO = 272;
const ANCHO_POR_TRIMESTRE = 96;

/**
 * Reporte 4 · lo abierto por trimestre de cierre estimado. La altura de cada
 * barra es el importe; el segmento de abajo, en verde, es el ponderado
 * (importe × probabilidad de etapa, RN-01). Una sola cifra encima, el
 * importe: el resto va en el tooltip. Pulsar cualquiera de los dos segmentos
 * abre el detalle del trimestre (§43).
 */
export function GraficaDeEmbudo({ puntos, vacio }: { puntos: PuntoDeEmbudo[]; vacio: string }) {
  const anima = useAnimacion();
  const detalle = useDetalle();
  if (puntos.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;
  const abrir = (d: { payload?: unknown }) => detalle.elegir(seleccionDe(d.payload as PuntoDeEmbudo));

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(280, puntos.length * ANCHO_POR_TRIMESTRE) }}>
          <ResponsiveContainer width="100%" height={ALTO}>
            <BarChart data={puntos} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="34%">
              <CartesianGrid vertical={false} stroke={PALETA.rejilla} />
              <XAxis dataKey="etiqueta" interval={0} tickLine={false} axisLine={{ stroke: PALETA.rejilla }} tick={TIPOGRAFIA_DE_EJE} />
              <YAxis width={56} tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} tickFormatter={formatoDeEje} />
              <Tooltip cursor={{ fill: PALETA.cursor }} content={<TooltipDeGrafica />} />
              <Bar
                dataKey="ponderado"
                name="Ponderado"
                stackId="embudo"
                fill={PALETA.ponderado}
                cursor="pointer"
                onClick={abrir}
                isAnimationActive={anima}
                animationDuration={350}
              />
              <Bar
                dataKey="resto"
                name="Importe"
                stackId="embudo"
                fill={PALETA.ganado}
                radius={[3, 3, 0, 0]}
                minPointSize={1}
                cursor="pointer"
                onClick={abrir}
                isAnimationActive={anima}
                animationDuration={350}
              >
                <LabelList dataKey="importe" position="top" formatter={(v: unknown) => formatoCompacto(Number(v))} style={ETIQUETA_DE_BARRA} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Leyenda
        series={[
          { etiqueta: "Importe", color: PALETA.ganado },
          { etiqueta: "Ponderado", color: PALETA.ponderado },
        ]}
      />
      <PanelDeDetalle seleccion={detalle.seleccion} abierto={detalle.abierto} alCerrar={detalle.cerrar} />
    </div>
  );
}
