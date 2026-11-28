"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ContadorRubro } from "./ContadorRubro";
import { Icono, type NombreDeIcono } from "./iconos";

/**
 * Los rubros de la barra lateral, con el estado activo.
 *
 * Es cliente porque necesita `usePathname`. Se aísla del resto de la barra para
 * que lo único que cruce al navegador sea lo que de verdad depende de la ruta.
 *
 * ## El icono es el rubro
 *
 * Cada rubro lleva un icono que dice qué es, y ese icono **es** el indicador
 * de estado: apagado en `navy-400` acompaña al texto; encendido en el azul de
 * marca es lo primero que el ojo encuentra al volver a la ventana. Con el
 * menú contraído es lo único que queda, con el nombre en `title` para quien
 * pase el cursor, y el contador se convierte en una insignia sobre él.
 *
 * `aria-current="page"` va en el enlace: el resaltado visual no sirve a quien
 * navega con lector de pantalla.
 */
export type Rubro = {
  href: string;
  etiqueta: string;
  icono: NombreDeIcono;
  /**
   * Pendientes que piden acción. Un cero no se pinta: sería ruido. Llega como
   * promesa para que la barra no espere al conteo (`ContadorRubro`).
   */
  contador?: Promise<number>;
  /** Coral en vez de neutro. Para lo que tiene reloj corriendo. */
  urgente?: boolean;
};

export function RubrosNavegacion({
  rubros,
  colapsado = false,
}: {
  rubros: Rubro[];
  colapsado?: boolean;
}) {
  const ruta = usePathname();

  return (
    <ul className="space-y-0.5">
      {rubros.map((r) => {
        // `/oportunidades/OPP-2026-00417` mantiene encendido «Oportunidades»:
        // el detalle no es otro lugar, es más adentro del mismo.
        const activo = ruta === r.href || ruta.startsWith(`${r.href}/`);

        return (
          <li key={r.href}>
            <Link
              href={r.href}
              aria-current={activo ? "page" : undefined}
              title={colapsado ? r.etiqueta : undefined}
              className={clsx(
                "group relative flex items-center rounded-sm text-[0.9375rem]",
                "transition-colors duration-rapido ease-estandar",
                colapsado ? "mx-auto size-11 justify-center" : "gap-3 py-2.5 pl-3 pr-2.5",
                activo
                  ? "bg-blue-900 font-bold text-white"
                  : "text-navy-100 hover:bg-navy-800/70 hover:text-white",
              )}
            >
              <Icono
                nombre={r.icono}
                className={clsx(
                  "size-5 shrink-0 transition-colors duration-rapido",
                  activo ? "text-acento" : "text-navy-300 group-hover:text-navy-100",
                )}
              />

              {!colapsado && <span className="truncate">{r.etiqueta}</span>}

              {r.contador && (
                <ContadorRubro
                  valor={r.contador}
                  comoPunto={colapsado}
                  className={clsx(
                    colapsado
                      ? // Contraída (§75): un punto en la esquina, el número en aria-label.
                        "absolute right-1 top-1 size-2.5 rounded-pill ring-2 ring-navy-900"
                      : "tabular ml-auto min-w-[2.5rem] rounded-pill px-2 py-1 text-center text-xs font-semibold leading-none",
                    r.urgente
                      ? colapsado
                        ? "bg-coral"
                        : "bg-coral/20 text-coral"
                      : colapsado
                        ? "bg-acento"
                        : activo
                          ? "bg-acento text-navy-900"
                          : "bg-blue-900 text-white",
                  )}
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
