"use client";

import { startTransition, useActionState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";

type Resultado = ResultadoAccion<{ id: string } | null>;

/**
 * Abre el borrador de cotización de una oportunidad que aún no tiene ninguna.
 *
 * Es su propio componente y no un botón dentro de la tabla porque la tabla no
 * existe hasta que hay cotización: sin esto, el estado vacío no tendría acción
 * siguiente, y §13.5 dice que los estados vacíos siempre proponen una.
 */
export function AbrirCotizacion({
  opportunityId,
  accion,
}: {
  opportunityId: string;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      avisar.exito("Cotización abierta", "Agrega líneas: el neto se vuelve el importe de la oportunidad.");
      return r;
    },
    null,
  );

  return (
    <Boton
      disabled={enviando}
      onClick={() => {
        const datos = new FormData();
        datos.set("opportunityId", opportunityId);
        startTransition(() => enviar(datos));
      }}
    >
      {enviando ? "Abriendo…" : "Abrir cotización"}
    </Boton>
  );
}
