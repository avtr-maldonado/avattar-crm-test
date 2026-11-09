"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Icono } from "@/components/ui/iconos";
import { hrefDeProspectos, type FiltrosDeProspectos } from "@/lib/filters/leads";

/**
 * El buscador de la pantalla de prospectos: contacto, empresa, correo o
 * teléfono. Navega al pulsar Enter o la lupa; el texto vive en la URL como
 * `q` (INV-10) y los demás filtros se conservan.
 */
export function BuscadorDeProspectos({ activos, conservar }: { activos: FiltrosDeProspectos; conservar: Record<string, string | undefined> }) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [texto, setTexto] = useState(activos.q);

  function buscar() {
    iniciar(() => router.push(hrefDeProspectos({ ...activos, q: texto.trim() }, conservar)));
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        buscar();
      }}
      className={clsx("relative w-full max-w-sm transition-opacity duration-rapido", navegando && "opacity-60")}
    >
      <label htmlFor="buscar-prospectos" className="sr-only">
        Buscar prospecto
      </label>
      <input
        id="buscar-prospectos"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar prospecto, empresa, correo o teléfono"
        autoComplete="off"
        className="w-full rounded-sm border border-borde bg-superficie-pagina py-2 pl-3 pr-9 text-sm text-texto-cuerpo outline-none transition-colors duration-rapido placeholder:text-gray-40 focus:border-acento focus:shadow-ring"
      />
      <button type="submit" aria-label="Buscar" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-texto-tenue hover:text-texto-cuerpo focus:shadow-ring focus:outline-none">
        <Icono nombre="lupa" className="size-4" />
      </button>
    </form>
  );
}
