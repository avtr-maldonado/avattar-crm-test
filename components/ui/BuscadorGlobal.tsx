"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import type { ResultadosDeBusqueda } from "@/lib/scope/busqueda";
import { ETIQUETA_ESTATUS } from "@/lib/etiquetas";
import { useBarra } from "./ContextoDeBarra";
import { Icono } from "./iconos";
import { Pastilla } from "./primitivas";

type Grupo = "Oportunidades" | "Cuentas" | "Personas";

type Fila = {
  clave: string;
  href: string;
  titulo: string;
  detalle: string;
  grupo: Grupo;
  /** Para señalar cuando el resultado es de otra oficina. */
  pais?: string;
};

/** Los tres grupos en una sola lista, que es lo que el teclado recorre. */
function aplanar(r: ResultadosDeBusqueda): Fila[] {
  const filas: Fila[] = [];
  for (const o of r.oportunidades) {
    const estado = o.status !== "ABIERTA" ? ` · ${ETIQUETA_ESTATUS[o.status]}` : "";
    filas.push({
      clave: `o-${o.id}`,
      href: `/oportunidades/${o.id}`,
      titulo: o.nombre,
      detalle: `${o.folio} · ${o.organizacion}${estado}`,
      grupo: "Oportunidades",
      pais: o.countryCode,
    });
  }
  for (const c of r.cuentas) {
    filas.push({
      clave: `c-${c.id}`,
      href: `/contactos/organizaciones/${c.id}`,
      titulo: c.nombre,
      detalle: c.ciudad ?? "",
      grupo: "Cuentas",
      pais: c.countryCode,
    });
  }
  for (const p of r.personas) {
    filas.push({
      clave: `p-${p.id}`,
      // No hay ficha de persona todavía (P-05): se llega por su empresa.
      href: `/contactos/organizaciones/${p.organizacion.id}`,
      titulo: p.nombre,
      detalle: [p.cargo, p.organizacion.nombre].filter(Boolean).join(" · "),
      grupo: "Personas",
    });
  }
  return filas;
}

/**
 * El buscador global de la barra superior.
 *
 * Busca desde el segundo carácter, con una pausa de 200 ms —lo que dura una
 * pausa natural al teclear— y descarta la respuesta si el texto ya cambió
 * cuando llega. Los resultados vienen acotados por el rol desde el servidor
 * (`buscarGlobal`, INV-01): esta pantalla no filtra nada, solo pinta.
 *
 * Las flechas recorren la lista entera, Enter abre, Escape cierra; también
 * `Ctrl+K` o `⌘K` traen el foco aquí desde cualquier lugar. Un resultado de
 * otra oficina lleva su país al lado, para que no sorprenda al abrirlo.
 */
export function BuscadorGlobal() {
  const { buscar, oficinaActiva } = useBarra();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idLista = useId();

  useEffect(() => {
    const termino = texto.trim();
    if (termino.length < 2) {
      setFilas(null);
      setBuscando(false);
      return;
    }

    let vigente = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      if (!vigente) return;
      const r = await buscar(termino);
      // Entre la petición y su respuesta pudo teclearse otra cosa.
      if (vigente) {
        setFilas(aplanar(r));
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
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        entrada.current?.focus();
        setAbierto(true);
      }
    };
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", atajo);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", atajo);
    };
  }, []);

  function irA(fila: Fila) {
    setAbierto(false);
    setTexto("");
    router.push(fila.href);
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }
    if (!abierto || !filas?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltada((i) => (i + 1) % filas.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((i) => (i - 1 + filas.length) % filas.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const fila = filas[resaltada];
      if (fila) irA(fila);
    }
  }

  const mostrar = abierto && texto.trim().length >= 2;
  const idEntrada = `${idLista}-entrada`;

  return (
    <div ref={contenedor} className="relative hidden lg:block">
      <label htmlFor={idEntrada} className="sr-only">
        Buscar en el CRM
      </label>
      <input
        ref={entrada}
        id={idEntrada}
        type="search"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclas}
        placeholder="Buscar cuenta, oportunidad, persona…"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-80 rounded-sm border border-borde bg-superficie-sutil py-1.5 pl-3 pr-10 text-sm text-texto-cuerpo outline-none transition-colors duration-rapido ease-estandar placeholder:text-texto-tenue focus:border-acento focus:bg-superficie-pagina focus:shadow-ring"
      />
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => {
          entrada.current?.focus();
          setAbierto(true);
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xs p-1 text-texto-tenue transition-colors duration-rapido hover:text-texto-cuerpo"
      >
        <Icono nombre="lupa" className="size-4" />
      </button>

      {mostrar && (
        <div
          id={idLista}
          role="listbox"
          className="absolute right-0 top-full z-20 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] animate-aparecer rounded-md border border-borde bg-superficie-tarjeta shadow-md"
        >
          {filas === null ? (
            <p className="px-4 py-3 text-xs text-texto-tenue">{buscando ? "Buscando…" : ""}</p>
          ) : filas.length === 0 ? (
            <p className="px-4 py-3 text-xs text-texto-tenue">
              Nada con «{texto.trim()}» dentro de tu alcance.
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {filas.map((f, i) => (
                <li key={f.clave} role="option" aria-selected={i === resaltada}>
                  {(i === 0 || filas[i - 1]!.grupo !== f.grupo) && (
                    <p className="eyebrow px-4 pb-1 pt-2 text-texto-tenue">{f.grupo}</p>
                  )}
                  <Link
                    href={f.href}
                    onClick={() => irA(f)}
                    onMouseEnter={() => setResaltada(i)}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-rapido",
                      i === resaltada ? "bg-superficie-tinte" : "hover:bg-superficie-sutil",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-texto-titulo">{f.titulo}</p>
                      {f.detalle && <p className="truncate text-xs text-texto-tenue">{f.detalle}</p>}
                    </div>
                    {f.pais && f.pais !== oficinaActiva && (
                      <Pastilla tono="acento" titulo="De otra oficina">
                        {f.pais}
                      </Pastilla>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
