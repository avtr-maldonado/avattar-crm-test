"use client";

import { useActionState, useId, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import { AreaDeTexto, AvisosDeAccion, Campo, Entrada, Panel, Seleccion, useEnvioQueConserva, useProblemas, useResultadoVivo } from "@/components/ui/formulario";

export type ProspectoEditable = {
  id: string;
  contactName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  companyName: string;
  companyIndustry: string | null;
  channelId: string;
  campaignId: string | null;
  score: number | null;
  notes: string | null;
};

/**
 * Editar los datos de un prospecto desde su popup · decisiones §58. Lo mismo
 * que el alta menos el país y el vendedor: el país decide alcance y
 * vendedores, y el vendedor se cambia con «Asignar». Se envía desde `onSubmit`
 * para que un rechazo no borre lo tecleado.
 */
export function EditarProspecto({
  prospecto,
  catalogos,
  accion,
}: {
  prospecto: ProspectoEditable;
  catalogos: { canales: { id: string; name: string }[]; campanas: { id: string; name: string }[] };
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const idFormulario = useId();
  const campo = (nombre: string) => `${idFormulario}-${nombre}`;

  const [resultadoCrudo, enviar, enviando] = useActionState(async (previo: ResultadoAccion | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    setAbierto(false);
    avisar.exito("Prospecto actualizado");
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  const problemas = useProblemas(resultado);
  const alEnviar = useEnvioQueConserva(enviar);

  function cerrar() {
    problemas.reiniciar();
    setAbierto(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Editar prospecto"
        title="Editar prospecto"
        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-cuerpo focus:shadow-ring focus:outline-none"
      >
        <Icono nombre="lapiz" className="size-3.5" />
        Editar
      </button>

      <Panel
        titulo="Editar prospecto"
        subtitulo={prospecto.companyName}
        abierto={abierto}
        alCerrar={cerrar}
        ancho="lg"
        pie={
          <div className="ml-auto flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" form={idFormulario} disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </div>
        }
      >
        <form id={idFormulario} onSubmit={alEnviar} onChange={problemas.alCambiar} className="flex flex-col gap-5">
          <input type="hidden" name="leadId" value={prospecto.id} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Contacto" htmlFor={campo("contactName")} problema={problemas.problema("contactName")}>
              <Entrada id={campo("contactName")} name="contactName" defaultValue={prospecto.contactName} autoComplete="off" problema={problemas.problema("contactName")} />
            </Campo>
            <Campo etiqueta="Cargo" htmlFor={campo("jobTitle")}>
              <Entrada id={campo("jobTitle")} name="jobTitle" defaultValue={prospecto.jobTitle ?? ""} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Correo" htmlFor={campo("email")} problema={problemas.problema("email")}>
              <Entrada id={campo("email")} name="email" type="email" defaultValue={prospecto.email ?? ""} autoComplete="off" problema={problemas.problema("email")} />
            </Campo>
            <Campo etiqueta="Teléfono" htmlFor={campo("phone")}>
              <Entrada id={campo("phone")} name="phone" defaultValue={prospecto.phone ?? ""} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Empresa" htmlFor={campo("companyName")} problema={problemas.problema("companyName")}>
              <Entrada id={campo("companyName")} name="companyName" defaultValue={prospecto.companyName} autoComplete="off" problema={problemas.problema("companyName")} />
            </Campo>
            <Campo etiqueta="Giro" htmlFor={campo("companyIndustry")}>
              <Entrada id={campo("companyIndustry")} name="companyIndustry" defaultValue={prospecto.companyIndustry ?? ""} autoComplete="off" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Campo etiqueta="Canal" htmlFor={campo("channelId")} problema={problemas.problema("channelId")}>
              <Seleccion id={campo("channelId")} name="channelId" defaultValue={prospecto.channelId} problema={problemas.problema("channelId")}>
                {catalogos.canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Campaña" htmlFor={campo("campaignId")} problema={problemas.problema("campaignId")}>
              <Seleccion id={campo("campaignId")} name="campaignId" defaultValue={prospecto.campaignId ?? ""}>
                <option value="">Sin campaña</option>
                {catalogos.campanas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Puntaje" htmlFor={campo("score")} problema={problemas.problema("score")}>
              <Entrada id={campo("score")} name="score" type="number" min={0} max={100} defaultValue={prospecto.score ?? ""} className="tabular" problema={problemas.problema("score")} />
            </Campo>
          </div>
          <Campo etiqueta="Notas" htmlFor={campo("notes")}>
            <AreaDeTexto id={campo("notes")} name="notes" defaultValue={prospecto.notes ?? ""} />
          </Campo>
          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
