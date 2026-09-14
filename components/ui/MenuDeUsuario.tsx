"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL, NOMBRE_PAIS } from "@/lib/etiquetas";
import { Boton } from "./primitivas";

/**
 * Lo que la barra superior sabe de quien está operando. Llega desde la sesión,
 * ya resuelto por la pantalla; el componente no consulta nada.
 */
export type UsuarioDeBarra = {
  nombre: string;
  correo: string;
  iniciales: string;
  rol: Role;
  paises: CountryCode[];
};

/**
 * Menú de usuario · se abre desde el nombre y el avatar de la barra superior.
 *
 * Dice tres cosas, en este orden: quién eres, con qué alcance operas, y cómo
 * salir. Nada más: no hay pantalla de perfil ni preferencias a las que llevar,
 * y un menú con entradas que no van a ningún lado enseña a ignorar el menú.
 *
 * El alcance va con nombres de país completos, no con siglas: aquí hay espacio
 * y es información de trabajo (§2.3), explica por qué el pipeline muestra lo que
 * muestra. La barra lateral usa siglas porque no le cabe otra cosa.
 *
 * ## Cerrar sesión
 *
 * Es un formulario `POST` a `/auth/signout`, no una Server Action: el contrato
 * de las acciones (`ResultadoAccion`) es devolver un resultado, y cerrar sesión
 * no devuelve nada, termina en otra pantalla. Como formulario funciona sin
 * JavaScript y no depende de ningún estado del cliente.
 *
 * Cierra la sesión del CRM, no la de Microsoft. Con Entra ID la cuenta sigue
 * abierta en el navegador y el siguiente «Entrar con Microsoft» vuelve a entrar
 * sin pedir clave; si nadie lo dice, parece que cerrar sesión no hizo nada.
 *
 * ## Teclado y lector de pantalla
 *
 * El botón anuncia que abre un diálogo y si está abierto. Al abrir, el foco
 * pasa al panel; Escape lo cierra y devuelve el foco al botón; un clic fuera
 * también lo cierra. El panel es un `<dialog>` **no modal** —`open` sin
 * `showModal()`— para que quede anclado bajo el botón y el resto de la página
 * siga usable; por eso Escape y el clic fuera se atienden a mano, que el
 * navegador solo los da gratis en el modo modal. No es un `menu`: un menú es
 * una lista de comandos, y esto es una ficha con una acción al pie.
 */
export function MenuDeUsuario({ usuario }: { usuario: UsuarioDeBarra }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const idPanel = useId();
  const idTitulo = useId();

  useEffect(() => {
    if (!abierto) return;

    panel.current?.focus();

    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      disparador.current?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        ref={disparador}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        aria-label={`Opciones de ${usuario.nombre}`}
        onClick={() => setAbierto((a) => !a)}
        className={clsx(
          "flex items-center gap-2 rounded-sm py-1 pl-1 pr-2 text-left",
          "transition-colors duration-rapido ease-estandar hover:bg-superficie-sutil",
          abierto && "bg-superficie-sutil",
        )}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-navy-600 text-xs font-semibold text-white"
        >
          {usuario.iniciales}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-medium text-texto-titulo">{usuario.nombre}</span>
          <span className="block text-xs text-texto-tenue">{ETIQUETA_ROL[usuario.rol]}</span>
        </span>
        <Chevron abierto={abierto} />
      </button>

      <dialog
        ref={panel}
        id={idPanel}
        open={abierto}
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={clsx(
          // El `<dialog>` trae posición absoluta centrada con márgenes
          // automáticos; aquí se ancla a la derecha, bajo el botón.
          "absolute left-auto right-0 top-full z-20 m-0 mt-2 w-72 max-w-[calc(100vw-2rem)]",
          "animate-aparecer rounded-md border border-borde bg-superficie-tarjeta p-0 text-texto-cuerpo shadow-md",
        )}
      >
        <div className="flex items-center gap-3 px-4 pt-4">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-navy-600 text-sm font-semibold text-white"
            >
              {usuario.iniciales}
            </span>
            <div className="min-w-0">
              <p id={idTitulo} className="truncate text-sm font-semibold text-texto-titulo">
                {usuario.nombre}
              </p>
              <p className="truncate text-xs text-texto-tenue" title={usuario.correo}>
                {usuario.correo}
              </p>
            </div>
          </div>

          <dl className="mx-4 mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-borde pt-3 text-sm">
            <dt className="text-texto-tenue">Rol</dt>
            <dd className="text-texto-cuerpo">{ETIQUETA_ROL[usuario.rol]}</dd>
            <dt className="text-texto-tenue">Alcance</dt>
            <dd className="text-texto-cuerpo">
              {usuario.paises.map((p) => NOMBRE_PAIS[p]).join(", ")}
            </dd>
          </dl>

          <form method="post" action="/auth/signout" className="mt-4 border-t border-borde p-3">
            <Boton type="submit" variante="secundario" className="w-full">
              Cerrar sesión
            </Boton>
            <p className="mt-2 text-xs leading-snug text-texto-tenue">
              Sales del CRM. Tu cuenta de Microsoft sigue abierta en este navegador.
            </p>
          </form>
      </dialog>
    </div>
  );
}

/** La única señal de que el bloque abre algo. Gira para decir que está abierto. */
function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={clsx(
        "h-3 w-3 shrink-0 text-texto-tenue transition-transform duration-rapido ease-estandar",
        abierto && "rotate-180",
      )}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
