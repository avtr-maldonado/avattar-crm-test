"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";

export type OpcionDeSelector = {
  id: string;
  nombre: string;
  /** Segunda línea corta: el rol, la ciudad, lo que distinga a dos homónimos. */
  detalle?: string | null;
};

/**
 * Elegir varios de una lista corta, buscando por nombre.
 *
 * Un campo que abre la lista al recibir el foco, la recorta conforme se teclea
 * y va dejando lo elegido como fichas con su «quitar». Cada ficha viaja en el
 * formulario como un `<input type="hidden">` con el mismo `name`, así que la
 * acción lo lee con `form.getAll(name)`.
 *
 * No consulta nada: recibe las opciones completas, que aquí son decenas, no
 * miles. Para buscar contra el servidor está `Autocompletado`.
 */
export function SelectorDeVarios({
  id,
  name,
  opciones,
  iniciales,
  placeholder = "Busca por nombre",
  vacio = "No hay nadie más que elegir.",
  problema,
}: {
  id: string;
  name: string;
  opciones: OpcionDeSelector[];
  /** Los ids elegidos al abrir el formulario. */
  iniciales: readonly string[];
  placeholder?: string;
  /** Qué se dice cuando ya no queda nada que elegir. */
  vacio?: string;
  problema?: string;
}) {
  const [elegidos, setElegidos] = useState<string[]>(() => [...iniciales]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const porId = new Map(opciones.map((o) => [o.id, o]));
  const yaElegidos = new Set(elegidos);
  const termino = texto.trim().toLowerCase();
  const candidatas = opciones.filter(
    (o) => !yaElegidos.has(o.id) && (termino === "" || o.nombre.toLowerCase().includes(termino)),
  );
  const nadaQueElegir = opciones.length === elegidos.length;

  function elegir(indice: number) {
    const opcion = candidatas[indice];
    if (!opcion) return;
    setElegidos((previos) => [...previos, opcion.id]);
    setTexto("");
    setResaltada(0);
    entrada.current?.focus();
  }

  function quitar(idQuitado: string) {
    setElegidos((previos) => previos.filter((x) => x !== idQuitado));
    entrada.current?.focus();
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setAbierto(false);
    if (e.key === "Backspace" && texto === "" && elegidos.length > 0) {
      // Borrar con el campo vacío quita la última ficha, como en cualquier
      // campo de etiquetas.
      setElegidos((previos) => previos.slice(0, -1));
      return;
    }
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) return setAbierto(true);
    if (candidatas.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltada((i) => (i + 1) % candidatas.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((i) => (i - 1 + candidatas.length) % candidatas.length);
    } else if (e.key === "Enter" && abierto) {
      // Solo con la lista abierta: si no, Enter envía el formulario.
      e.preventDefault();
      elegir(resaltada);
    }
  }

  return (
    <div ref={contenedor} className="relative">
      {elegidos.map((idElegido) => (
        <input key={idElegido} type="hidden" name={name} value={idElegido} />
      ))}

      {elegidos.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Elegidos">
          {elegidos.map((idElegido) => {
            const nombre = porId.get(idElegido)?.nombre ?? idElegido;
            return (
              <li
                key={idElegido}
                className="inline-flex items-center gap-1 rounded-pill border border-borde bg-superficie-sutil py-0.5 pl-2.5 pr-1 text-xs font-medium text-texto-titulo"
              >
                {nombre}
                <button
                  type="button"
                  onClick={() => quitar(idElegido)}
                  aria-label={`Quitar a ${nombre}`}
                  className="rounded-pill p-0.5 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-tinte hover:text-texto-cuerpo focus:shadow-ring focus:outline-none"
                >
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={entrada}
        id={id}
        role="combobox"
        aria-expanded={abierto && candidatas.length > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        value={texto}
        placeholder={nadaQueElegir ? vacio : placeholder}
        disabled={nadaQueElegir}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setResaltada(0);
        }}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onKeyDown={alTeclado}
        className={clsx(
          "w-full rounded-sm border bg-superficie-pagina px-3 py-2 text-sm text-texto-cuerpo",
          "outline-none transition-colors duration-rapido ease-estandar placeholder:text-gray-40",
          "focus:border-acento focus:shadow-ring disabled:bg-superficie-sutil disabled:text-texto-tenue",
          problema ? "border-peligro" : "border-borde",
        )}
      />

      {abierto && !nadaQueElegir && (
        <ul
          id={listaId}
          role="listbox"
          aria-multiselectable
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border border-borde bg-superficie-tarjeta py-1 shadow-md"
        >
          {candidatas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-texto-tenue">Nadie coincide con «{texto.trim()}».</li>
          ) : (
            candidatas.map((opcion, i) => (
              <li
                key={opcion.id}
                role="option"
                aria-selected={i === resaltada}
                onMouseEnter={() => setResaltada(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(i);
                }}
                className={clsx(
                  "cursor-pointer px-3 py-2 text-sm",
                  i === resaltada ? "bg-superficie-tinte" : "bg-transparent",
                )}
              >
                <span className="text-texto-cuerpo">{opcion.nombre}</span>
                {opcion.detalle && <span className="ml-2 text-xs text-texto-tenue">{opcion.detalle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
