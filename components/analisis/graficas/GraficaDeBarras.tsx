"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acortar, formatoCompacto, formatoDeEje } from "./formato";
import { Leyenda, SinDatos, TooltipDeGrafica, useAnimacion } from "./comun";
import { ETIQUETA_DE_BARRA, PALETA, TIPOGRAFIA_DE_EJE } from "./paleta";
import type { PuntoDeBarra } from "./tipos";

const ALTO = 288;
const PX_POR_LETRA = 6.4;

/** Cuánto espacio pide cada barra para que su etiqueta quepa sin encimarse: entre 72 y 128 px. */
function anchoPorBarra(puntos: readonly PuntoDeBarra[]): number {
  const masLarga = Math.max(0, ...puntos.map((p) => (p.etiquetaCorta ?? p.etiqueta).length));
  return Math.min(128, Math.max(40, Math.round(12 + masLarga * PX_POR_LETRA)));
}

/**
 * Reporte 1 · barras verticales de lo ganado por la dimensión elegida.
 *
 * Con cuota consolidada, cada trimestre lleva al lado su cuota en azul claro;
 * sin cuota, no hay serie. Con muchas categorías la gráfica crece a lo ancho y
 * el contenedor hace scroll, en vez de encimar las etiquetas.
 */
const FORMATO_DE_DINERO = { eje: formatoDeEje, etiqueta: formatoCompacto };

export function GraficaDeBarras({
  puntos,
  conCuota,
  vacio,
  formato = FORMATO_DE_DINERO,
  enteros = false,
  nombreDeSerie = "Ganado",
}: {
  puntos: PuntoDeBarra[];
  conCuota: boolean;
  vacio: string;
  /** Dinero por omisión; conteos con `String`. */
  formato?: { eje: (valor: number) => string; etiqueta: (valor: number) => string };
  enteros?: boolean;
  nombreDeSerie?: string;
}) {
  const anima = useAnimacion();
  if (puntos.length === 0) return <SinDatos texto={vacio} alto={ALTO} />;
  const ancho = anchoPorBarra(puntos);
  const letras = Math.floor((ancho - 12) / PX_POR_LETRA);

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(280, puntos.length * ancho) }}>
          <ResponsiveContainer width="100%" height={ALTO}>
            <BarChart data={puntos} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={4}>
              <CartesianGrid vertical={false} stroke={PALETA.rejilla} />
              <XAxis
                dataKey={(p: PuntoDeBarra) => p.etiquetaCorta ?? p.etiqueta}
                interval={0}
                tickLine={false}
                axisLine={{ stroke: PALETA.rejilla }}
                tick={TIPOGRAFIA_DE_EJE}
                tickFormatter={(v: string) => acortar(v, letras)}
              />
              <YAxis
                width={enteros ? 32 : 56}
                tickLine={false}
                axisLine={false}
                tick={TIPOGRAFIA_DE_EJE}
                tickFormatter={formato.eje}
                allowDecimals={!enteros}
              />
              <Tooltip cursor={{ fill: PALETA.cursor }} content={<TooltipDeGrafica />} />
              {conCuota ? (
                <Bar
                  dataKey="cuota"
                  name="Cuota"
                  fill={PALETA.cuota}
                  stroke={PALETA.cuotaBorde}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={anima}
                  animationDuration={350}
                />
              ) : null}
              <Bar
                dataKey="valor"
                name={nombreDeSerie}
                fill={PALETA.ganado}
                radius={[3, 3, 0, 0]}
                minPointSize={2}
                isAnimationActive={anima}
                animationDuration={350}
              >
                {puntos.map((p) => (
                  <Cell key={p.clave} fill={p.tenue ? PALETA.ganadoTenue : PALETA.ganado} />
                ))}
                <LabelList dataKey="valor" position="top" formatter={(v: unknown) => formato.etiqueta(Number(v))} style={ETIQUETA_DE_BARRA} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Leyenda
        series={[
          { etiqueta: nombreDeSerie, color: PALETA.ganado },
          ...(conCuota ? [{ etiqueta: "Cuota", color: PALETA.cuota, borde: PALETA.cuotaBorde }] : []),
        ]}
      />
    </div>
  );
}
