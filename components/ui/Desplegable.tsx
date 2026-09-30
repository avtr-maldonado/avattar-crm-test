"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import { Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import type { OpcionDeFiltro } from "./resumenDeFiltro";

/**
 * Pastillas desplegables de filtro · §9.
 *
 * Nacieron en la barra del pipeline y desde el 30-sep-2026 también filtran
 * Análisis, así que viven aquí. Cada pastilla dice su valor, no su nombre
 * («Vendedor · 2 elegidos»), y los desplegables de varias opciones trabajan
 * sobre un borrador y navegan **una sola vez**, al aplicar: aplicar en cada
 * casilla costaría un viaje al servidor por clic. «Ninguno» vacía el borrador;
 * Escape cancela sin tocar la URL.
 */
// ───────────────────────────────────────────────────────────── La pastilla

export function Desplegable({
  etiqueta,
  resumen,
  activo,
  abierto,
  alAlternar,
  ancho = "w-72",
  className,
  children,
}: {
  etiqueta: string;
  resumen: string;
  activo: boolean;
  abierto: boolean;
  alAlternar: (abierto: boolean) => void;
  ancho?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) alAlternar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      alAlternar(false);
      disparador.current?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, alAlternar]);

  return (
    <div ref={raiz} className={clsx("relative transition-opacity duration-rapido", className)}>
      <button
        ref={disparador}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => alAlternar(!abierto)}
        className={clsx(
          "flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs",
          "transition-colors duration-rapido ease-estandar",
          activo
            ? "border-acento bg-superficie-tinte text-blue-700"
            : "border-borde bg-superficie-pagina text-texto-tenue hover:bg-superficie-sutil",
          abierto && "bg-superficie-sutil",
        )}
      >
        <span className="font-medium">{etiqueta}</span>
        <span aria-hidden className="opacity-60">
          ·
        </span>
        <span className="max-w-[12rem] truncate">{resumen}</span>
        <Icono
          nombre="chevron"
          className={clsx(
            "size-3 transition-transform duration-rapido ease-estandar",
            abierto && "rotate-180",
          )}
        />
      </button>

      <dialog
        id={idPanel}
        open={abierto}
        aria-label={etiqueta}
        className={clsx(
          // El `<dialog>` nativo llega centrado con márgenes automáticos; aquí
          // se ancla bajo su pastilla.
          "absolute inset-auto left-0 top-full z-20 m-0 mt-1.5 max-w-[calc(100vw-2rem)]",
          "animate-aparecer rounded-md border border-borde bg-superficie-tarjeta p-0 text-texto-cuerpo shadow-md",
          ancho,
        )}
      >
        {abierto && children}
      </dialog>
    </div>
  );
}

// ──────────────────────────────────────────────────── Contenido de un panel

export function ListaDeUno({
  opciones,
  elegido,
  alElegir,
}: {
  opciones: OpcionDeFiltro[];
  elegido: string | null;
  alElegir: (valor: string | null) => void;
}) {
  return (
    <ul className="max-h-72 overflow-y-auto py-1">
      <li>
        <BotonDeOpcion elegido={elegido === null} onClick={() => alElegir(null)}>
          Todos
        </BotonDeOpcion>
      </li>
      {opciones.map((o) => (
        <li key={o.valor}>
          <BotonDeOpcion elegido={elegido === o.valor} onClick={() => alElegir(o.valor)}>
            {o.etiqueta}
          </BotonDeOpcion>
        </li>
      ))}
    </ul>
  );
}

function BotonDeOpcion({
  elegido,
  onClick,
  children,
}: {
  elegido: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-sm",
        "transition-colors duration-rapido hover:bg-superficie-sutil",
        elegido ? "font-medium text-texto-titulo" : "text-texto-cuerpo",
      )}
    >
      <span className="truncate">{children}</span>
      {elegido && <span className="shrink-0 text-acento">✓</span>}
    </button>
  );
}

export function ListaDeVarios({
  opciones,
  elegidosAlAbrir,
  buscable = false,
  vacio,
  alAplicar,
}: {
  opciones: OpcionDeFiltro[];
  /**
   * El nombre lo dice: es **el valor de arranque**, no un valor controlado.
   *
   * `Desplegable` solo renderiza su contenido mientras está abierto, así que
   * este componente se monta al abrir y se desmonta al cerrar: el borrador nace
   * de lo que está aplicado y no puede quedarse viejo, porque no sobrevive a un
   * cambio de lo aplicado. Aplicar navega **y** cierra.
   */
  elegidosAlAbrir: string[];
  buscable?: boolean;
  vacio: string;
  alAplicar: (valores: string[]) => void;
}) {
  // Borrador: se navega una vez, al aplicar. Ver la nota del módulo.
  const [borrador, setBorrador] = useState<string[]>(elegidosAlAbrir);
  const [texto, setTexto] = useState("");
  // `includes` dentro del `map` recorrería la lista entera por cada opción.
  const enBorrador = new Set(borrador);

  const filtradas = texto.trim()
    ? opciones.filter((o) => o.etiqueta.toLocaleLowerCase("es").includes(texto.toLocaleLowerCase("es")))
    : opciones;

  function alternar(valor: string) {
    setBorrador((b) => (b.includes(valor) ? b.filter((v) => v !== valor) : [...b, valor]));
  }

  if (opciones.length === 0) {
    return <p className="px-4 py-4 text-xs text-texto-tenue">{vacio}</p>;
  }

  return (
    <div>
      {buscable && opciones.length > 8 && (
        <div className="border-b border-borde p-2">
          <input
            type="search"
            aria-label="Buscar dentro de la lista"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar…"
            autoComplete="off"
            className="w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring"
          />
        </div>
      )}

      <ul className="max-h-64 overflow-y-auto py-1">
        {filtradas.length === 0 ? (
          <li className="px-4 py-3 text-xs text-texto-tenue">Nada con «{texto.trim()}».</li>
        ) : (
          filtradas.map((o) => (
            <li key={o.valor}>
              <label className="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-sm text-texto-cuerpo transition-colors duration-rapido hover:bg-superficie-sutil">
                <input
                  type="checkbox"
                  checked={enBorrador.has(o.valor)}
                  onChange={() => alternar(o.valor)}
                  className="size-4 shrink-0 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
                />
                <span className="truncate">{o.etiqueta}</span>
              </label>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-borde px-3 py-2">
        <button
          type="button"
          onClick={() => setBorrador([])}
          disabled={borrador.length === 0}
          className="text-xs text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          Ninguno
        </button>
        <Boton onClick={() => alAplicar(borrador)} className="px-3 py-1 text-xs">
          Aplicar
        </Boton>
      </div>
    </div>
  );
}
