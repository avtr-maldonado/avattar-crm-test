"use client";

import Image from "next/image";
import { useState } from "react";
import { clsx } from "clsx";
import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL } from "@/lib/etiquetas";
import { COOKIE_MENU, MENU_COLAPSADO, MENU_EXPANDIDO, UN_ANIO_EN_SEGUNDOS } from "@/lib/preferencias";
import { Icono } from "./iconos";
import { RubrosNavegacion, type Rubro } from "./RubrosNavegacion";

/**
 * Barra lateral fija · §13.5.
 *
 * ## Alto y desplazamiento
 *
 * Ocupa exactamente el alto de la pantalla y no se desplaza: `h-screen` con
 * `sticky top-0` y `overflow-hidden`. Quien hace scroll es el contenido. Una
 * barra que se va hacia arriba obliga a subir para cambiar de pantalla, y en
 * una aplicación que se usa ocho horas eso se paga en cada cambio de contexto.
 *
 * ## Contraída, quedan los iconos
 *
 * Se contrae a 64 px con el botón del encabezado, a la derecha del nombre:
 * iconos con su nombre en `title`, los contadores como insignia sobre el icono,
 * el avatar solo. Contraída, el encabezado entero es el conmutador: 64 px no
 * dan para el nombre y el botón, y expandir es lo único que se puede querer
 * hacer ahí. La preferencia vive
 * en una cookie que el layout lee en el servidor, así que la barra ya nace del
 * ancho correcto y no salta al hidratar. Se escribe desde aquí con
 * `document.cookie`: no hace falta un viaje al servidor para recordar un ancho.
 *
 * ## El bloque de sesión
 *
 * No es una firma decorativa al pie. En un sistema cuyo eje es el alcance por
 * rol (§2.3), **bajo qué alcance estoy operando** es información de trabajo:
 * explica por qué el pipeline muestra catorce oportunidades y no cuarenta, y
 * por qué Análisis aparece o no en el menú. Por eso está siempre a la vista y
 * no escondido tras el avatar. No es un conmutador: el rol lo cambia
 * Administración.
 */
export type SeccionNavegacion = {
  titulo: string;
  rubros: Rubro[];
};

export function BarraLateral({
  secciones,
  usuario,
  colapsadoInicial = false,
}: {
  secciones: SeccionNavegacion[];
  usuario: {
    nombre: string;
    iniciales: string;
    rol: Role;
    paises: CountryCode[];
  };
  colapsadoInicial?: boolean;
}) {
  const [colapsado, setColapsado] = useState(colapsadoInicial);

  function alternar() {
    const siguiente = !colapsado;
    setColapsado(siguiente);
    document.cookie = `${COOKIE_MENU}=${siguiente ? MENU_COLAPSADO : MENU_EXPANDIDO}; path=/; max-age=${UN_ANIO_EN_SEGUNDOS}; samesite=lax`;
  }

  return (
    <aside
      className={clsx(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden bg-navy-900 lg:flex",
        "transition-[width] duration-base ease-estandar",
        colapsado ? "w-16" : "w-64",
      )}
    >
      <div
        className={clsx(
          "flex items-center pb-4 pt-5",
          colapsado ? "justify-center px-2" : "gap-3 pl-5 pr-3",
        )}
      >
        {!colapsado && (
          <>
            <Image
              src="/marca/avattar-blanco.png"
              alt="Avattar IT Solutions"
              width={534}
              height={200}
              priority
              className="h-6 w-auto"
            />
            <span className="border-l border-navy-700 pl-3 text-sm font-semibold tracking-wide text-white">
              CRM
            </span>
          </>
        )}

        <button
          type="button"
          onClick={alternar}
          aria-expanded={!colapsado}
          aria-label={colapsado ? "Expandir el menú" : "Contraer el menú"}
          title={colapsado ? "Expandir el menú" : "Contraer el menú"}
          className={clsx(
            "grid size-8 shrink-0 place-items-center rounded-sm text-navy-300",
            "transition-colors duration-rapido ease-estandar hover:bg-navy-800/60 hover:text-white",
            !colapsado && "ml-auto",
          )}
        >
          <Icono nombre={colapsado ? "expandir" : "contraer"} className="size-4" />
        </button>
      </div>

      <nav
        aria-label="Principal"
        className={clsx("min-h-0 flex-1 overflow-y-auto pb-4", colapsado ? "px-2" : "px-3")}
      >
        {secciones.map((s, i) => (
          <Seccion key={s.titulo} seccion={s} colapsado={colapsado} primera={i === 0} />
        ))}
      </nav>

      <BloqueDeSesion usuario={usuario} colapsado={colapsado} />
    </aside>
  );
}

function Seccion({
  seccion,
  colapsado,
  primera,
}: {
  seccion: SeccionNavegacion;
  colapsado: boolean;
  primera: boolean;
}) {
  if (seccion.rubros.length === 0) return null;

  return (
    <div
      className={clsx(
        "pb-5",
        // Contraída no hay título de sección; una línea separa una de otra.
        colapsado
          ? primera
            ? "pt-1"
            : "border-t border-navy-800 pt-3"
          : "pt-3 first:pt-0",
      )}
    >
      {!colapsado && <p className="eyebrow px-2.5 pb-2 text-navy-400">{seccion.titulo}</p>}
      <RubrosNavegacion rubros={seccion.rubros} colapsado={colapsado} />
    </div>
  );
}

/**
 * Quién soy y sobre qué datos opero. Lo segundo es lo que casi nunca se muestra
 * y aquí es lo que más explica: el alcance decide todo lo que la pantalla dice.
 */
function BloqueDeSesion({
  usuario,
  colapsado,
}: {
  usuario: { nombre: string; iniciales: string; rol: Role; paises: CountryCode[] };
  colapsado: boolean;
}) {
  const resumen = `${usuario.nombre} · ${ETIQUETA_ROL[usuario.rol]} · ${usuario.paises.join(", ")}`;

  if (colapsado) {
    return (
      <div className="flex shrink-0 justify-center border-t border-navy-800 px-2 py-4">
        <span
          title={resumen}
          aria-label={resumen}
          className="grid h-8 w-8 place-items-center rounded-pill bg-acento text-xs font-semibold text-navy-900"
        >
          {usuario.iniciales}
        </span>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-navy-800 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-acento text-xs font-semibold text-navy-900"
        >
          {usuario.iniciales}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium text-white">{usuario.nombre}</p>
          <p className="truncate text-xs text-navy-300">{ETIQUETA_ROL[usuario.rol]}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <span className="eyebrow text-navy-500">Alcance</span>
        <span className="flex gap-1">
          {usuario.paises.map((p) => (
            <span
              key={p}
              className="rounded-xs bg-navy-800 px-1.5 py-0.5 text-xs font-medium text-navy-200"
            >
              {p}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
