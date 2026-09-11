"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ContadorRubro } from "./ContadorRubro";

/**
 * Los rubros de la barra lateral, con el estado activo.
 *
 * Es cliente porque necesita `usePathname`. Se aísla del resto de la barra para
 * que el logotipo y el bloque de sesión sigan siendo servidor: lo único que
 * cruza al navegador es lo que de verdad depende de la ruta actual.
 *
 * ## El marcador activo
 *
 * El punto a la izquierda **es** el indicador, no un adorno. Apagado en
 * `navy-600` casi se funde con el fondo; encendido en el azul de marca es lo
 * primero que el ojo encuentra al volver a la ventana.
 *
 * Un solo indicador, no dos: se evaluó añadir además un riel en el borde
 * izquierdo y se descartó, porque decía lo mismo dos veces. El fondo más claro
 * y el texto en blanco acompañan; el punto es quien afirma.
 *
 * `aria-current="page"` va en el enlace: el resaltado visual no sirve a quien
 * navega con lector de pantalla.
 */
export type Rubro = {
  href: string;
  etiqueta: string;
  /**
   * Pendientes que piden acción. Un cero no se pinta: sería ruido. Llega como
   * promesa para que la barra no espere al conteo (`ContadorRubro`).
   */
  contador?: Promise<number>;
  /** Coral en vez de neutro. Para lo que tiene reloj corriendo. */
  urgente?: boolean;
};

export function RubrosNavegacion({ rubros }: { rubros: Rubro[] }) {
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
              className={clsx(
                "group flex items-center gap-2.5 rounded-sm py-2 pl-2.5 pr-2",
                "text-sm transition-colors duration-rapido ease-estandar",
                activo
                  ? "bg-navy-800 font-semibold text-white"
                  : "text-navy-200 hover:bg-navy-800/60 hover:text-white",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "h-1.5 w-1.5 shrink-0 rounded-pill transition-colors duration-rapido",
                  activo
                    ? "bg-acento"
                    : "bg-navy-600 group-hover:bg-navy-400",
                )}
              />

              <span className="truncate">{r.etiqueta}</span>

              {r.contador && (
                <ContadorRubro
                  valor={r.contador}
                  className={clsx(
                    "tabular ml-auto rounded-pill px-1.5 py-0.5 text-xs font-semibold leading-none",
                    r.urgente
                      ? "bg-coral/20 text-coral"
                      : activo
                        ? "bg-acento/20 text-blue-200"
                        : "bg-navy-800 text-navy-300",
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
