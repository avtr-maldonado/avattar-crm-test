"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ContadorRubro } from "./ContadorRubro";
import type { Rubro } from "./RubrosNavegacion";

/**
 * Navegación para pantallas angostas.
 *
 * La barra lateral se oculta bajo `lg` porque 240 px de ancho fijo dejan sin
 * lugar al contenido en una tableta y son imposibles en un teléfono. Esto la
 * reemplaza con una tira horizontal desplazable.
 *
 * §11 · «En pantallas angostas se prioriza, en este orden: agenda del día,
 * ficha de cuenta, registro de actividad, consulta de oportunidad.» Los rubros
 * llegan ya ordenados por quien la usa; aquí no se reordenan.
 *
 * El marcador activo es el mismo punto de la barra lateral, para que sea el
 * mismo lenguaje en los dos tamaños y no haya que aprenderlo dos veces.
 */
export function NavegacionAngosta({ rubros }: { rubros: Rubro[] }) {
  const ruta = usePathname();

  return (
    <div className="sticky top-0 z-20 border-b border-navy-800 bg-navy-900 lg:hidden">
      <div className="flex items-center gap-3 px-4 pb-2 pt-3">
        <Image
          src="/marca/avattar-blanco.png"
          alt="Avattar IT Solutions"
          width={534}
          height={200}
          className="h-5 w-auto"
        />
        <span className="border-l border-navy-700 pl-3 text-xs font-semibold tracking-wide text-white">
          CRM
        </span>
      </div>

      <nav aria-label="Principal" className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-3 pb-2">
          {rubros.map((r) => {
            const activo = ruta === r.href || ruta.startsWith(`${r.href}/`);
            return (
              <li key={r.href}>
                <Link
                  href={r.href}
                  aria-current={activo ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm",
                    "transition-colors duration-rapido ease-estandar",
                    activo
                      ? "bg-navy-800 font-semibold text-white"
                      : "text-navy-200 hover:bg-navy-800/60",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "h-1.5 w-1.5 rounded-pill",
                      activo ? "bg-acento" : "bg-navy-600",
                    )}
                  />
                  {r.etiqueta}
                  {r.contador && (
                    <ContadorRubro
                      valor={r.contador}
                      className={clsx(
                        "tabular rounded-pill px-1.5 py-0.5 text-xs font-semibold leading-none",
                        r.urgente ? "bg-coral/20 text-coral" : "bg-navy-800 text-navy-300",
                      )}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
