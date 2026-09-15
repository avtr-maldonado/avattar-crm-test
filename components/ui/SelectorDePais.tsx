"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clsx } from "clsx";
import type { CountryCode } from "@/lib/dto";
import { NOMBRE_PAIS } from "@/lib/etiquetas";
import { avisarSiCorresponde } from "./avisos";
import { useBarra } from "./ContextoDeBarra";

/**
 * La oficina activa, en la barra superior · §13.5.
 *
 * «Selector de país cuando el rol tiene más de uno.» Para un gerente de México
 * no es una elección: es ruido que ocupa lugar y sugiere que puede ver
 * Colombia, cuando el alcance por rol se lo impide (AC-05). Con un solo país
 * no se pinta.
 *
 * Elegir escribe la cookie de oficina en el servidor y refresca la ruta: el
 * layout recalcula los contadores y la pantalla vuelve a leer con la oficina
 * nueva. Mientras tanto el control se atenúa; no hay estado local que pueda
 * quedarse creyendo algo distinto del servidor.
 */
export function SelectorDePais() {
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
    <div
      role="group"
      aria-label="Oficina activa"
      className={clsx(
        "flex overflow-hidden rounded-sm border border-borde transition-opacity duration-rapido",
        cambiando && "opacity-60",
      )}
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
              "px-3 py-1.5 text-xs font-semibold transition-colors duration-rapido ease-estandar",
              activa
                ? "bg-acento text-acento-texto"
                : "bg-superficie-pagina text-texto-tenue hover:bg-superficie-sutil hover:text-texto-cuerpo",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
