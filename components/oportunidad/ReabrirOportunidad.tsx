"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Panel, useEnvioQueConserva } from "@/components/ui/formulario";

type Accion = (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;

/**
 * Reabrir una ganada o perdida · RN-18, enmendada en decisiones §32.
 *
 * Un botón secundario —no compite con Ganada y Perdida— y una confirmación
 * que dice qué pasa: vuelve a abierta en la etapa donde se cerró, con el
 * mismo folio; se borran el cierre real y el motivo de pérdida; lo demás se
 * queda. Quién puede lo decide el servidor; la pantalla solo lo ofrece a quien
 * el dominio va a aceptar.
 */
export function ReabrirOportunidad({
  opportunityId,
  estatus,
  etapa,
  accion,
}: {
  opportunityId: string;
  /** «Ganada» o «Perdida», ya en español. */
  estatus: string;
  etapa: string;
  accion: Accion;
}) {
  const [abierto, setAbierto] = useState(false);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoAccion | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito("Oportunidad reabierta", `Sigue en ${etapa}, con el mismo folio.`);
      return r;
    },
    null,
  );
  const alEnviar = useEnvioQueConserva(enviar);

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Reabrir
      </Boton>

      <Panel
        titulo="Reabrir la oportunidad"
        subtitulo={`Está ${estatus.toLowerCase()}. Volverá a estar abierta en ${etapa}, con el mismo folio.`}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              Queda en la bitácora quién la reabrió y desde qué estatus (RN-18).
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="reabrir-oportunidad" disabled={enviando}>
                {enviando ? "Reabriendo…" : "Confirmar reapertura"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="reabrir-oportunidad" className="flex flex-col gap-4" onSubmit={alEnviar}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <p className="text-sm text-texto-cuerpo">
            Se borran el cierre real y, si la hubo, la razón de pérdida. La cotización, los hitos,
            la calificación MEDDIC y las actividades se quedan como están, y el proceso continúa
            desde {etapa}.
          </p>
          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
