"use client";

import { Fragment, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ControlSegmentado } from "@/components/ui/primitivas";
import type { DetalleDePunto, Tono } from "./tipos";

/**
 * Lo que comparten las cuatro gráficas de Análisis de ventas: la agrupación en
 * la URL, el tooltip, la leyenda, la tarjeta y los estados vacío y de carga.
 * Los colores viven en `paleta.ts`.
 */

/**
 * La agrupación de una gráfica vive en la URL (INV-10) y **es** el estado:
 * `useSearchParams` la lee, y elegir otra la escribe con `replaceState`, que el
 * router de Next sincroniza sin volver al servidor. Así el reporte se sigue
 * pegando en un correo y el cambio se ve al instante.
 */
export function useAgrupacion<T extends string>(
  parametro: string,
  opciones: readonly { valor: T }[],
  inicial: T,
): [T, (valor: T) => void] {
  const sp = useSearchParams();
  const enUrl = sp.get(parametro);
  const activa = opciones.some((o) => o.valor === enUrl) ? (enUrl as T) : inicial;
  const elegir = useCallback(
    (valor: T) => {
      const url = new URL(window.location.href);
      url.searchParams.set(parametro, valor);
      window.history.replaceState(null, "", url.toString());
    },
    [parametro],
  );
  return [activa, elegir];
}

const REDUCIR_MOVIMIENTO = "(prefers-reduced-motion: reduce)";
function suscribirAMovimiento(alCambiar: () => void) {
  const consulta = window.matchMedia(REDUCIR_MOVIMIENTO);
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

/** Recharts anima al cambiar de agrupación; quien pidió menos movimiento no lo ve. */
export function useAnimacion(): boolean {
  return useSyncExternalStore(
    suscribirAMovimiento,
    () => !window.matchMedia(REDUCIR_MOVIMIENTO).matches,
    () => false,
  );
}

// ─────────────────────────────────────────────────────────── La tarjeta

export function Tarjeta<T extends string>({
  titulo,
  descripcion,
  agrupacion,
  pie,
  children,
}: {
  titulo: string;
  /** Qué fecha manda y qué entra: cada reporte lo dice (§10.2). */
  descripcion: string;
  agrupacion?: {
    opciones: readonly { valor: T; etiqueta: string }[];
    activa: T;
    alElegir: (valor: T) => void;
  };
  pie?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-md border border-borde bg-superficie-tarjeta p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-[14rem] flex-1">
          <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>
          <p className="mt-0.5 text-xs text-texto-tenue">{descripcion}</p>
        </div>
        {agrupacion ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs text-texto-tenue">Agrupar por</span>
            <ControlSegmentado opciones={agrupacion.opciones} activa={agrupacion.activa} alElegir={agrupacion.alElegir} />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {pie ? <p className="mt-3 text-xs text-texto-tenue">{pie}</p> : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────── Piezas de gráfica

const COLOR_DE_TONO: Record<Tono | "normal", string> = {
  normal: "text-texto-titulo",
  exito: "text-exito",
  peligro: "text-coral",
  tenue: "text-texto-tenue",
};

type PuntoConDetalle = { etiqueta: string; detalle: DetalleDePunto[] };

/**
 * El tooltip de todas las gráficas: el nombre del punto y sus renglones, que ya
 * llegan formateados del servidor. Recharts lo clona con `active` y `payload`.
 */
export function TooltipDeGrafica({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
  const punto = payload?.[0]?.payload as PuntoConDetalle | undefined;
  if (!active || !punto) return null;
  return (
    <div className="max-w-72 rounded-sm border border-borde bg-superficie-tarjeta px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-texto-titulo">{punto.etiqueta}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        {punto.detalle.map((d) => (
          <Fragment key={d.etiqueta}>
            <dt className="text-texto-tenue">{d.etiqueta}</dt>
            <dd className={clsx("tabular text-right", COLOR_DE_TONO[d.tono ?? "normal"])}>{d.texto}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export function Leyenda({ series }: { series: readonly { etiqueta: string; color: string; borde?: string; linea?: boolean }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-texto-tenue">
      {series.map((s) => (
        <li key={s.etiqueta} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={clsx("inline-block", s.linea ? "h-0.5 w-4 rounded-pill" : "h-2.5 w-2.5 rounded-xs")}
            style={{ backgroundColor: s.color, ...(s.borde ? { boxShadow: `inset 0 0 0 1px ${s.borde}` } : {}) }}
          />
          {s.etiqueta}
        </li>
      ))}
    </ul>
  );
}

/** §13.5 · sin datos se dice qué falta, nunca un cero que parezca resultado. */
export function SinDatos({ texto, alto = 288 }: { texto: string; alto?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-sm border border-dashed border-borde-fuerte px-6 text-center text-sm text-texto-tenue"
      style={{ height: alto }}
    >
      {texto}
    </div>
  );
}

/** Lo que se ve mientras Recharts carga en el navegador: el hueco de la gráfica, sin salto. */
export function Esqueleto({ alto = 288 }: { alto?: number }) {
  return <div aria-hidden className="animate-pulse rounded-sm bg-superficie-sutil" style={{ height: alto }} />;
}
