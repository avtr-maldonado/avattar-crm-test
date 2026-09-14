"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";

/** Alta y edición comparten formulario, así que comparten tipo de resultado. */
type ResultadoDeContacto = ResultadoAccion<{ id: string } | null>;
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Autocompletado, type Sugerencia } from "@/components/ui/Autocompletado";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Entrada, Panel, Seleccion } from "@/components/ui/formulario";

export type PersonaDelFormulario = {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  committeeRoleId: string | null;
};

/** Una cuenta que se puede elegir al dar de alta desde P-03. */
export type CuentaElegible = { id: string; name: string; detalle?: string | null };

/**
 * Alta y edición de un contacto · `Q-15`.
 *
 * El mismo formulario sirve para las dos: los campos son idénticos y lo único
 * que cambia es si se envía un `personId`. Dos componentes casi iguales se
 * separan con el tiempo, y el que menos se usa se queda atrás.
 *
 * ## La empresa: fija o elegida
 *
 * Desde la ficha de cuenta y el detalle de oportunidad la empresa ya se sabe y
 * llega como `organizationId`. Desde la pestaña Personas de P-03 no hay
 * contexto, así que se elige en el formulario entre las cuentas que la sesión
 * alcanza (`organizaciones`): agregar gente exige alcanzar la cuenta (Q-15). El
 * filtro se hace en el cliente sobre la lista que la pantalla ya cargó para la
 * otra pestaña; no hay consulta nueva. No se ofrece crear la empresa desde
 * aquí: para eso está «Nueva cuenta» en Organizaciones.
 *
 * ## Lo que no está aquí
 *
 * **Las iniciales**, que se derivan del nombre en el servidor. Y **el cambio de
 * empresa** al editar: mover a alguien de compañía cambiaría en silencio quién
 * puede verlo, y casi siempre no es la misma persona en otra empresa sino una
 * persona nueva.
 */
export function EditarPersona({
  persona,
  organizationId,
  organizaciones,
  rolesDeComite,
  accion,
  etiquetaBoton,
  variante = "secundario",
}: {
  /** Sin persona, el formulario da de alta. */
  persona?: PersonaDelFormulario;
  /** Al dar de alta con la empresa ya sabida: la cuenta a la que se agrega. */
  organizationId?: string;
  /** Al dar de alta sin empresa sabida: las cuentas entre las que elegir. */
  organizaciones?: CuentaElegible[];
  rolesDeComite: { id: string; name: string }[];
  accion: (previo: ResultadoDeContacto | null, form: FormData) => Promise<ResultadoDeContacto>;
  etiquetaBoton?: string;
  variante?: "primario" | "secundario" | "fantasma";
}) {
  const [abierto, setAbierto] = useState(false);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const esAlta = persona === undefined;
  const eligeEmpresa = esAlta && organizationId === undefined;

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoDeContacto | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      setCuentaElegida(null);
      avisar.exito(esAlta ? "Contacto agregado" : "Contacto actualizado");
      return r;
    },
    null,
  );

  const idFormulario = `persona-${persona?.id ?? organizationId ?? "nueva"}`;

  // Búsqueda local: la lista ya está en la pantalla, no hay a qué viajar.
  const buscarCuenta = async (texto: string): Promise<Sugerencia[]> => {
    const t = texto.trim().toLowerCase();
    return (organizaciones ?? [])
      .filter((o) => o.name.toLowerCase().includes(t))
      .slice(0, 8)
      .map((o) => ({ id: o.id, nombre: o.name, detalle: o.detalle }));
  };

  return (
    <>
      <Boton variante={variante} onClick={() => setAbierto(true)}>
        {etiquetaBoton ?? (esAlta ? "Agregar contacto" : "Editar")}
      </Boton>

      <Panel
        titulo={esAlta ? "Agregar contacto" : "Editar contacto"}
        subtitulo={
          esAlta
            ? "Datos de contacto profesional de un representante de la empresa."
            : persona?.name
        }
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              El rol en el comité es lo que convierte una lista de nombres en un mapa de quién
              decide.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idFormulario} disabled={enviando}>
                {enviando ? "Guardando…" : esAlta ? "Agregar" : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
          {persona ? (
            <input type="hidden" name="personId" value={persona.id} />
          ) : (
            <input type="hidden" name="organizationId" value={organizationId ?? cuentaElegida ?? ""} />
          )}

          {eligeEmpresa && (
            <Campo
              etiqueta="Empresa"
              htmlFor={`${idFormulario}-organizationId`}
              problema={problemaDe(resultado, "organizationId")}
              ayuda="Solo las cuentas que alcanzas. Si la empresa no existe, créala primero en Organizaciones."
            >
              <Autocompletado
                id={`${idFormulario}-organizationId`}
                placeholder="Busca la cuenta por nombre"
                buscar={buscarCuenta}
                alElegir={(e) => setCuentaElegida(e.tipo === "EXISTENTE" ? e.id : null)}
                permitirNueva={false}
                problema={problemaDe(resultado, "organizationId")}
              />
            </Campo>
          )}

          <Campo etiqueta="Nombre" htmlFor={`${idFormulario}-name`} problema={problemaDe(resultado, "name")}>
            <Entrada
              id={`${idFormulario}-name`}
              name="name"
              defaultValue={persona?.name}
              placeholder="Nombre y apellidos"
              problema={problemaDe(resultado, "name")}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Cargo" htmlFor={`${idFormulario}-jobTitle`}>
              <Entrada
                id={`${idFormulario}-jobTitle`}
                name="jobTitle"
                defaultValue={persona?.jobTitle ?? ""}
                placeholder="Puesto en la empresa"
              />
            </Campo>

            <Campo
              etiqueta="Rol en el comité"
              htmlFor={`${idFormulario}-committeeRoleId`}
              ayuda="Declararlo satisface el requisito de entrada a Descubrimiento."
            >
              <Seleccion
                id={`${idFormulario}-committeeRoleId`}
                name="committeeRoleId"
                defaultValue={persona?.committeeRoleId ?? ""}
              >
                <option value="">Sin declarar</option>
                {rolesDeComite.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta="Correo"
              htmlFor={`${idFormulario}-email`}
              problema={problemaDe(resultado, "email")}
            >
              <Entrada
                id={`${idFormulario}-email`}
                name="email"
                type="email"
                defaultValue={persona?.email ?? ""}
                placeholder="Correo corporativo"
                problema={problemaDe(resultado, "email")}
              />
            </Campo>

            <Campo etiqueta="Teléfono" htmlFor={`${idFormulario}-phone`}>
              <Entrada
                id={`${idFormulario}-phone`}
                name="phone"
                defaultValue={persona?.phone ?? ""}
                placeholder="Con lada"
              />
            </Campo>
          </div>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
