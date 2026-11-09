"use client";

import { useActionState, useId } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Panel, Seleccion, useResultadoVivo } from "@/components/ui/formulario";

export type MotivoDeDescarte = { id: string; name: string };

/** Descartar con motivo del catálogo · decisiones §58. Terminal: el panel lo dice en el botón. */
export function DescartarProspecto({
  leadId,
  nombre,
  motivos,
  abierto,
  alCerrar,
  accion,
}: {
  leadId: string;
  nombre: string;
  motivos: MotivoDeDescarte[];
  abierto: boolean;
  alCerrar: () => void;
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [resultadoCrudo, enviar, enviando] = useActionState(async (previo: ResultadoAccion | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    alCerrar();
    avisar.exito("Prospecto descartado", nombre);
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  const idFormulario = useId();

  return (
    <Panel
      titulo="Descartar prospecto"
      subtitulo={nombre}
      abierto={abierto}
      alCerrar={alCerrar}
      pie={
        <div className="ml-auto flex items-center gap-2">
          <Boton variante="fantasma" type="button" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" type="submit" form={idFormulario} disabled={enviando}>
            {enviando ? "Descartando…" : "Descartar"}
          </Boton>
        </div>
      }
    >
      <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
        <input type="hidden" name="leadId" value={leadId} />
        <Campo etiqueta="Motivo" htmlFor={`${idFormulario}-motivo`} problema={problemaDe(resultado, "discardReasonId")}>
          <Seleccion id={`${idFormulario}-motivo`} name="discardReasonId" defaultValue="" problema={problemaDe(resultado, "discardReasonId")}>
            <option value="">Elige el motivo</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Seleccion>
        </Campo>
        <AvisosDeAccion resultado={resultado} />
      </form>
    </Panel>
  );
}
