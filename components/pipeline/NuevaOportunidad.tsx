"use client";

import { useActionState, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Entrada, Panel } from "@/components/ui/formulario";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import type { Eleccion, Sugerencia } from "@/components/ui/Autocompletado";
import { CamposDeContacto } from "./CamposDeContacto";
import { CamposComerciales } from "./CamposComerciales";
import type { EtapaElegible } from "./SelectorDeEtapa";
import { ESTADO_INICIAL, nombreEsSugerido, prefijoDe, reducir } from "./estadoDeAlta";

export type PipelineElegible = {
  id: string;
  name: string;
  countryCode: string;
  stages: EtapaElegible[];
};

type Resultado = ResultadoAccion<{ id: string; folio: string; gateOverride: boolean }>;

function primeraEtapaDe(pipeline: PipelineElegible | undefined): string {
  return pipeline?.stages[0]?.id ?? "";
}

/**
 * P-01 · alta de oportunidad.
 *
 * ## Las anotaciones a la derecha de cada campo
 *
 * `existente` · `nueva` · `sugerido` · `T4 2026`. Cada una dice **qué hizo el
 * sistema con lo que se acaba de escribir**, y es lo que evita el error caro de
 * esta pantalla: crear una organización duplicada sin darse cuenta. Los
 * duplicados de organización no se limpian nunca.
 *
 * El estado acoplado —organización, persona y nombre— vive en `estadoDeAlta`,
 * que es puro y está probado aparte: la regla de «el prefijo se corrige sin
 * borrar lo que escribiste» es lo más sutil del formulario, y merece prueba
 * propia en vez de una verificación a ojo en el navegador.
 */
export function NuevaOportunidad({
  pipelines,
  origenes,
  rolesDeComite,
  propietarios,
  usuarioActual,
  puedeAsignar,
  buscarOrganizaciones,
  buscarPersonas,
  accion,
}: {
  pipelines: PipelineElegible[];
  origenes: { id: string; name: string }[];
  rolesDeComite: { id: string; name: string }[];
  propietarios: { id: string; name: string }[];
  usuarioActual: { id: string; name: string };
  puedeAsignar: boolean;
  buscarOrganizaciones: (texto: string) => Promise<Sugerencia[]>;
  buscarPersonas: (organizationId: string, texto: string) => Promise<Sugerencia[]>;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resultado, enviar, enviando] = useActionState(accion, null);
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL);
  const yaAtendido = useRef<Resultado | null>(null);

  const [pipelineId, setPipelineId] = useState(() => pipelines[0]?.id ?? "");
  const [stageId, setStageId] = useState(() => primeraEtapaDe(pipelines[0]));
  const [cierre, setCierre] = useState("");

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const etapas = pipeline?.stages ?? [];
  const etapaElegida = etapas.find((e) => e.id === stageId);
  const prefijo = prefijoDe(estado.organizacion);

  /**
   * Solo una compuerta en ADVERTENCIA se puede omitir. Ofrecer el botón sobre
   * una BLOQUEANTE sería prometer algo que el servidor va a rechazar: se
   * pulsaría, se vería el mismo error, y nada diría que ese camino no existe.
   */
  const puedeOmitir =
    resultado != null &&
    !resultado.ok &&
    resultado.motivo === "COMPUERTA" &&
    etapaElegida?.gateMode === "ADVERTENCIA";

  const buscarPersonasDeEsta = useCallback(
    async (texto: string) =>
      estado.organizacion.tipo === "EXISTENTE"
        ? buscarPersonas(estado.organizacion.id, texto)
        : [],
    [estado.organizacion, buscarPersonas],
  );

  function cambiarPipeline(id: string) {
    setPipelineId(id);
    setStageId(primeraEtapaDe(pipelines.find((p) => p.id === id)));
  }

  /**
   * Lo que pasa cuando la acción responde.
   *
   * Los problemas de campo, compuerta y confirmación **no** se avisan aquí: ya
   * se pintan dentro del formulario, que es donde se corrigen (§13.5). Solo
   * salen en aviso los que no tienen nada que corregir en pantalla —no puedes,
   * o algo cambió—, y eso lo decide `avisarSiCorresponde` en un solo lugar para
   * que ningún problema se muestre dos veces.
   */
  useEffect(() => {
    if (!resultado || yaAtendido.current === resultado) return;
    yaAtendido.current = resultado;

    if (!resultado.ok) {
      avisarSiCorresponde(resultado);
      return;
    }

    avisar.exito("Oportunidad creada", resultado.datos.folio);

    // §8.3 · avanzar pese a una compuerta queda registrado y alimenta el reporte
    // semanal de incumplimiento. Enterarse por ese reporte, una semana después,
    // es enterarse tarde.
    if (resultado.datos.gateOverride) {
      avisar.advertencia(
        "Nació sin cumplir los requisitos de la etapa",
        "Queda registrado en su historial y en el reporte semanal de incumplimiento.",
      );
    }

    // Sin `setAbierto(false)`: navegar desmonta este componente y el modal se
    // va con él. Cerrarlo antes solo provocaría un render de más.
    router.push(`/oportunidades/${resultado.datos.id}`);
  }, [resultado, router]);

  function limpiar() {
    despachar({ tipo: "LIMPIAR" });
    setCierre("");
    setAbierto(false);
  }

  const nombreDeOrganizacion =
    estado.organizacion.tipo === "VACIA" ? "" : estado.organizacion.nombre;

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Nueva oportunidad</Boton>

      <Panel
        titulo="Nueva oportunidad"
        subtitulo={
          <>
            Folio{" "}
            <span className="[font-variant-numeric:tabular-nums]">
              OPP-{new Date().getFullYear()}-·····
            </span>{" "}
            se asigna al crear · pipeline {pipeline?.name ?? "—"} · USD
          </>
        }
        abierto={abierto}
        alCerrar={limpiar}
        ancho="lg"
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue">
              La organización y la persona se crean aquí mismo, en la misma operación. Las líneas
              de producto llegan con el cotizador.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={limpiar}>
                Cancelar
              </Boton>
              {puedeOmitir && (
                <Boton
                  variante="secundario"
                  type="submit"
                  form="alta-oportunidad"
                  name="omitirCompuerta"
                  value="true"
                >
                  Crear de todos modos
                </Boton>
              )}
              <Boton type="submit" form="alta-oportunidad" disabled={enviando}>
                {enviando ? "Creando…" : "Crear oportunidad"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="alta-oportunidad" action={enviar} className="flex flex-col gap-5">
          {/* Lo que el autocompletado resolvió, para que viaje en el FormData. */}
          <input
            type="hidden"
            name="organizationId"
            value={estado.organizacion.tipo === "EXISTENTE" ? estado.organizacion.id : ""}
          />
          <input type="hidden" name="organizacionNombre" value={nombreDeOrganizacion} />
          <input
            type="hidden"
            name="primaryPersonId"
            value={estado.persona.tipo === "EXISTENTE" ? estado.persona.id : ""}
          />
          <input
            type="hidden"
            name="personaNombre"
            value={estado.persona.tipo === "NUEVA" ? estado.persona.nombre : ""}
          />

          <CamposDeContacto
            organizacion={estado.organizacion}
            persona={estado.persona}
            rolesDeComite={rolesDeComite}
            resultado={resultado}
            buscarOrganizaciones={buscarOrganizaciones}
            buscarPersonas={buscarPersonasDeEsta}
            alElegirOrganizacion={(eleccion: Eleccion) =>
              despachar({ tipo: "ELEGIR_ORGANIZACION", eleccion })
            }
            alElegirPersona={(eleccion: Eleccion) => despachar({ tipo: "ELEGIR_PERSONA", eleccion })}
          />

          <Campo
            etiqueta="Nombre de la oportunidad"
            htmlFor="name"
            anotacion={nombreEsSugerido(estado) && prefijo ? "sugerido" : null}
            problema={problemaDe(resultado, "name")}
            ayuda={
              prefijo
                ? "Completa con el servicio: «Servicios administrados», «Migración ERP»."
                : undefined
            }
          >
            <Entrada
              id="name"
              name="name"
              value={estado.nombre}
              onChange={(e) => despachar({ tipo: "ESCRIBIR_NOMBRE", nombre: e.target.value })}
              placeholder="Servicio o proyecto que se va a vender"
              problema={problemaDe(resultado, "name")}
            />
          </Campo>

          <CamposComerciales
            pipelines={pipelines}
            pipelineId={pipelineId}
            etapas={etapas}
            stageId={stageId}
            cierre={cierre}
            origenes={origenes}
            propietarios={propietarios}
            usuarioActual={usuarioActual}
            puedeAsignar={puedeAsignar}
            resultado={resultado}
            alCambiarPipeline={cambiarPipeline}
            alCambiarEtapa={setStageId}
            alCambiarCierre={setCierre}
          />

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
