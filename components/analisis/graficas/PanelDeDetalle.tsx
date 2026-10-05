"use client";

import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/ui/formulario";
import { cuentaDeItems, type SeleccionDeGrafica } from "./seleccion";
import type { Tono } from "./tipos";

const COLOR_DE_TONO: Record<Tono | "normal", string> = {
  normal: "text-texto-titulo",
  exito: "text-exito",
  peligro: "text-coral",
  tenue: "text-texto-tenue",
};

/**
 * Qué hay detrás de un punto de una gráfica (decisiones §43).
 *
 * Arriba, los mismos renglones del tooltip, para que la cifra de la barra y
 * su lista se lean juntas; debajo, los ítems que la suman, dos líneas cada
 * uno y con enlace a la ficha. Es un `<dialog>` modal como el del embudo del
 * pipeline: Escape y la ✕ lo cierran, y el foco vuelve a la gráfica.
 *
 * `seleccion` se conserva al cerrar para que el panel no se vacíe mientras se
 * desvanece; `abierto` manda.
 */
export function PanelDeDetalle({
  seleccion,
  abierto,
  alCerrar,
}: {
  seleccion: SeleccionDeGrafica | null;
  abierto: boolean;
  alCerrar: () => void;
}) {
  if (!seleccion) return null;
  const { titulo, detalle, items, unidad } = seleccion;

  return (
    <Panel titulo={titulo} subtitulo={cuentaDeItems(items.length, unidad)} abierto={abierto} alCerrar={alCerrar} ancho="lg" cerrarAlFondo>
      {detalle.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-sm bg-superficie-sutil px-4 py-3 text-xs">
          {detalle.map((d) => (
            <div key={d.etiqueta} className="min-w-0">
              <dt className="text-texto-tenue">{d.etiqueta}</dt>
              <dd className={clsx("tabular text-sm font-semibold", COLOR_DE_TONO[d.tono ?? "normal"])}>{d.texto}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-sm border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-tenue">
          Nada que listar con los filtros actuales.
        </p>
      ) : (
        <ul className="mt-4 max-h-[60vh] overflow-y-auto">
          {items.map((i) => (
            <li key={i.clave} className="flex items-start justify-between gap-4 border-t border-borde py-2.5 first:border-t-0">
              <div className="min-w-0">
                {i.href ? (
                  <Link href={i.href} className="block truncate text-sm font-medium text-texto-titulo hover:text-acento hover:underline">
                    {i.titulo}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-texto-titulo">{i.titulo}</p>
                )}
                {i.subtitulo ? <p className="truncate text-xs text-texto-tenue">{i.subtitulo}</p> : null}
              </div>
              <div className="shrink-0 text-right">
                <p className={clsx("tabular text-sm font-semibold", COLOR_DE_TONO[i.tono ?? "normal"])}>{i.cifra}</p>
                {i.nota ? <p className="text-xs text-texto-tenue">{i.nota}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
