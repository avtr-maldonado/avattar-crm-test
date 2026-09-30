"use client";

import dynamic from "next/dynamic";
import { Esqueleto, Tarjeta, useAgrupacion } from "./comun";
import { formatoDeEje } from "./formato";
import { PALETA } from "./paleta";
import {
  AGRUPACIONES_DE_EMBUDO,
  VISTAS_DE_CICLO,
  type AgrupacionDeEmbudo,
  type FilaDeGrupos,
  type FilaHorizontal,
  type PuntoDeAntiguedad,
  type PuntoDeEmbudo,
  type PuntoDeLinea,
  type ReferenciaDeGrafica,
  type SerieDeGrupos,
  type VistaDeCiclo,
} from "./tipos";

/**
 * Las tarjetas de la pestaña Forecast (decisiones §37). Igual que en ventas:
 * el servidor manda todas las variantes ya convertidas en puntos y el
 * conmutador solo elige cuál se dibuja, escribiendo la URL con `replaceState`.
 * Recharts entra con `next/dynamic` sin SSR.
 */
const GraficaDeEmbudo = dynamic(() => import("./GraficaDeEmbudo").then((m) => m.GraficaDeEmbudo), {
  ssr: false,
  loading: () => <Esqueleto alto={272} />,
});
const GraficaHorizontal = dynamic(() => import("./GraficaHorizontal").then((m) => m.GraficaHorizontal), {
  ssr: false,
  loading: () => <Esqueleto alto={200} />,
});
const GraficaDeLinea = dynamic(() => import("./GraficaDeLinea").then((m) => m.GraficaDeLinea), {
  ssr: false,
  loading: () => <Esqueleto alto={240} />,
});
const GraficaAgrupada = dynamic(() => import("./GraficaAgrupada").then((m) => m.GraficaAgrupada), {
  ssr: false,
  loading: () => <Esqueleto alto={240} />,
});
const GraficaDeDispersion = dynamic(() => import("./GraficaDeDispersion").then((m) => m.GraficaDeDispersion), {
  ssr: false,
  loading: () => <Esqueleto alto={272} />,
});

const diasDeEje = (n: number) => String(n);

export function TarjetaDeEmbudo({ puntos, filtros }: { puntos: PuntoDeEmbudo[]; filtros: React.ReactNode }) {
  return (
    <Tarjeta
      titulo="Embudo por trimestre de cierre"
      descripcion="Abiertas por fecha de cierre estimado. El ponderado es importe × probabilidad de la etapa (RN-01)."
    >
      <div className="mb-3">{filtros}</div>
      <GraficaDeEmbudo
        puntos={puntos}
        vacio="Ninguna oportunidad abierta cumple los filtros del embudo. Quita la probabilidad mínima o las categorías para ver más."
      />
    </Tarjeta>
  );
}

export function TarjetaDeDistribucion({
  inicial,
  variantes,
}: {
  inicial: AgrupacionDeEmbudo;
  variantes: Record<AgrupacionDeEmbudo, FilaHorizontal[]>;
}) {
  const [activa, elegir] = useAgrupacion("g4", AGRUPACIONES_DE_EMBUDO, inicial);
  return (
    <Tarjeta
      titulo={`Distribución del pipeline por ${activa === "cliente" ? "cliente" : "vendedor"}`}
      descripcion="Importe abierto que cumple los filtros del embudo, de mayor a menor, con su peso en el total."
      agrupacion={{ opciones: AGRUPACIONES_DE_EMBUDO, activa, alElegir: elegir }}
    >
      <GraficaHorizontal
        filas={variantes[activa]}
        color={PALETA.ganado}
        formatoDeEje={formatoDeEje}
        vacio="Ninguna oportunidad abierta cumple los filtros del embudo."
      />
    </Tarjeta>
  );
}

export function TarjetaDeCiclo({
  anio,
  inicial,
  barras,
  serie,
}: {
  anio: number;
  inicial: VistaDeCiclo;
  barras: { filas: FilaHorizontal[]; referencia: ReferenciaDeGrafica | null };
  serie: PuntoDeLinea[];
}) {
  const [activa, elegir] = useAgrupacion("g5", VISTAS_DE_CICLO, inicial);
  const vacio = `Sin datos suficientes: ninguna oportunidad ganada en ${anio} con estos filtros. El ciclo se mide sobre lo que ya cerró.`;
  return (
    <Tarjeta
      titulo="Ciclo de venta medio"
      descripcion={`Del alta al cierre real, en días, sobre las ganadas en ${anio}. La mediana aguanta el negocio de dos años que sesga el promedio.`}
      agrupacion={{ opciones: VISTAS_DE_CICLO, activa, alElegir: elegir }}
    >
      {activa === "vendedor" ? (
        <GraficaHorizontal
          filas={barras.filas}
          color={PALETA.ganado}
          formatoDeEje={diasDeEje}
          referencia={barras.referencia}
          leyenda={[
            { etiqueta: "Días promedio", color: PALETA.ganado },
            ...(barras.referencia ? [{ etiqueta: "Mediana", color: PALETA.texto, linea: true }] : []),
          ]}
          vacio={vacio}
        />
      ) : (
        <GraficaDeLinea puntos={serie} nombre="Días promedio" formatoDeEje={diasDeEje} referencia={barras.referencia} vacio={vacio} />
      )}
    </Tarjeta>
  );
}

/** Abiertas en azul; estancadas en lima (aviso), sin actividad en coral, vencidas en magenta: dos rojos no se distinguen. */
const COLOR_DE_ESTADO: Record<string, string> = {
  abiertas: PALETA.ganado,
  estancadas: PALETA.riesgo,
  sinActividad: PALETA.peligro,
  vencidas: PALETA.vencida,
};

export function TarjetaDeEstado({
  estado,
  children,
}: {
  estado: { series: SerieDeGrupos[]; filas: FilaDeGrupos[] };
  children: React.ReactNode;
}) {
  return (
    <Tarjeta
      titulo="Antigüedad y estancamiento"
      descripcion="Abiertas, medidas hoy: días en la etapa contra el límite de la etapa, edad desde el alta, y cierre estimado ya vencido. Mismas señales que el tablero."
    >
      <div className="mb-4">{children}</div>
      <h3 className="mb-1 text-xs font-semibold text-texto-titulo">Estado de oportunidades por vendedor</h3>
      <GraficaAgrupada
        filas={estado.filas}
        series={estado.series.map((s) => ({ ...s, color: COLOR_DE_ESTADO[s.clave] ?? PALETA.ganado }))}
        vacio="Ninguna oportunidad abierta con estos filtros."
      />
    </Tarjeta>
  );
}

export function TarjetaDeDispersion({ puntos, edadPromedio }: { puntos: PuntoDeAntiguedad[]; edadPromedio: number | null }) {
  return (
    <Tarjeta
      titulo="Antigüedad contra importe"
      descripcion="Cada punto es una abierta: edad desde el alta contra importe. El color es el estado de su etapa; la línea, la edad promedio."
    >
      <GraficaDeDispersion puntos={puntos} edadPromedio={edadPromedio} vacio="Ninguna oportunidad abierta con estos filtros." />
    </Tarjeta>
  );
}
