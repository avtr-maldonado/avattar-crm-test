"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Vuelve a pedir la página cada tantos segundos mientras está montado · §63.
 * La pestaña «Análisis» lo monta solo mientras dice «Analizando…», así que la
 * ficha aparece sola cuando llega y el refresco se detiene con ella.
 */
export function RefrescoPeriodico({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
