"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Casilla, Panel, Seleccion } from "@/components/ui/formulario";

type ResultadoDeContacto = ResultadoAccion<{ id: string } | null>;

export type UsuarioElegible = { id: string; name: string; role: string };

/**
 * Quién ve a una persona · decisiones §29.
 *
 * Un solo panel para las dos decisiones que van juntas: **de quién es** (el
 * propietario, transferible) y **con quién se comparte** (solo lectura). Se
 * envía el estado completo —propietario y lista de casillas marcadas— y el
 * servidor calcula qué cambió; así no hay «quitar» y «agregar» que se pisen.
 *
 * Solo lo ve quien administra a la persona: la pantalla decide si pintarlo.
 */
export function AccesoDePersona({
  persona,
  usuarios,
  accion,
  variante = "fantasma",
}: {
  persona: { id: string; name: string; ownerId: string; compartidaCon: string[] };
  /** Con quién se puede compartir o a quién transferir: ya acotados por país en el servidor. */
  usuarios: UsuarioElegible[];
  accion: (previo: ResultadoDeContacto | null, form: FormData) => Promise<ResultadoDeContacto>;
  variante?: "primario" | "secundario" | "fantasma";
}) {
  const [abierto, setAbierto] = useState(false);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoDeContacto | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito("Acceso actualizado");
      return r;
    },
    null,
  );

  const idFormulario = `acceso-${persona.id}`;
  const compartidas = new Set(persona.compartidaCon);
  // El propietario no se comparte consigo mismo. Si se transfiere, quien la
  // entrega deja de verla; para que siga consultándola, se comparte después.
  const conQuien = usuarios.filter((u) => u.id !== persona.ownerId);

  return (
    <>
      <Boton variante={variante} onClick={() => setAbierto(true)} title="Compartir o transferir">
        Compartir
      </Boton>

      <Panel
        titulo={`Quién ve a ${persona.name}`}
        subtitulo="El propietario edita, comparte y transfiere. Compartir da solo lectura."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              Quien tenga una oportunidad en esta cuenta la ve de todos modos, sin necesidad de
              compartirla.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idFormulario} disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
          <input type="hidden" name="personId" value={persona.id} />

          <Campo
            etiqueta="Propietario"
            htmlFor={`${idFormulario}-ownerId`}
            problema={problemaDe(resultado, "ownerId")}
            ayuda="Cambiarlo transfiere el contacto: quien lo entrega deja de administrarlo y de verlo, salvo que tenga una oportunidad en la cuenta o se lo compartan."
          >
            <Seleccion
              id={`${idFormulario}-ownerId`}
              name="ownerId"
              defaultValue={persona.ownerId}
              problema={problemaDe(resultado, "ownerId")}
            >
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-texto-titulo">Compartir con</legend>
            {conQuien.length === 0 ? (
              <p className="text-sm text-texto-tenue">No hay nadie más con quien compartirla.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {conQuien.map((u) => (
                  <Casilla
                    key={u.id}
                    name="compartirCon"
                    value={u.id}
                    etiqueta={u.name}
                    defaultChecked={compartidas.has(u.id)}
                  />
                ))}
              </div>
            )}
            {problemaDe(resultado, "compartirCon") ? (
              <p className="text-xs text-coral">{problemaDe(resultado, "compartirCon")}</p>
            ) : null}
          </fieldset>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
