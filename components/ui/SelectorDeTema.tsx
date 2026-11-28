"use client";

import { useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { COOKIE_TEMA, TEMAS, temaDe, UN_ANIO_EN_SEGUNDOS, type Tema } from "@/lib/preferencias";

/**
 * Claro, Oscuro o Sistema, en el menú de usuario · decisiones §76.
 *
 * El tema vive en `<html data-tema>` (lo pinta el layout raíz desde la cookie `crm-tema`). Elegir
 * cambia el atributo al instante y escribe la cookie para las siguientes cargas, sin viaje al
 * servidor. Se lee del atributo con `useSyncExternalStore`: en el servidor no se marca ninguno y al
 * hidratar se toma el real, sin desajuste.
 */
const ETIQUETA: Record<Tema, string> = { claro: "Claro", oscuro: "Oscuro", sistema: "Sistema" };

function suscribir(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  return () => observador.disconnect();
}
const leer = () => temaDe(document.documentElement.dataset.tema);
const enServidor = () => null;

export function SelectorDeTema() {
  const actual = useSyncExternalStore<Tema | null>(suscribir, leer, enServidor);

  function elegir(tema: Tema) {
    document.documentElement.dataset.tema = tema;
    document.cookie = `${COOKIE_TEMA}=${tema}; path=/; max-age=${UN_ANIO_EN_SEGUNDOS}; samesite=lax`;
  }

  return (
    <div role="group" aria-label="Tema" className="flex gap-1 rounded-sm bg-superficie-sutil p-1">
      {TEMAS.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={actual === t}
          onClick={() => elegir(t)}
          className={clsx(
            "flex-1 rounded-xs px-2 py-1.5 text-xs font-semibold transition-colors duration-rapido ease-estandar",
            actual === t ? "bg-acento text-acento-texto" : "text-texto-cuerpo hover:bg-superficie-tinte",
          )}
        >
          {ETIQUETA[t]}
        </button>
      ))}
    </div>
  );
}
