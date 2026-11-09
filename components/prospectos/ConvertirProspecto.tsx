"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useReducer, useState, useTransition } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { ETIQUETA_TIPO_DE_NEGOCIO } from "@/lib/etiquetas";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Autocompletado, type Eleccion, type Sugerencia } from "@/components/ui/Autocompletado";
import { AvisosDeAccion, Campo, Entrada, Panel, Seleccion, useEnvioQueConserva, useProblemas, useResultadoVivo } from "@/components/ui/formulario";
import { estadoInicialDeConversion, reducirConversion, type Coincidencias, type Prellenado } from "./estadoDeConversion";

export type PipelineDeConversion = { id: string; name: string; stages: { id: string; name: string; position: number; requisitos: number }[] };

type Resultado = ResultadoAccion<{ opportunityId: string; folio: string; cuentaReutilizada: boolean; personaReutilizada: boolean }>;

const TIPOS = ["NUEVO", "EXPANSION", "RENOVACION"] as const;
const TIPOS_DE_CUENTA = [
  { valor: "PROSPECTO", etiqueta: "Prospecto" },
  { valor: "CLIENTE", etiqueta: "Cliente" },
  { valor: "PARTNER", etiqueta: "Partner" },
  { valor: "FABRICANTE", etiqueta: "Fabricante" },
  { valor: "PROVEEDOR", etiqueta: "Proveedor" },
];
const NUEVO_CONTACTO = "__nuevo__";

function anotacionDe(e: Eleccion) {
  return e.tipo === "EXISTENTE" ? "existente" : e.tipo === "NUEVA" ? "nueva" : null;
}

/**
 * Convertir a oportunidad · decisiones §59. Tres bloques en un envío: la
 * cuenta, el contacto y la oportunidad. Los dos primeros arrancan con lo que
 * el servidor encontró (`coincidencias`): la cuenta homónima y la persona con
 * el correo del prospecto ya elegidas, o nuevas con sus datos prellenados y lo
 * que falte lo completa quien convierte. Cambiar de cuenta reinicia al
 * contacto; el reductor es puro y está probado aparte. Al terminar, se va a
 * la oportunidad.
 */
export function ConvertirProspecto({
  leadId,
  nombreSugerido,
  prellenado,
  coincidencias,
  rolesDeComite,
  pipelines,
  propietarios,
  propietarioInicial,
  puedeElegirPropietario,
  abiertoInicial = false,
  buscarOrganizaciones,
  cargarPersonas,
  accion,
}: {
  leadId: string;
  nombreSugerido: string;
  prellenado: Prellenado;
  coincidencias: Coincidencias;
  rolesDeComite: { id: string; name: string }[];
  pipelines: PipelineDeConversion[];
  propietarios: { id: string; name: string }[];
  propietarioInicial: string | null;
  puedeElegirPropietario: boolean;
  abiertoInicial?: boolean;
  buscarOrganizaciones: (texto: string) => Promise<Sugerencia[]>;
  cargarPersonas: (organizationId: string) => Promise<Sugerencia[]>;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // Abrir desde la URL (`accion=convertir`) espera un tick: los efectos de los
  // hijos corren antes que los del padre, y si este panel llamara a showModal()
  // antes que el popup del prospecto, el top layer lo dejaría debajo de él.
  useEffect(() => {
    if (!abiertoInicial) return;
    const t = setTimeout(() => setAbierto(true), 0);
    return () => clearTimeout(t);
  }, [abiertoInicial]);
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const [estado, despachar] = useReducer(reducirConversion, coincidencias, (c) => estadoInicialDeConversion(prellenado, c));
  const [cargandoContactos, iniciarCarga] = useTransition();
  const idFormulario = useId();
  const campo = (nombre: string) => `${idFormulario}-${nombre}`;

  const [resultadoCrudo, enviar, enviando] = useActionState(async (previo: Resultado | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    setAbierto(false);
    avisar.exito(
      `Oportunidad ${r.datos.folio} creada`,
      `${r.datos.cuentaReutilizada ? "Cuenta existente" : "Cuenta nueva"} · ${r.datos.personaReutilizada ? "contacto existente" : "contacto nuevo"}`,
    );
    router.push(`/oportunidades/${r.datos.opportunityId}`);
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  const problemas = useProblemas(resultado);
  const alEnviar = useEnvioQueConserva(enviar);
  const compuerta = resultado && !resultado.ok && resultado.motivo === "COMPUERTA" ? resultado.problemas : [];

  const cuentaExiste = estado.cuenta.tipo === "EXISTENTE";
  const cuentaId = estado.cuenta.tipo === "EXISTENTE" ? estado.cuenta.id : "";
  const cuentaNombre = estado.cuenta.tipo === "VACIA" ? "" : estado.cuenta.nombre;
  const personaEsNueva = estado.persona.tipo === "NUEVA";

  function elegirCuenta(eleccion: Eleccion) {
    despachar({ tipo: "ELEGIR_CUENTA", eleccion });
    problemas.corregir("organizacionNombre");
    if (eleccion.tipo !== "EXISTENTE") return;
    // Etiquetada con la cuenta que la pidió: el reductor descarta la lista si ya se eligió otra.
    iniciarCarga(async () => {
      const lista = await cargarPersonas(eleccion.id);
      despachar({ tipo: "RECIBIR_CONTACTOS", de: eleccion.id, lista });
    });
  }

  function elegirPersona(valor: string) {
    if (valor === NUEVO_CONTACTO) return despachar({ tipo: "ELEGIR_PERSONA", eleccion: { tipo: "NUEVA", nombre: prellenado.contactName } });
    const contacto = estado.contactos?.find((c) => c.id === valor);
    if (contacto) despachar({ tipo: "ELEGIR_PERSONA", eleccion: { tipo: "EXISTENTE", id: contacto.id, nombre: contacto.nombre } });
  }

  function cerrar() {
    problemas.reiniciar();
    setAbierto(false);
  }

  return (
    <>
      <Boton variante="exito" onClick={() => setAbierto(true)} className="w-full justify-center" disabled={pipelines.length === 0}>
        Convertir a oportunidad
      </Boton>
      <Panel
        titulo="Convertir a oportunidad"
        subtitulo={prellenado.companyName}
        abierto={abierto}
        alCerrar={cerrar}
        ancho="lg"
        pie={
          <div className="ml-auto flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton variante="exito" type="submit" form={idFormulario} disabled={enviando}>
              {enviando ? "Convirtiendo…" : "Convertir"}
            </Boton>
          </div>
        }
      >
        <form id={idFormulario} onSubmit={alEnviar} onChange={problemas.alCambiar} className="flex flex-col gap-6">
          <input type="hidden" name="leadId" value={leadId} />
          {!puedeElegirPropietario && propietarioInicial && <input type="hidden" name="ownerId" value={propietarioInicial} />}
          {/* Lo que el autocompletado y el desplegable resolvieron, para que viaje en el FormData. */}
          <input type="hidden" name="organizationId" value={cuentaId} />
          <input type="hidden" name="organizacionNombre" value={cuentaNombre} />
          <input type="hidden" name="primaryPersonId" value={estado.persona.tipo === "EXISTENTE" ? estado.persona.id : ""} />

          <Bloque titulo="Cuenta">
            <Campo etiqueta="Empresa" htmlFor={campo("organizacion")} anotacion={anotacionDe(estado.cuenta)} tonoAnotacion={cuentaExiste ? "exito" : "acento"} problema={problemas.problema("organizacionNombre")}>
              <Autocompletado
                id={campo("organizacion")}
                placeholder="Nombre de la empresa"
                buscar={buscarOrganizaciones}
                alElegir={elegirCuenta}
                etiquetaCrear="Crear cuenta"
                problema={problemas.problema("organizacionNombre")}
                textoInicial={cuentaNombre || undefined}
              />
            </Campo>
            {!cuentaExiste && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Campo etiqueta="Tipo" htmlFor={campo("organizacionTipo")}>
                  <Seleccion id={campo("organizacionTipo")} name="organizacionTipo" defaultValue="PROSPECTO">
                    {TIPOS_DE_CUENTA.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
                <Campo etiqueta="Giro" htmlFor={campo("organizacionGiro")}>
                  <Entrada id={campo("organizacionGiro")} name="organizacionGiro" defaultValue={prellenado.companyIndustry ?? ""} autoComplete="off" />
                </Campo>
                <Campo etiqueta="Ciudad" htmlFor={campo("organizacionCiudad")}>
                  <Entrada id={campo("organizacionCiudad")} name="organizacionCiudad" autoComplete="off" />
                </Campo>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Contacto">
            <Campo etiqueta="Persona principal" htmlFor={campo("persona")} anotacion={anotacionDe(estado.persona)} tonoAnotacion={personaEsNueva ? "acento" : "exito"} problema={problemas.problema("persona")}>
              {cuentaExiste ? (
                <Seleccion
                  id={campo("persona")}
                  value={estado.persona.tipo === "EXISTENTE" ? estado.persona.id : NUEVO_CONTACTO}
                  onChange={(e) => elegirPersona(e.target.value)}
                  disabled={estado.contactos === null}
                  aria-busy={cargandoContactos}
                  problema={problemas.problema("persona")}
                >
                  {estado.contactos === null ? (
                    <option value={NUEVO_CONTACTO}>Cargando contactos…</option>
                  ) : (
                    <>
                      {estado.contactos.length > 0 && (
                        <optgroup label={`Contactos de ${cuentaNombre}`}>
                          {estado.contactos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.detalle ? `${c.nombre} · ${c.detalle}` : c.nombre}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <option value={NUEVO_CONTACTO}>Nuevo contacto: {prellenado.contactName}</option>
                    </>
                  )}
                </Seleccion>
              ) : (
                <Entrada id={campo("persona")} value={prellenado.contactName} readOnly className="text-texto-tenue" />
              )}
            </Campo>
            {personaEsNueva && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Campo etiqueta="Nombre" htmlFor={campo("personaNombre")} problema={problemas.problema("personaNombre")}>
                  <Entrada id={campo("personaNombre")} name="personaNombre" defaultValue={prellenado.contactName} autoComplete="off" problema={problemas.problema("personaNombre")} />
                </Campo>
                <Campo etiqueta="Cargo" htmlFor={campo("personaCargo")}>
                  <Entrada id={campo("personaCargo")} name="personaCargo" defaultValue={prellenado.jobTitle ?? ""} autoComplete="off" />
                </Campo>
                <Campo etiqueta="Correo" htmlFor={campo("personaCorreo")} problema={problemas.problema("personaCorreo")}>
                  <Entrada id={campo("personaCorreo")} name="personaCorreo" type="email" defaultValue={prellenado.email ?? ""} autoComplete="off" problema={problemas.problema("personaCorreo")} />
                </Campo>
                <Campo etiqueta="Teléfono" htmlFor={campo("personaTelefono")}>
                  <Entrada id={campo("personaTelefono")} name="personaTelefono" defaultValue={prellenado.phone ?? ""} autoComplete="off" />
                </Campo>
                <Campo etiqueta="Rol en el comité" htmlFor={campo("personaRolComiteId")} problema={problemas.problema("personaRolComiteId")}>
                  <Seleccion id={campo("personaRolComiteId")} name="personaRolComiteId" defaultValue="">
                    <option value="">Sin rol declarado</option>
                    {rolesDeComite.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Oportunidad">
            <Campo etiqueta="Nombre de la oportunidad" htmlFor={campo("name")} problema={problemas.problema("name")}>
              <Entrada id={campo("name")} name="name" defaultValue={nombreSugerido} autoComplete="off" problema={problemas.problema("name")} />
            </Campo>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Campo etiqueta="Pipeline" htmlFor={campo("pipelineId")} problema={problemas.problema("pipelineId")}>
                <Seleccion id={campo("pipelineId")} name="pipelineId" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} problema={problemas.problema("pipelineId")}>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <Campo etiqueta="Etapa de entrada" htmlFor={campo("stageId")} problema={problemas.problema("stageId")}>
                <Seleccion key={pipelineId} id={campo("stageId")} name="stageId" defaultValue={pipeline?.stages[0]?.id ?? ""}>
                  {(pipeline?.stages ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.requisitos > 0 ? ` · ${e.requisitos} ${e.requisitos === 1 ? "requisito" : "requisitos"}` : ""}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              <Campo etiqueta="Importe estimado" htmlFor={campo("estimatedAmount")} problema={problemas.problema("estimatedAmount")}>
                <Entrada id={campo("estimatedAmount")} name="estimatedAmount" inputMode="decimal" placeholder="250000" className="tabular" problema={problemas.problema("estimatedAmount")} />
              </Campo>
              <Campo etiqueta="Cierre estimado" htmlFor={campo("expectedCloseDate")} problema={problemas.problema("expectedCloseDate")}>
                <Entrada id={campo("expectedCloseDate")} name="expectedCloseDate" type="date" className="tabular" problema={problemas.problema("expectedCloseDate")} />
              </Campo>
              <Campo etiqueta="Tipo de negocio" htmlFor={campo("businessType")} problema={problemas.problema("businessType")}>
                <Seleccion id={campo("businessType")} name="businessType" defaultValue="NUEVO">
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO_DE_NEGOCIO[t]}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
              {puedeElegirPropietario && (
                <Campo etiqueta="Propietario" htmlFor={campo("ownerId")} problema={problemas.problema("ownerId")}>
                  <Seleccion id={campo("ownerId")} name="ownerId" defaultValue={propietarioInicial ?? ""} problema={problemas.problema("ownerId")}>
                    {propietarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Seleccion>
                </Campo>
              )}
            </div>
          </Bloque>

          {compuerta.length > 0 && (
            <ul role="alert" className="rounded-sm border border-peligro bg-coral/[0.06] px-3.5 py-2.5 text-sm text-texto-cuerpo">
              {compuerta.map((p) => (
                <li key={p.mensaje}>{p.mensaje}</li>
              ))}
            </ul>
          )}
          <AvisosDeAccion resultado={compuerta.length > 0 ? null : resultado} />
        </form>
      </Panel>
    </>
  );
}

/** Cada uno de los tres bloques del panel: un título corto y sus campos. */
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-borde pt-4 first:border-t-0 first:pt-0">
      <legend className="eyebrow float-left mb-3 text-navy-400">{titulo}</legend>
      {children}
    </fieldset>
  );
}
