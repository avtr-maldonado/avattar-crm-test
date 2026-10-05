"use client";

import { Fragment, useCallback, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ControlSegmentado } from "@/components/ui/primitivas";
import type { SeleccionDeGrafica } from "./seleccion";
import type { DetalleDePunto, Tono } from "./tipos";

/**
 * Lo que comparten las gráficas de Análisis: la agrupación en la URL, el
 * tooltip, el detalle al pulsar (§43), la leyenda, la tarjeta y los estados
 * vacío y de carga. Los colores viven en `paleta.ts`.
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

/**
 * El punto pulsado y si su panel está abierto (§43). Al cerrar se conserva la
 * selección: el `<dialog>` se desvanece con su contenido, no vacío.
 */
export function useDetalle() {
  const [estado, setEstado] = useState<{ seleccion: SeleccionDeGrafica | null; abierto: boolean }>({ seleccion: null, abierto: false });
  const elegir = useCallback((seleccion: SeleccionDeGrafica) => setEstado({ seleccion, abierto: true }), []);
  const cerrar = useCallback(() => setEstado((e) => ({ ...e, abierto: false })), []);
  return { ...estado, elegir, cerrar };
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
  descripcion?: string;
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
          {descripcion ? <p className="mt-0.5 text-xs text-texto-tenue">{descripcion}</p> : null}
        </div>
        {agrupacion ? (
          // Sin «Agrupar por» (§45): las opciones se explican solas y el título ya dice qué se agrupa.
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
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

type PuntoConDetalle = { etiqueta: string; detalle: DetalleDePunto[]; items?: unknown[]; itemsPorSerie?: unknown };

/**
 * El tooltip de todas las gráficas: el nombre del punto y sus renglones, que ya
 * llegan formateados del servidor. Recharts lo clona con `active` y `payload`.
 * Si el punto trae ítems, el pie invita a pulsarlo (§43).
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
  const conDetalle = (punto.items?.length ?? 0) > 0 || punto.itemsPorSerie != null;
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
      {conDetalle ? <p className="mt-1.5 border-t border-borde pt-1.5 text-[11px] text-texto-tenue">Clic para ver el detalle</p> : null}
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
