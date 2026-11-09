"use client";

import { useActionState, useId, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import type { CountryCode } from "@/lib/dto";
import { NOMBRE_PAIS } from "@/lib/etiquetas";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AreaDeTexto,
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
  useProblemas,
  useResultadoVivo,
} from "@/components/ui/formulario";

export type CatalogosDeAlta = {
  canales: { id: string; name: string }[];
  campanas: { id: string; name: string; channelId: string | null }[];
  /** Los vendedores del país por omisión; la acción vuelve a validar por país. */
  vendedores: { id: string; name: string }[];
};

type Resultado = ResultadoAccion<{ id: string; folio: string }>;

/**
 * Alta de un prospecto · decisiones §58. Contacto y empresa a mano, canal y
 * campaña del catálogo, país entre los de la sesión, puntaje y notas, y el
 * vendedor si ya se sabe (con él nace Asignado). Se envía desde `onSubmit`
 * para que un rechazo no borre lo tecleado.
 */
export function NuevoProspecto({
  paises,
  paisInicial,
  catalogos,
  accion,
}: {
  paises: CountryCode[];
  paisInicial: CountryCode;
  catalogos: CatalogosDeAlta;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [canalId, setCanalId] = useState("");

  const [resultadoCrudo, enviar, enviando] = useActionState(async (previo: Resultado | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    setAbierto(false);
    avisar.exito("Prospecto creado", r.datos.folio);
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  const problemas = useProblemas(resultado);
  const alEnviar = useEnvioQueConserva(enviar);
  // Único por instancia: la pantalla pinta esta alta dos veces (barra y estado
  // vacío) y un id repetido manda el botón del pie al formulario equivocado.
  const idFormulario = useId();
  const campo = (nombre: string) => `${idFormulario}-${nombre}`;

  // Las campañas del canal elegido primero; las demás siguen disponibles.
  const campanas = [...catalogos.campanas].sort((a, b) => Number(b.channelId === canalId) - Number(a.channelId === canalId));

  function cerrar() {
    problemas.reiniciar();
    setAbierto(false);
  }

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Nuevo prospecto</Boton>
      <Panel
        titulo="Nuevo prospecto"
        abierto={abierto}
        alCerrar={cerrar}
        ancho="lg"
        pie={
          <div className="ml-auto flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" form={idFormulario} disabled={enviando}>
              {enviando ? "Guardando…" : "Crear prospecto"}
            </Boton>
          </div>
        }
      >
        <form id={idFormulario} onSubmit={alEnviar} onChange={problemas.alCambiar} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Contacto" htmlFor={campo("contactName")} problema={problemas.problema("contactName")}>
              <Entrada id={campo("contactName")} name="contactName" placeholder="Nombre y apellidos" autoComplete="off" problema={problemas.problema("contactName")} />
            </Campo>
            <Campo etiqueta="Cargo" htmlFor={campo("jobTitle")}>
              <Entrada id={campo("jobTitle")} name="jobTitle" placeholder="Gerente de TI" autoComplete="off" />
            </Campo>
            <Campo etiqueta="Correo" htmlFor={campo("email")} problema={problemas.problema("email")}>
              <Entrada id={campo("email")} name="email" type="email" placeholder="nombre@empresa.com" autoComplete="off" problema={problemas.problema("email")} />
            </Campo>
            <Campo etiqueta="Teléfono" htmlFor={campo("phone")}>
              <Entrada id={campo("phone")} name="phone" placeholder="+52 55 0000 0000" autoComplete="off" />
            </Campo>
            <Campo etiqueta="Empresa" htmlFor={campo("companyName")} problema={problemas.problema("companyName")}>
              <Entrada id={campo("companyName")} name="companyName" placeholder="Razón social o nombre comercial" autoComplete="off" problema={problemas.problema("companyName")} />
            </Campo>
            <Campo etiqueta="Giro" htmlFor={campo("companyIndustry")}>
              <Entrada id={campo("companyIndustry")} name="companyIndustry" placeholder="Manufactura, retail…" autoComplete="off" />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Campo etiqueta="País" htmlFor={campo("countryCode")} problema={problemas.problema("countryCode")}>
              <Seleccion id={campo("countryCode")} name="countryCode" defaultValue={paisInicial}>
                {paises.map((p) => (
                  <option key={p} value={p}>
                    {NOMBRE_PAIS[p]}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Canal" htmlFor={campo("channelId")} problema={problemas.problema("channelId")}>
              <Seleccion id={campo("channelId")} name="channelId" value={canalId} onChange={(e) => setCanalId(e.target.value)} problema={problemas.problema("channelId")}>
                <option value="">Elige el canal</option>
                {catalogos.canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
            <Campo etiqueta="Campaña" htmlFor={campo("campaignId")} problema={problemas.problema("campaignId")}>
              <Seleccion id={campo("campaignId")} name="campaignId" defaultValue="">
                <option value="">Sin campaña</option>
                {campanas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Campo etiqueta="Puntaje" htmlFor={campo("score")} problema={problemas.problema("score")}>
              <Entrada id={campo("score")} name="score" type="number" min={0} max={100} placeholder="0–100" className="tabular" problema={problemas.problema("score")} />
            </Campo>
            <Campo etiqueta="Vendedor" htmlFor={campo("assignedToId")} problema={problemas.problema("assignedToId")}>
              <Seleccion id={campo("assignedToId")} name="assignedToId" defaultValue="" problema={problemas.problema("assignedToId")}>
                <option value="">Sin asignar</option>
                {catalogos.vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <Campo etiqueta="Notas" htmlFor={campo("notes")}>
            <AreaDeTexto id={campo("notes")} name="notes" placeholder="Qué pidió, qué le interesa" />
          </Campo>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
