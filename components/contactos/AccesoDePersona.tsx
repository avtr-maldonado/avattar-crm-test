"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import type { Role } from "@/lib/dto";
import { ETIQUETA_ROL } from "@/lib/etiquetas";
import { Boton } from "@/components/ui/primitivas";
import { SelectorDeVarios } from "@/components/ui/SelectorDeVarios";
import { AvisosDeAccion, Campo, Panel, Seleccion } from "@/components/ui/formulario";

type ResultadoDeContacto = ResultadoAccion<{ id: string } | null>;

export type UsuarioElegible = { id: string; name: string; role: Role };

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
  // El propietario no se comparte consigo mismo. Si se transfiere, quien la
  // entrega deja de verla; para que siga consultándola, se comparte después.
  const conQuien = usuarios.filter((u) => u.id !== persona.ownerId);
  const idsElegibles = new Set(conQuien.map((u) => u.id));

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

          <Campo
            etiqueta="Compartir con"
            htmlFor={`${idFormulario}-compartirCon`}
            problema={problemaDe(resultado, "compartirCon")}
            ayuda="Pueden consultarla; no editarla ni volver a compartirla."
          >
            <SelectorDeVarios
              id={`${idFormulario}-compartirCon`}
              name="compartirCon"
              opciones={conQuien.map((u) => ({ id: u.id, nombre: u.name, detalle: ETIQUETA_ROL[u.role] }))}
              iniciales={persona.compartidaCon.filter((id) => idsElegibles.has(id))}
              placeholder="Busca a quien compartirla"
              vacio="No hay nadie más con quien compartirla."
              problema={problemaDe(resultado, "compartirCon")}
            />
          </Campo>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
