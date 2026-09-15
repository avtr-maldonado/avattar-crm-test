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
                "group relative flex items-center rounded-sm text-sm",
                "transition-colors duration-rapido ease-estandar",
                colapsado ? "justify-center py-2.5" : "gap-2.5 py-2 pl-2.5 pr-2",
                activo
                  ? "bg-navy-800 font-semibold text-white"
                  : "text-navy-200 hover:bg-navy-800/60 hover:text-white",
              )}
            >
              <Icono
                nombre={r.icono}
                className={clsx(
                  "size-5 transition-colors duration-rapido",
                  activo ? "text-acento" : "text-navy-400 group-hover:text-navy-200",
                )}
              />

              {!colapsado && <span className="truncate">{r.etiqueta}</span>}

              {r.contador && (
                <ContadorRubro
                  valor={r.contador}
                  className={clsx(
                    "tabular rounded-pill font-semibold",
                    colapsado
                      ? // Insignia en la esquina del icono, sólida y con un anillo del
                        // color de la barra para que se lea encima del trazo.
                        "absolute right-0.5 top-0.5 h-[1.125rem] min-w-[1.125rem] px-1 text-center text-[10px] leading-[1.125rem] ring-2 ring-navy-900"
                      : "ml-auto px-1.5 py-0.5 text-xs leading-none",
                    r.urgente
                      ? colapsado
                        ? "bg-coral text-white"
                        : "bg-coral/20 text-coral"
                      : colapsado
                        ? activo
                          ? "bg-acento text-navy-900"
                          : "bg-navy-700 text-navy-100"
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
