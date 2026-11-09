"use client";

import { useActionState, useId } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Panel, Seleccion, useResultadoVivo } from "@/components/ui/formulario";

export type VendedorAsignable = { id: string; name: string };
type Resultado = ResultadoAccion<{ asignados: number }>;

/**
 * Asignar uno o varios prospectos a un vendedor · decisiones §58. El mismo
 * panel desde la fila, la selección múltiple y el detalle: los ids viajan
 * repetidos en el formulario y la acción los lee con `getAll`.
 */
export function AsignarProspectos({
  ids,
  vendedores,
  abierto,
  alCerrar,
  accion,
}: {
  ids: string[];
  vendedores: VendedorAsignable[];
  abierto: boolean;
  alCerrar: () => void;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [resultadoCrudo, enviar, enviando] = useActionState(async (previo: Resultado | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    alCerrar();
    avisar.exito(r.datos.asignados === 1 ? "Prospecto asignado" : `${r.datos.asignados} prospectos asignados`);
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  // La tabla y el detalle montan este panel a la vez: el id debe ser propio.
  const idFormulario = useId();

  return (
    <Panel
      titulo={ids.length === 1 ? "Asignar vendedor" : `Asignar ${ids.length} prospectos`}
      abierto={abierto}
      alCerrar={alCerrar}
      pie={
        <div className="ml-auto flex items-center gap-2">
          <Boton variante="fantasma" type="button" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} disabled={enviando || vendedores.length === 0}>
            {enviando ? "Asignando…" : "Asignar"}
          </Boton>
        </div>
      }
    >
      <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <Campo etiqueta="Vendedor" htmlFor={`${idFormulario}-vendedor`} problema={problemaDe(resultado, "assignedToId") ?? problemaDe(resultado, "vendedorId")}>
          <Seleccion id={`${idFormulario}-vendedor`} name="vendedorId" defaultValue="" problema={problemaDe(resultado, "assignedToId")}>
            <option value="">Elige al vendedor</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Seleccion>
        </Campo>
        {vendedores.length === 0 && <p className="text-sm text-texto-tenue">No hay vendedores activos en este país.</p>}
        <AvisosDeAccion resultado={resultado} />
      </form>
    </Panel>
  );
}
