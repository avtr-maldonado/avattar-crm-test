"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { Panel } from "@/components/ui/formulario";

/**
 * El detalle de un prospecto como popup · decisiones §58. Sigue viviendo en la
 * URL (`p=<id>`): se abre al llegar con el parámetro y cerrarlo navega a la
 * misma pantalla sin él, así que el enlace se comparte y el botón de regresar
 * funciona. Cierra con Escape, la ✕ o pulsando fuera: es un panel que muestra.
 */
export function PopupDeProspecto({ titulo, subtitulo, hrefCerrar, children }: { titulo: string; subtitulo?: string; hrefCerrar: string; children: ReactNode }) {
  const router = useRouter();
  const cerrar = useCallback(() => router.push(hrefCerrar, { scroll: false }), [router, hrefCerrar]);
  return (
    <Panel titulo={titulo} subtitulo={subtitulo} abierto alCerrar={cerrar} ancho="lg" cerrarAlFondo>
      {children}
    </Panel>
  );
}
