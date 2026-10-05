"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion, useDetalle } from "./comun";
import { PanelDeDetalle } from "./PanelDeDetalle";
import { PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import { indiceActivo, seleccionDe } from "./seleccion";
import type { PuntoDeLinea, ReferenciaDeGrafica } from "./tipos";

const ALTO = 240;
const ANCHO_POR_PUNTO = 72;

/**
 * Una serie en el tiempo: el ciclo de venta por trimestre de cierre. La
 * `referencia` es una línea horizontal punteada (la mediana del año). El
 * punto es pequeño, así que responde la columna entera: pulsar en cualquier
 * parte de un trimestre abre su detalle (§43).
 */
export function GraficaDeLinea({
  puntos,
  nombre,
  formatoDeEje,
  referencia,
  vacio,
}: {
  puntos: PuntoDeLinea[];
  nombre: string;
  formatoDeEje: (valor: number) => string;
  referencia?: ReferenciaDeGrafica | null;
  vacio: string;
}) {
  const anima = useAnimacion();
  const detalle = useDetalle();
  if (puntos.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(280, puntos.length * ANCHO_POR_PUNTO) }}>
          <ResponsiveContainer width="100%" height={ALTO}>
            <LineChart
              data={puntos}
              margin={{ top: 16, right: 24, left: 0, bottom: 0 }}
              className="cursor-pointer"
              onClick={(e) => {
                const i = indiceActivo(e);
                const punto = i === null ? undefined : puntos[i];
                if (punto) detalle.elegir(seleccionDe(punto));
              }}
            >
              <CartesianGrid vertical={false} stroke={PALETA.rejilla} />
              <XAxis dataKey="etiqueta" interval={0} tickLine={false} axisLine={{ stroke: PALETA.rejilla }} tick={TIPOGRAFIA_DE_EJE} padding={{ left: 24, right: 24 }} />
              <YAxis width={48} tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} tickFormatter={formatoDeEje} allowDecimals={false} />
              <Tooltip cursor={{ stroke: PALETA.rejilla }} content={<TooltipDeGrafica />} />
              {referencia ? (
                <ReferenceLine
                  y={referencia.valor}
                  stroke={PALETA.texto}
                  strokeDasharray="4 3"
                  label={{ value: referencia.etiqueta, position: "insideTopRight", fill: PALETA.texto, fontSize: 11 }}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="valor"
                name={nombre}
                stroke={PALETA.ganado}
                strokeWidth={2}
                dot={{ r: 4, fill: PALETA.ganado, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={anima}
                animationDuration={350}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Leyenda
        series={[
          { etiqueta: nombre, color: PALETA.ganado },
          ...(referencia ? [{ etiqueta: "Mediana", color: PALETA.texto, linea: true }] : []),
        ]}
      />
      <PanelDeDetalle seleccion={detalle.seleccion} abierto={detalle.abierto} alCerrar={detalle.cerrar} />
    </div>
  );
}
