"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";

export type SolicitudDeAnalisis = { opportunityId: string; confirmado?: boolean; zona?: string };

/**
 * «Analizar con IA» · decisiones §63.
 *
 * Un clic pide el análisis. Si el servidor responde `CONFIRMACION` (nada ha
 * cambiado desde la última ficha), el aviso se muestra aquí mismo y el botón
 * pasa a «Analizar de todos modos»; el segundo clic manda la confirmación. Es
 * el mismo contrato que el composer usa para cerrar sin siguiente paso.
 */
export function AnalizarConIa({
  opportunityId,
  zona,
  accion,
  disabled,
}: {
  opportunityId: string;
  zona: string;
  accion: (entrada: SolicitudDeAnalisis) => Promise<ResultadoAccion<null>>;
  disabled?: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const router = useRouter();

  function pedir(confirmado: boolean) {
    iniciar(async () => {
      const r = await accion({ opportunityId, zona, confirmado });
      if (r.ok) {
        setConfirmacion(null);
        avisar.informacion("Analizando con IA", "La ficha aparecerá aquí en un momento.");
        router.refresh();
        return;
      }
      if (r.motivo === "CONFIRMACION") {
        setConfirmacion(r.problemas[0]?.mensaje ?? "¿Analizar de todos modos?");
        return;
      }
      if (!avisarSiCorresponde(r)) avisar.advertencia("No se pidió el análisis", r.problemas[0]?.mensaje);
    });
  }

  if (confirmacion) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-lima/60 bg-lima/10 px-3 py-2">
        <p role="alert" className="text-xs text-texto-cuerpo">
          {confirmacion}
        </p>
        <Boton variante="fantasma" onClick={() => setConfirmacion(null)} disabled={pendiente}>
          Cancelar
        </Boton>
        <Boton variante="secundario" onClick={() => pedir(true)} disabled={pendiente}>
          {pendiente ? "Pidiendo…" : "Analizar de todos modos"}
        </Boton>
      </div>
    );
  }

  return (
    <Boton variante="secundario" disabled={disabled || pendiente} onClick={() => pedir(false)}>
      {pendiente ? "Pidiendo…" : "Analizar con IA"}
    </Boton>
  );
}
