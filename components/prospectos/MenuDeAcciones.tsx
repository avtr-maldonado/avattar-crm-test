"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

export type AccionDeMenu = { etiqueta: string; href?: string; onClick?: () => void; tono?: "normal" | "peligro" };

const estilo = (tono: AccionDeMenu["tono"]) =>
  clsx("block w-full px-3 py-1.5 text-left text-sm transition-colors duration-rapido hover:bg-superficie-sutil", tono === "peligro" ? "text-coral" : "text-texto-cuerpo");

/**
 * El menú «…» de una fila · decisiones §58. Solo trae lo que la sesión puede
 * hacer: lo que el servidor rechazaría no se ofrece. Cierra con Escape, al
 * pulsar fuera y al elegir.
 */
export function MenuDeAcciones({ acciones, etiqueta }: { acciones: AccionDeMenu[]; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;

  return (
    <div ref={raiz} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={idMenu}
        aria-label={etiqueta}
        onClick={() => setAbierto((v) => !v)}
        className="rounded-sm p-1.5 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-cuerpo focus:shadow-ring focus:outline-none"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {abierto && (
        <ul id={idMenu} role="menu" className="absolute right-0 z-20 mt-1 min-w-44 animate-aparecer rounded-md border border-borde bg-superficie-tarjeta py-1 shadow-md">
          {acciones.map((a) => (
            <li key={a.etiqueta} role="none">
              {a.href ? (
                <Link role="menuitem" href={a.href} className={estilo(a.tono)} onClick={() => setAbierto(false)}>
                  {a.etiqueta}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={estilo(a.tono)}
                  onClick={() => {
                    setAbierto(false);
                    a.onClick?.();
                  }}
                >
                  {a.etiqueta}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
