"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL, NOMBRE_PAIS } from "@/lib/etiquetas";
import { COOKIE_MENU, MENU_COLAPSADO, MENU_EXPANDIDO, UN_ANIO_EN_SEGUNDOS } from "@/lib/preferencias";
import { avisarSiCorresponde } from "./avisos";
import { useBarra } from "./ContextoDeBarra";
import { Icono } from "./iconos";
import { RubrosNavegacion, type Rubro } from "./RubrosNavegacion";

/**
 * Barra lateral fija · §13.5, rediseñada el 27-nov-2026 con la marca Avattar v4 (decisiones §75).
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
 * Se contrae con el botón del encabezado: iconos con su nombre en `title`, los
 * contadores como un punto sobre el icono (el número va en `aria-label`) y el
 * avatar solo. Contraída, el ícono de la app es el conmutador: expandir es lo
 * único que se puede querer hacer ahí. La preferencia vive en una cookie que el
 * layout lee en el servidor, así que la barra nace del ancho correcto y no salta
 * al hidratar.
 *
 * ## El alcance, al pie
 *
 * En un sistema cuyo eje es el alcance por rol (§2.3), **sobre qué oficina estoy
 * operando** es información de trabajo: explica por qué el pipeline muestra
 * catorce oportunidades y no cuarenta. Desde §75 el bloque «Alcance» es además
 * el selector de oficina (antes en la barra superior, que lo conserva solo en
 * pantallas angostas, donde esta barra no se muestra). Con un solo país no se
 * pinta: no hay nada que elegir.
 */
export type SeccionNavegacion = {
  titulo: string;
  rubros: Rubro[];
};

type Usuario = { nombre: string; iniciales: string; rol: Role; paises: CountryCode[] };

export function BarraLateral({
  secciones,
  usuario,
  colapsadoInicial = false,
}: {
  secciones: SeccionNavegacion[];
  usuario: Usuario;
  colapsadoInicial?: boolean;
}) {
  const [colapsado, setColapsado] = useState(colapsadoInicial);

  function alternar() {
    const siguiente = !colapsado;
    setColapsado(siguiente);
    document.cookie = `${COOKIE_MENU}=${siguiente ? MENU_COLAPSADO : MENU_EXPANDIDO}; path=/; max-age=${UN_ANIO_EN_SEGUNDOS}; samesite=lax`;
  }

  const visibles = secciones.filter((s) => s.rubros.length > 0);

  return (
    <aside
      className={clsx(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-borde bg-navy-900 lg:flex",
        "transition-[width] duration-base ease-estandar",
        colapsado ? "w-[4.75rem]" : "w-[17.5rem]",
      )}
    >
      <Encabezado colapsado={colapsado} alternar={alternar} />

      <nav aria-label="Principal" className={clsx("min-h-0 flex-1 overflow-y-auto py-5", colapsado ? "px-3" : "px-4")}>
        {visibles.map((s, i) => (
          <div key={s.titulo} className={clsx(i > 0 && (colapsado ? "mt-3" : "mt-6"))}>
            {colapsado ? (
              i > 0 && <span aria-hidden className="mx-auto mb-3 block h-px w-8 bg-navy-800" />
            ) : (
              <p className="mb-2 px-3 text-xs font-medium uppercase tracking-[0.14em] text-navy-300">{s.titulo}</p>
            )}
            <RubrosNavegacion rubros={s.rubros} colapsado={colapsado} />
          </div>
        ))}
      </nav>

      <Pie usuario={usuario} colapsado={colapsado} />
    </aside>
  );
}

function Encabezado({ colapsado, alternar }: { colapsado: boolean; alternar: () => void }) {
  const icono = (
    <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-navy-700 bg-navy-900">
      <Image src="/pwa/icono-192.png" alt="" width={40} height={40} priority className="size-10" />
    </span>
  );

  if (colapsado) {
    return (
      <div className="px-3 pb-2 pt-5">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={false}
          aria-label="Expandir el menú"
          title="Expandir el menú"
          className="mx-auto block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-acento"
        >
          {icono}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 pb-2 pl-5 pr-3 pt-5">
      {icono}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-lg font-extrabold tracking-tight text-white">CRM Avattar</p>
        <p className="truncate text-xs text-navy-300">Avattar IT Solutions</p>
      </div>
      <button
        type="button"
        onClick={alternar}
        aria-expanded
        aria-label="Contraer el menú"
        title="Contraer el menú"
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-sm text-navy-300 transition-colors duration-rapido ease-estandar hover:bg-navy-800/70 hover:text-white"
      >
        <Icono nombre="contraer" className="size-4" />
      </button>
    </div>
  );
}

/** Alcance (el selector de oficina) y quién soy, con la salida a la mano. */
function Pie({ usuario, colapsado }: { usuario: Usuario; colapsado: boolean }) {
  const resumen = `${usuario.nombre} · ${ETIQUETA_ROL[usuario.rol]} · ${usuario.paises.join(", ")}`;

  if (colapsado) {
    return (
      <div className="flex shrink-0 justify-center px-3 pb-5 pt-3">
        <Avatar iniciales={usuario.iniciales} titulo={resumen} />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-navy-800 px-4 pb-5 pt-4">
      <Alcance />
      <div className="mt-4 flex items-center gap-3">
        <Avatar iniciales={usuario.iniciales} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold text-white">{usuario.nombre}</p>
          <p className="truncate text-xs text-navy-300">{ETIQUETA_ROL[usuario.rol]}</p>
        </div>
        {/* POST, no Server Action: el contrato de /auth/signout (ver MenuDeUsuario). */}
        <form method="post" action="/auth/signout">
          <button
            type="submit"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="grid size-9 place-items-center rounded-sm text-navy-300 transition-colors duration-rapido ease-estandar hover:bg-navy-800/70 hover:text-white"
          >
            <IconoSalir />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * El selector de oficina en oscuro (§75): las oficinas del rol, la activa en azul.
 * Elegir escribe la cookie en el servidor y refresca la ruta, como el de la
 * barra superior; mientras tanto se atenúa.
 */
function Alcance() {
  const { oficinaActiva, oficinas, elegirOficina } = useBarra();
  const router = useRouter();
  const [cambiando, iniciar] = useTransition();
  if (oficinas.length <= 1) return null;

  function elegir(pais: CountryCode) {
    if (pais === oficinaActiva) return;
    iniciar(async () => {
      const r = await elegirOficina(pais);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <p className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.14em] text-navy-300">Alcance</p>
      <div
        role="group"
        aria-label="Oficina activa"
        className={clsx("flex gap-1 rounded-md bg-blue-900 p-1 transition-opacity duration-rapido", cambiando && "opacity-60")}
      >
        {oficinas.map((p) => {
          const activa = p === oficinaActiva;
          return (
            <button
              key={p}
              type="button"
              title={NOMBRE_PAIS[p]}
              aria-pressed={activa}
              disabled={cambiando}
              onClick={() => elegir(p)}
              className={clsx(
                "flex-1 rounded-sm py-1.5 text-sm font-bold transition-colors duration-rapido ease-estandar",
                activa ? "bg-acento text-navy-900" : "text-white hover:bg-navy-600",
              )}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Avatar({ iniciales, titulo }: { iniciales: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      className="grid size-10 shrink-0 place-items-center rounded-pill bg-navy-600 text-sm font-bold text-white"
    >
      {iniciales}
    </span>
  );
}

function IconoSalir() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}
