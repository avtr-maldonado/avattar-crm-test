"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { formatoDeEje } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion, useDetalle } from "./comun";
import { PanelDeDetalle } from "./PanelDeDetalle";
import { PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import { seleccionDe } from "./seleccion";
import type { EstadoDeEtapa, PuntoDeAntiguedad } from "./tipos";

const ALTO = 272;

const ESTADOS: readonly { estado: EstadoDeEtapa; etiqueta: string; color: string }[] = [
  { estado: "en_tiempo", etiqueta: "En tiempo", color: PALETA.ganado },
  { estado: "en_riesgo", etiqueta: "En riesgo (75–100 % del límite)", color: PALETA.riesgo },
  { estado: "estancada", etiqueta: "Fuera del límite de etapa", color: PALETA.peligro },
];

/**
 * Reporte 6 · cada abierta como un punto: edad desde el alta contra importe.
 * El color es el estado de su etapa (§37) y la línea punteada, la edad
 * promedio. El tooltip trae la ficha completa; pulsar el punto abre el
 * detalle con el enlace a la oportunidad (§43).
 */
export function GraficaDeDispersion({
  puntos,
  edadPromedio,
  vacio,
}: {
  puntos: PuntoDeAntiguedad[];
  edadPromedio: number | null;
  vacio: string;
}) {
  const anima = useAnimacion();
  const detalle = useDetalle();
  if (puntos.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={ALTO}>
        <ScatterChart margin={{ top: 20, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={PALETA.rejilla} />
          <XAxis
            type="number"
            dataKey="edad"
            name="Edad"
            tickLine={false}
            axisLine={{ stroke: PALETA.rejilla }}
            tick={TIPOGRAFIA_DE_EJE}
            allowDecimals={false}
            label={{ value: "Edad (días)", position: "insideBottomRight", offset: -2, fill: PALETA.eje, fontSize: 11 }}
          />
          <YAxis type="number" dataKey="importe" name="Importe" width={56} tickLine={false} axisLine={false} tick={TIPOGRAFIA_DE_EJE} tickFormatter={formatoDeEje} />
          <ZAxis range={[72, 72]} />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: PALETA.eje }} content={<TooltipDeGrafica />} trigger="hover" shared={false} />
          {edadPromedio !== null ? (
            <ReferenceLine
              x={edadPromedio}
              stroke={PALETA.texto}
              strokeDasharray="4 3"
              label={{ value: `Promedio: ${edadPromedio} días`, position: "insideTopRight", fill: PALETA.texto, fontSize: 11 }}
            />
          ) : null}
          {ESTADOS.map((e) => (
            <Scatter
              key={e.estado}
              name={e.etiqueta}
              data={puntos.filter((p) => p.estado === e.estado)}
              fill={e.color}
              cursor="pointer"
              onClick={(d) => detalle.elegir(seleccionDe(d.payload as PuntoDeAntiguedad))}
              isAnimationActive={anima}
              animationDuration={350}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <Leyenda series={ESTADOS} />
      <PanelDeDetalle seleccion={detalle.seleccion} abierto={detalle.abierto} alCerrar={detalle.cerrar} />
    </div>
  );
}
