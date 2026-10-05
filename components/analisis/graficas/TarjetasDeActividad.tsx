"use client";

import dynamic from "next/dynamic";
import { Esqueleto, Tarjeta } from "./comun";
import { PALETA } from "./paleta";
import { ACTIVIDADES } from "./seleccion";
import type { FilaDeGrupos, FilaHorizontal, PuntoDeBarra, ReferenciaDeGrafica, SerieDeGrupos } from "./tipos";

/**
 * Las tarjetas de Actividad y MEDDIC (decisiones §38). Sin conmutadores: los
 * filtros globales (país, vendedor, año) recortan en el servidor y estas
 * tarjetas solo dibujan lo que llega. Recharts entra con `next/dynamic`.
 */
const GraficaAgrupada = dynamic(() => import("./GraficaAgrupada").then((m) => m.GraficaAgrupada), {
  ssr: false,
  loading: () => <Esqueleto alto={240} />,
});
const GraficaDeBarras = dynamic(() => import("./GraficaDeBarras").then((m) => m.GraficaDeBarras), {
  ssr: false,
  loading: () => <Esqueleto alto={240} />,
});
const GraficaHorizontal = dynamic(() => import("./GraficaHorizontal").then((m) => m.GraficaHorizontal), {
  ssr: false,
  loading: () => <Esqueleto alto={200} />,
});

/** Los tipos de actividad son datos: el color se asigna por orden, del manual. */
const COLORES_DE_SERIE = [PALETA.ganado, PALETA.utilidad, PALETA.riesgo, PALETA.margen, PALETA.vencida, PALETA.costo];

const FORMATO_DE_CONTEO = { eje: (n: number) => String(n), etiqueta: (n: number) => (n === 0 ? "" : String(n)) };
const TICKS_MEDDIC = [0, 20, 40, 60, 80, 100];

export function TarjetaDeActividadPorVendedor({ lapso, series, filas }: { lapso: string; series: SerieDeGrupos[]; filas: FilaDeGrupos[] }) {
  return (
    <Tarjeta titulo="Actividad por vendedor">
      <GraficaAgrupada
        filas={filas}
        series={series.map((s, i) => ({ ...s, color: COLORES_DE_SERIE[i % COLORES_DE_SERIE.length]! }))}
        unidad={ACTIVIDADES}
        vacio={`Nadie ha marcado actividades como hechas ${lapso} con estos filtros.`}
      />
    </Tarjeta>
  );
}

export function TarjetaDeActividadPorMes({ puntos }: { puntos: PuntoDeBarra[] }) {
  return (
    <Tarjeta titulo="Actividad por mes">
      <GraficaDeBarras
        puntos={puntos}
        conCuota={false}
        formato={FORMATO_DE_CONTEO}
        enteros
        nombreDeSerie="Actividades hechas"
        unidad={ACTIVIDADES}
        vacio="Sin actividades hechas."
      />
    </Tarjeta>
  );
}

/** Abiertas en azul; sin siguiente paso en coral, para que salte a la vista. */
const COLOR_DE_SIN_PASO: Record<string, string> = { abiertas: PALETA.ganado, sinSiguientePaso: PALETA.peligro };

export function TarjetaDeAbiertasSinPaso({ series, filas }: { series: SerieDeGrupos[]; filas: FilaDeGrupos[] }) {
  return (
    <Tarjeta
      titulo="Oportunidades abiertas y sin siguiente paso"
    >
      <GraficaAgrupada
        filas={filas}
        series={series.map((s) => ({ ...s, color: COLOR_DE_SIN_PASO[s.clave] ?? PALETA.ganado }))}
        vacio="Ninguna oportunidad abierta con estos filtros."
      />
    </Tarjeta>
  );
}

export function TarjetaDeSaludMeddic({
  filas,
  referencia,
}: {
  filas: FilaHorizontal[];
  referencia: ReferenciaDeGrafica;
}) {
  return (
    <Tarjeta
      titulo="Salud MEDDIC por etapa"
    >
      <GraficaHorizontal
        filas={filas}
        color={PALETA.utilidad}
        dominio={[0, 100]}
        ticks={TICKS_MEDDIC}
        formatoDeEje={(n) => String(n)}
        referencia={referencia}
        leyenda={[
          { etiqueta: "En o sobre el mínimo", color: PALETA.utilidad },
          { etiqueta: "Bajo el mínimo", color: PALETA.peligro },
          { etiqueta: "Sin datos", color: PALETA.costo },
        ]}
        vacio="Ninguna oportunidad abierta con estos filtros."
      />
    </Tarjeta>
  );
}
