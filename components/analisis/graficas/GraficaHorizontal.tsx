"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acortar } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion } from "./comun";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import type { FilaHorizontal, ReferenciaDeGrafica } from "./tipos";

const ALTO_POR_FILA = 36;
const ALTO_MINIMO = 160;
const ALTO_MAXIMO_VISIBLE = 448;
const COLOR_DE_TONO = { exito: PALETA.utilidad, peligro: PALETA.peligro, tenue: PALETA.costo } as const;

/**
 * Barras horizontales de una sola serie, con la cifra al final de cada barra:
 * margen por producto, pipeline por cliente o vendedor, ciclo de venta por
 * vendedor, salud MEDDIC por etapa. Una `referencia` traza una línea vertical
 * punteada (la mediana, el mínimo); el `tono` de una fila la pinta verde, coral
 * o gris (§33: solo la pérdida y lo bajo el mínimo van en coral).
 *
 * La altura crece con las filas; pasadas trece, el contenedor hace scroll.
 */
export function GraficaHorizontal({
  filas,
  color,
  formatoDeEje,
  dominio,
  ticks,
  referencia,
  leyenda,
  vacio,
}: {
  filas: FilaHorizontal[];
  color: string;
  formatoDeEje: (valor: number) => string;
  dominio?: [number, number];
  ticks?: number[];
  referencia?: ReferenciaDeGrafica | null;
  leyenda?: readonly { etiqueta: string; color: string; linea?: boolean }[];
  vacio: string;
}) {
  const anima = useAnimacion();
  if (filas.length === 0) return <SinDatos texto={vacio} alto={ALTO_MINIMO} />;
  const alto = Math.max(ALTO_MINIMO, filas.length * ALTO_POR_FILA + (referencia ? 56 : 40));

  return (
    <div>
      <div className="overflow-y-auto" style={{ maxHeight: ALTO_MAXIMO_VISIBLE }}>
        <ResponsiveContainer width="100%" height={alto}>
          <BarChart data={filas} layout="vertical" margin={{ top: referencia ? 18 : 4, right: 96, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke={PALETA.rejilla} />
            <XAxis
              type="number"
              {...(dominio ? { domain: dominio } : {})}
              {...(ticks ? { ticks } : {})}
              tickLine={false}
              axisLine={false}
              tick={TIPOGRAFIA_DE_EJE}
              tickFormatter={formatoDeEje}
            />
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
            {referencia ? (
              <ReferenceLine
                x={referencia.valor}
                stroke={PALETA.texto}
                strokeDasharray="4 3"
                label={{ value: referencia.etiqueta, position: "top", fill: PALETA.texto, fontSize: 11 }}
              />
            ) : null}
            <Bar dataKey="valor" fill={color} radius={[0, 3, 3, 0]} minPointSize={2} isAnimationActive={anima} animationDuration={350}>
              {filas.map((f) => (
                <Cell key={f.clave} fill={f.tono ? COLOR_DE_TONO[f.tono] : color} />
              ))}
              <LabelList dataKey="etiquetaDeValor" position="right" style={ETIQUETA_DE_BARRA} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {leyenda ? <Leyenda series={leyenda} /> : null}
    </div>
  );
}
