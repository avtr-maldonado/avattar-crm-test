"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Icono } from "@/components/ui/iconos";

/**
 * La barra de herramientas del pipeline · dos filas.
 *
 * Arriba, lo que se decide primero: qué vista, si se quieren ver los filtros,
 * y el alta a la derecha. Abajo, los filtros, que se pueden ocultar para dejar
 * el tablero respirar; el estado de esa fila es de pantalla, no de la URL —los
 * filtros sí viven en la URL (INV-10), el que se vean o no, no—. Cuando están
 * ocultos y hay alguno activo, el botón lleva un punto: el recorte sigue ahí
 * aunque no se vea.
 */
export function BarraDeHerramientas({
  vistas,
  filtros,
  alta,
  hayFiltrosActivos,
}: {
  vistas: ReactNode;
  filtros: ReactNode;
  alta: ReactNode;
  hayFiltrosActivos: boolean;
}) {
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {vistas}
        <button
          type="button"
          aria-pressed={mostrarFiltros}
          aria-controls="filtros-del-pipeline"
          title={mostrarFiltros ? "Ocultar filtros" : "Mostrar filtros"}
          onClick={() => setMostrarFiltros((v) => !v)}
          className={clsx(
            "relative flex size-9 items-center justify-center rounded-sm border transition-colors duration-rapido ease-estandar focus:shadow-ring focus:outline-none",
            mostrarFiltros
              ? "border-acento bg-superficie-tinte text-blue-700"
              : "border-borde bg-superficie-pagina text-texto-tenue hover:bg-superficie-sutil hover:text-texto-cuerpo",
          )}
        >
          <Icono nombre="filtro" className="size-4" />
          <span className="sr-only">Filtros</span>
          {!mostrarFiltros && hayFiltrosActivos ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-superficie-pagina bg-acento"
            />
          ) : null}
        </button>
        <div className="ml-auto">{alta}</div>
      </div>

      {mostrarFiltros ? (
        <div id="filtros-del-pipeline" className="flex flex-wrap items-center gap-2">
          {filtros}
        </div>
      ) : null}
    </div>
  );
}
