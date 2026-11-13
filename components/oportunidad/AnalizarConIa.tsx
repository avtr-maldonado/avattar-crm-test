"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { leyendaDeCosto } from "@/lib/agente/costo";

export type SolicitudDeAnalisis = { opportunityId: string; confirmado?: boolean; zona?: string };

/**
 * «Analizar con IA» · decisiones §63.
 *
 * El primer clic abre el aviso de costo (§65) y «Analizar» pide el análisis.
 * Si el servidor responde `CONFIRMACION` (nada ha cambiado desde la última
 * ficha), ese aviso se suma al de costo y el botón pasa a «Analizar de todos
 * modos»; ese clic manda la confirmación. Es el mismo contrato que el composer
 * usa para cerrar sin siguiente paso.
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
  // §65 · el primer clic solo abre el aviso de costo; `sinCambios` es el aviso del servidor.
  const [abierto, setAbierto] = useState(false);
  const [sinCambios, setSinCambios] = useState<string | null>(null);
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setSinCambios(null);
  }

  function pedir(confirmado: boolean) {
    iniciar(async () => {
      const r = await accion({ opportunityId, zona, confirmado });
      if (r.ok) {
        cerrar();
        avisar.informacion("Analizando con IA", "La ficha aparecerá aquí en un momento.");
        router.refresh();
        return;
      }
      if (r.motivo === "CONFIRMACION") {
        setSinCambios(r.problemas[0]?.mensaje ?? "¿Analizar de todos modos?");
        return;
      }
      if (!avisarSiCorresponde(r)) avisar.advertencia("No se pidió el análisis", r.problemas[0]?.mensaje);
    });
  }

  if (abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-lima/60 bg-lima/10 px-3 py-2">
        <div role="alert" className="flex flex-col gap-1 text-xs text-texto-cuerpo">
          {sinCambios ? <p>{sinCambios}</p> : null}
          <p>{leyendaDeCosto()}</p>
        </div>
        <Boton variante="fantasma" onClick={cerrar} disabled={pendiente}>
          Cancelar
        </Boton>
        <Boton variante="secundario" onClick={() => pedir(sinCambios !== null)} disabled={pendiente}>
          {pendiente ? "Pidiendo…" : sinCambios ? "Analizar de todos modos" : "Analizar"}
        </Boton>
      </div>
    );
  }

  return (
    <Boton variante="secundario" disabled={disabled} onClick={() => setAbierto(true)}>
      Analizar con IA
    </Boton>
  );
}
