"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";

export type Sugerencia = {
  id: string;
  nombre: string;
  /** Segunda línea: ciudad, cargo, lo que distinga a dos homónimos. */
  detalle?: string | null;
};

export type Eleccion =
  | { tipo: "EXISTENTE"; id: string; nombre: string }
  | { tipo: "NUEVA"; nombre: string }
  | { tipo: "VACIA" };

/**
 * Campo que sugiere lo que ya existe y deja crear lo que no.
 *
 * ## El problema real que resuelve
 *
 * Si quien captura no ve que «Hidrosistemas del Valle» ya existe, va a escribir
 * «Hidrosistemas del Valle SA» y el histórico de esa cuenta queda partido en
 * dos para siempre. Los duplicados de organización no se limpian nunca. Por eso
 * el campo busca desde el segundo carácter y **dice en todo momento** si lo que
 * hay escrito corresponde a algo existente o va a crear algo nuevo.
 *
 * Esa señal —`existente` / `nueva`— la pinta quien lo usa, a partir de la
 * elección que este componente reporta.
 */
export function Autocompletado({
  id,
  placeholder,
  buscar,
  alElegir,
  permitirNueva = true,
  etiquetaCrear = "Crear",
  deshabilitado,
  problema,
}: {
  id: string;
  placeholder?: string;
  buscar: (texto: string) => Promise<Sugerencia[]>;
  alElegir: (eleccion: Eleccion) => void;
  permitirNueva?: boolean;
  etiquetaCrear?: string;
  deshabilitado?: boolean;
  problema?: string;
}) {
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const listaId = useId();

  useEffect(() => {
    const termino = texto.trim();
    if (termino.length < 2) {
      setSugerencias([]);
      return;
    }

    // Sin espera, cada tecla dispara una consulta. 200 ms es lo que tarda una
    // pausa natural al teclear, no una cifra tomada al aire.
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      // Si el efecto ya se limpió mientras corría el temporizador, no hay a
      // quién entregarle nada y la consulta se ahorra entera.
      if (!vigente) return;

      const r = await buscar(termino);

      // Entre la petición y su respuesta pudo teclearse otra cosa. Pintar la
      // anterior mostraría sugerencias de un texto que ya no está en el campo.
      if (vigente) {
        setSugerencias(r);
        setResaltada(0);
        setBuscando(false);
      }
    }, 200);

    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [texto, buscar]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const coincidenciaExacta = sugerencias.find(
    (s) => s.nombre.toLowerCase() === texto.trim().toLowerCase(),
  );
  const ofreceCrear =
    permitirNueva && texto.trim().length >= 2 && !coincidenciaExacta && !buscando;

  const opciones: (Sugerencia | { crear: true })[] = [
    ...sugerencias,
    ...(ofreceCrear ? [{ crear: true as const }] : []),
  ];

  function elegir(indice: number) {
    const opcion = opciones[indice];
    if (!opcion) return;

    if ("crear" in opcion) {
      setTexto(texto.trim());
      alElegir({ tipo: "NUEVA", nombre: texto.trim() });
    } else {
      setTexto(opcion.nombre);
      alElegir({ tipo: "EXISTENTE", id: opcion.id, nombre: opcion.nombre });
    }
    setAbierto(false);
  }

  function alTeclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setAbierto(false);
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) return setAbierto(true);
    if (opciones.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltada((i) => (i + 1) % opciones.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((i) => (i - 1 + opciones.length) % opciones.length);
    } else if (e.key === "Enter") {
      // Solo cuando la lista está abierta: si no, Enter debe enviar el
      // formulario, que es lo que quien teclea rápido espera.
      if (abierto) {
        e.preventDefault();
        elegir(resaltada);
      }
    }
  }

  return (
    <div ref={contenedor} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={abierto && opciones.length > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        value={texto}
        placeholder={placeholder}
        disabled={deshabilitado}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          // Mientras teclea, lo escrito todavía no es una elección: el padre
          // debe saber que hay texto sin resolver, no un id viejo que ya no
          // corresponde a lo que se ve.
          alElegir(
            e.target.value.trim() === ""
              ? { tipo: "VACIA" }
              : { tipo: "NUEVA", nombre: e.target.value.trim() },
          );
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclado}
        className={clsx(
          "w-full rounded-sm border bg-superficie-pagina px-3 py-2 text-sm text-texto-cuerpo",
          "outline-none transition-colors duration-rapido ease-estandar placeholder:text-gray-40",
          "focus:border-acento focus:shadow-ring disabled:bg-superficie-sutil disabled:text-texto-tenue",
          problema ? "border-peligro" : "border-borde",
        )}
      />

      {abierto && opciones.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-sm border border-borde bg-superficie-tarjeta py-1 shadow-md"
        >
          {opciones.map((opcion, i) => {
            const esCrear = "crear" in opcion;
            return (
              <li
                key={esCrear ? "__crear" : opcion.id}
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
                  esCrear && "border-t border-borde",
                )}
              >
                {esCrear ? (
                  <span className="flex items-center gap-1.5 font-medium text-acento">
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                    </svg>
                    {etiquetaCrear} «{texto.trim()}»
                  </span>
                ) : (
                  <>
                    <span className="text-texto-cuerpo">{opcion.nombre}</span>
                    {opcion.detalle && (
                      <span className="ml-2 text-xs text-texto-tenue">{opcion.detalle}</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
