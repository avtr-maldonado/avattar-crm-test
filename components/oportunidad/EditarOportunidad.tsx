"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
} from "@/components/ui/formulario";

const TIPOS_DE_NEGOCIO = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "EXPANSION", etiqueta: "Expansión" },
  { valor: "RENOVACION", etiqueta: "Renovación" },
];

const CATEGORIAS = [
  { valor: "PIPELINE", etiqueta: "Pipeline" },
  { valor: "MEJOR_CASO", etiqueta: "Mejor caso" },
  { valor: "COMPROMISO", etiqueta: "Compromiso" },
  { valor: "OMITIDA", etiqueta: "Omitida" },
];

export type DatosEditables = {
  id: string;
  name: string;
  primaryPersonId: string | null;
  estimatedAmount: string;
  expectedCloseDate: string;
  businessType: string;
  forecastCategory: string;
  sourceId: string | null;
  ownerId: string;
  /** INV-06 · con cotización congelada el importe deja de ser editable. */
  tieneCotizacionCongelada: boolean;
  meddicScore: number | null;
};

/**
 * Editar los datos comerciales de la oportunidad · P-02.
 *
 * ## Qué NO está aquí
 *
 * La organización y el pipeline. Cambiar de organización cambia el país, y con
 * él la política comercial, el alcance y a quién se le puede asignar: eso no es
 * una edición, es otra oportunidad. Cambiar de pipeline invalidaría la etapa y
 * todo el historial de transiciones.
 *
 * La etapa tampoco: se mueve desde la barra de arriba, que evalúa `RN-02`.
 * Tenerla también aquí sería dos caminos para lo mismo, uno de ellos sin
 * compuertas a la vista.
 */
export function EditarOportunidad({
  datos,
  personas,
  origenes,
  propietarios,
  puedeReasignar,
  minimoParaCompromiso,
  accion,
}: {
  datos: DatosEditables;
  personas: { id: string; name: string; jobTitle: string | null }[];
  origenes: { id: string; name: string }[];
  propietarios: { id: string; name: string }[];
  puedeReasignar: boolean;
  minimoParaCompromiso: number;
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);

  /** El aviso va en el flujo de la acción: una vez por envío, sin efecto. */
  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoAccion | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito("Oportunidad actualizada");
      return r;
    },
    null,
  );

  // RN-29 · si no llega al mínimo, «Compromiso» se ofrece deshabilitado y con
  // su razón. Ocultarlo dejaría a quien lo busca sin saber por qué no está.
  const alcanzaCompromiso = (datos.meddicScore ?? 0) >= minimoParaCompromiso;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar
      </Boton>

      <Panel
        titulo="Editar oportunidad"
        subtitulo="La organización, el pipeline y la etapa no se editan aquí. La etapa se mueve desde la barra."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue" />
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="editar-oportunidad" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="editar-oportunidad" action={enviar} className="flex flex-col gap-5">
          <input type="hidden" name="opportunityId" value={datos.id} />

          <Campo
            etiqueta="Nombre de la oportunidad"
            htmlFor="name"
            problema={problemaDe(resultado, "name")}
          >
            <Entrada
              id="name"
              name="name"
              defaultValue={datos.name}
              placeholder="Servicio o proyecto que se va a vender"
              problema={problemaDe(resultado, "name")}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Persona principal" htmlFor="primaryPersonId">
              <Seleccion
                id="primaryPersonId"
                name="primaryPersonId"
                defaultValue={datos.primaryPersonId ?? ""}
              >
                <option value="">Sin especificar</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.jobTitle ? `${p.name} · ${p.jobTitle}` : p.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Campo
              etiqueta="Valor estimado"
              htmlFor="estimatedAmount"
              anotacion={datos.tieneCotizacionCongelada ? "manda la cotización" : undefined}
              ayuda={
                datos.tieneCotizacionCongelada
                  ? "Hay una cotización congelada: el importe vigente sale de ella (INV-06)."
                  : undefined
              }
              problema={problemaDe(resultado, "estimatedAmount")}
            >
              <Entrada
                id="estimatedAmount"
                name="estimatedAmount"
                inputMode="decimal"
                defaultValue={datos.estimatedAmount}
                disabled={datos.tieneCotizacionCongelada}
                placeholder="Monto sin símbolo"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "estimatedAmount")}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta="Cierre estimado"
              htmlFor="expectedCloseDate"
              problema={problemaDe(resultado, "expectedCloseDate")}
            >
              <Entrada
                id="expectedCloseDate"
                name="expectedCloseDate"
                type="date"
                defaultValue={datos.expectedCloseDate}
                problema={problemaDe(resultado, "expectedCloseDate")}
              />
            </Campo>

            <Campo etiqueta="Tipo de negocio" htmlFor="businessType">
              <Seleccion id="businessType" name="businessType" defaultValue={datos.businessType}>
                {TIPOS_DE_NEGOCIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Origen" htmlFor="sourceId">
              <Seleccion id="sourceId" name="sourceId" defaultValue={datos.sourceId ?? ""}>
                <option value="">Sin especificar</option>
                {origenes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Campo
              etiqueta="Categoría de pronóstico"
              htmlFor="forecastCategory"
              problema={problemaDe(resultado, "forecastCategory")}
              ayuda={
                alcanzaCompromiso
                  ? undefined
                  : `«Compromiso» exige puntaje MEDDIC de ${minimoParaCompromiso}; esta tiene ${datos.meddicScore ?? 0}.`
              }
            >
              <Seleccion
                id="forecastCategory"
                name="forecastCategory"
                defaultValue={datos.forecastCategory}
                problema={problemaDe(resultado, "forecastCategory")}
              >
                {CATEGORIAS.map((c) => (
                  <option
                    key={c.valor}
                    value={c.valor}
                    disabled={c.valor === "COMPROMISO" && !alcanzaCompromiso}
                  >
                    {c.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          {puedeReasignar && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Campo
                etiqueta="Propietario"
                htmlFor="ownerId"
                problema={problemaDe(resultado, "ownerId")}
                ayuda="Cambiarlo transfiere el acceso y queda en la bitácora (RN-31)."
              >
                <Seleccion id="ownerId" name="ownerId" defaultValue={datos.ownerId}>
                  {propietarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
            </div>
          )}

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
