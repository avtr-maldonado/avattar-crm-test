"use client";

import dynamic from "next/dynamic";
import { Esqueleto, Tarjeta, useAgrupacion } from "./comun";
import { formatoDePorcentaje } from "./formato";
import { PALETA } from "./paleta";
import {
  AGRUPACIONES_HISTORICAS,
  DIMENSIONES_DE_AVANCE,
  DIMENSIONES_DE_RENTABILIDAD,
  type AgrupacionHistorica,
  type DimensionDeAvance,
  type DimensionDeRentabilidad,
  type FilaApilada,
  type FilaDeMargen,
  type PuntoHistorico,
  type SerieDeAvance,
} from "./tipos";

/**
 * Las cuatro tarjetas de Análisis de ventas (decisiones §35).
 *
 * Cada una recibe del servidor **todas** sus agrupaciones ya convertidas en
 * puntos, y el conmutador «Agrupar por» solo elige cuál se dibuja: el cambio es
 * inmediato y la URL lo recuerda (`useAgrupacion`). Recharts entra con
 * `next/dynamic` sin SSR: solo carga en esta pestaña y en el navegador, que es
 * donde puede medir el ancho.
 */
const GraficaDeBarras = dynamic(() => import("./GraficaDeBarras").then((m) => m.GraficaDeBarras), {
  ssr: false,
  loading: () => <Esqueleto alto={288} />,
});
const GraficaHistorica = dynamic(() => import("./GraficaHistorica").then((m) => m.GraficaHistorica), {
  ssr: false,
  loading: () => <Esqueleto alto={288} />,
});
const GraficaApilada = dynamic(() => import("./GraficaApilada").then((m) => m.GraficaApilada), {
  ssr: false,
  loading: () => <Esqueleto alto={200} />,
});
const GraficaHorizontal = dynamic(() => import("./GraficaHorizontal").then((m) => m.GraficaHorizontal), {
  ssr: false,
  loading: () => <Esqueleto alto={200} />,
});

const TICKS_DE_MARGEN = [0, 0.2, 0.4, 0.6, 0.8, 1];

export function TarjetaDeAvance({
  lapso,
  inicial,
  variantes,
}: {
  /** El lapso en prosa: «en el Q3 2026» (§45). */
  lapso: string;
  inicial: DimensionDeAvance;
  variantes: Record<DimensionDeAvance, SerieDeAvance>;
}) {
  const [activa, elegir] = useAgrupacion("g1", DIMENSIONES_DE_AVANCE, inicial);
  const serie = variantes[activa];
  return (
    <Tarjeta
      titulo="Avance contra objetivo consolidado"
      agrupacion={{ opciones: DIMENSIONES_DE_AVANCE, activa, alElegir: elegir }}
      pie={serie.nota}
    >
      <GraficaDeBarras puntos={serie.puntos} conCuota={serie.conCuota} vacio={`Ninguna oportunidad ganada ${lapso} con estos filtros.`} />
    </Tarjeta>
  );
}

export function TarjetaHistorica({
  inicial,
  variantes,
  conUtilidad,
}: {
  inicial: AgrupacionHistorica;
  variantes: Record<AgrupacionHistorica, PuntoHistorico[]>;
  conUtilidad: boolean;
}) {
  const [activa, elegir] = useAgrupacion("g2", AGRUPACIONES_HISTORICAS, inicial);
  return (
    <Tarjeta
      titulo="Histórico de venta"
      agrupacion={{ opciones: AGRUPACIONES_HISTORICAS, activa, alElegir: elegir }}
    >
      <GraficaHistorica
        puntos={variantes[activa]}
        conUtilidad={conUtilidad}
        vacio="Todavía no hay oportunidades ganadas con estos filtros. El histórico se llena conforme se cierran negocios."
      />
    </Tarjeta>
  );
}

export function TarjetaDeRentabilidad({
  lapso,
  inicial,
  variantes,
}: {
  lapso: string;
  inicial: DimensionDeRentabilidad;
  variantes: Record<DimensionDeRentabilidad, FilaApilada[]>;
}) {
  const [activa, elegir] = useAgrupacion("g3", DIMENSIONES_DE_RENTABILIDAD, inicial);
  return (
    <Tarjeta
      titulo="Rentabilidad"
      agrupacion={{ opciones: DIMENSIONES_DE_RENTABILIDAD, activa, alElegir: elegir }}
    >
      <GraficaApilada
        filas={variantes[activa]}
        vacio={`Ninguna venta ganada ${lapso} tiene cotización con costo. Sin costo no hay rentabilidad que calcular.`}
      />
    </Tarjeta>
  );
}

export function TarjetaDeMargen({
  lapso,
  inicial,
  variantes,
}: {
  lapso: string;
  inicial: DimensionDeRentabilidad;
  variantes: Record<DimensionDeRentabilidad, FilaDeMargen[]>;
}) {
  // Comparte el parámetro con Rentabilidad: son dos lecturas de la misma agrupación.
  const [activa, elegir] = useAgrupacion("g3", DIMENSIONES_DE_RENTABILIDAD, inicial);
  return (
    <Tarjeta
      titulo="Margen"
      agrupacion={{ opciones: DIMENSIONES_DE_RENTABILIDAD, activa, alElegir: elegir }}
    >
      <GraficaHorizontal
        filas={variantes[activa].map((f) => ({
          clave: f.clave,
          etiqueta: f.etiqueta,
          valor: f.margen,
          etiquetaDeValor: f.margenTexto,
          ...(f.negativo ? { tono: "peligro" as const } : {}),
          detalle: f.detalle,
          items: f.items,
        }))}
        color={PALETA.margen}
        dominio={[0, 1]}
        ticks={TICKS_DE_MARGEN}
        formatoDeEje={formatoDePorcentaje}
        leyenda={[{ etiqueta: "Margen", color: PALETA.margen }]}
        vacio={`Ninguna venta ganada ${lapso} tiene cotización con costo.`}
      />
    </Tarjeta>
  );
}
