"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Una fila de tabla que lleva a su ficha al pulsar en cualquier celda · §49.
 *
 * El enlace del nombre sigue siendo **el control**: es lo que se tabula, lo que
 * lee un lector de pantalla y lo que Next prefetcha. La fila solo amplía el
 * blanco del ratón, que es lo que la gente espera de una tabla de cuentas.
 *
 * Por eso el oyente va al DOM y no a `onClick`: una fila no es un control
 * (jsx-a11y lo marca, y con razón), y así se pueden dejar pasar los clics que
 * ya tienen dueño —un enlace, un botón, un campo— y los que son para
 * seleccionar texto. Con Ctrl o ⌘ abre en otra pestaña, como haría el enlace.
 */
export function FilaEnlazada({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const fila = ref.current;
    if (!fila) return;

    const alPulsar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const objetivo = e.target as HTMLElement;
      if (objetivo.closest("a, button, input, select, textarea, label, [role='button']")) return;
      if (window.getSelection()?.toString()) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      router.push(href);
    };

    fila.addEventListener("click", alPulsar);
    return () => fila.removeEventListener("click", alPulsar);
  }, [href, router]);

  return (
    <tr ref={ref} className={clsx("cursor-pointer", className)}>
      {children}
    </tr>
  );
}
