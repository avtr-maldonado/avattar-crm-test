"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL, NOMBRE_PAIS } from "@/lib/etiquetas";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Casilla,
  Entrada,
  Panel,
  Seleccion,
  useResultadoVivo,
} from "@/components/ui/formulario";

type ResultadoDeUsuario = ResultadoAccion<{ id: string } | null>;

export type UsuarioDelFormulario = {
  id: string;
  email: string;
  name: string;
  role: Role;
  countryCodes: CountryCode[];
  active: boolean;
  /** Si es quien está editando: no puede quitarse el acceso ni el rol. */
  esYo: boolean;
};

export type PendienteDeAcceso = {
  authUserId: string;
  email: string;
  name: string | null;
};

type Props = {
  accion: (previo: ResultadoDeUsuario | null, form: FormData) => Promise<ResultadoDeUsuario>;
  variante?: "primario" | "secundario" | "fantasma";
  etiquetaBoton?: string;
  /**
   * Lo que esta sesión puede asignar (§55): los cinco roles y los tres países
   * para Administración; vendedor y preventa en sus países para Gerencia. Lo
   * decide `rolesQueAdministra` y `paisesQueAdministra`; aquí solo se ofrece.
   */
  roles: Role[];
  paises: CountryCode[];
} & (
  | { modo: "alta" }
  | { modo: "edicion"; usuario: UsuarioDelFormulario }
  | { modo: "acceso"; pendiente: PendienteDeAcceso }
);

/**
 * Alta previa, edición y acceso de usuarios · P-11.
 *
 * Un formulario para los tres porque los campos son los mismos —nombre, rol,
 * países— y lo que cambia es de dónde sale el correo: se captura en el alta,
 * viene de Microsoft al dar acceso, y no se toca al editar. Tres componentes
 * casi iguales se separarían con el tiempo.
 *
 * ## Lo que cada modo le dice a quien administra
 *
 * - **Alta.** El vínculo con Microsoft se hace solo, la primera vez que la
 *   persona entre con ese correo. No hay nada más que hacer.
 * - **Acceso.** La persona ya entró y cayó en «sin acceso»; queda vinculada
 *   desde ahora y su siguiente ingreso ya entra.
 * - **Edición.** Desactivar quita el acceso sin borrar su historial: las
 *   oportunidades y actividades siguen a su nombre.
 */
export function FormularioDeUsuario(props: Props) {
  const { accion, variante, etiquetaBoton, roles, paises } = props;
  const [abierto, setAbierto] = useState(false);

  const usuario = props.modo === "edicion" ? props.usuario : null;
  const pendiente = props.modo === "acceso" ? props.pendiente : null;

  const [resultadoCrudo, enviar, enviando] = useActionState(
    async (previo: ResultadoDeUsuario | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito(
        props.modo === "alta"
          ? "Usuario creado"
          : props.modo === "acceso"
            ? "Acceso otorgado"
            : "Usuario actualizado",
        props.modo === "alta"
          ? "Entrará con su cuenta de Microsoft; el vínculo se hace solo la primera vez."
          : props.modo === "acceso"
            ? "Su siguiente ingreso ya entra con el rol y los países asignados."
            : undefined,
      );
      return r;
    },
    null,
  );

  // Lo que se muestra: el resultado muere al cerrar el panel (§51).
  const resultado = useResultadoVivo(resultadoCrudo, abierto);

  const idFormulario = `usuario-${props.modo}-${usuario?.id ?? pendiente?.authUserId ?? "nuevo"}`;
  const campo = (nombre: string) => `${idFormulario}-${nombre}`;

  const titulo =
    props.modo === "alta" ? "Nuevo usuario" : props.modo === "acceso" ? "Dar acceso" : "Editar usuario";
  const textoDelBoton =
    etiquetaBoton ??
    (props.modo === "alta" ? "Nuevo usuario" : props.modo === "acceso" ? "Dar acceso" : "Editar");
  const varianteDelBoton = variante ?? (props.modo === "alta" ? "primario" : "secundario");

  const correo = usuario?.email ?? pendiente?.email ?? "";
  const nombreInicial = usuario?.name ?? pendiente?.name ?? "";
  const rolInicial = usuario?.role ?? roles[0];
  const paisesIniciales = new Set(usuario?.countryCodes ?? paises.slice(0, 1));

  return (
    <>
      <Boton variante={varianteDelBoton} onClick={() => setAbierto(true)}>
        {textoDelBoton}
      </Boton>

      <Panel
        titulo={titulo}
        subtitulo={props.modo === "alta" ? undefined : props.modo === "acceso" ? pendiente?.email : usuario?.email}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              {props.modo === "alta"
                ? "El vínculo con Microsoft se hace solo la primera vez que entre con este correo."
                : props.modo === "acceso"
                  ? "Queda vinculado desde ahora: su siguiente ingreso ya entra."
                  : "Desactivar quita el acceso sin borrar su historial."}
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idFormulario} disabled={enviando}>
                {enviando
                  ? "Guardando…"
                  : props.modo === "alta"
                    ? "Crear usuario"
                    : props.modo === "acceso"
                      ? "Dar acceso"
                      : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
          {usuario && <input type="hidden" name="userId" value={usuario.id} />}
          {pendiente && (
            <>
              <input type="hidden" name="authUserId" value={pendiente.authUserId} />
              <input type="hidden" name="email" value={pendiente.email} />
            </>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {props.modo === "alta" ? (
              <Campo
                etiqueta="Correo corporativo"
                htmlFor={campo("email")}
                problema={problemaDe(resultado, "email")}
              >
                <Entrada
                  id={campo("email")}
                  name="email"
                  type="email"
                  placeholder="nombre.apellido@avattar.com"
                  problema={problemaDe(resultado, "email")}
                />
              </Campo>
            ) : (
              <Campo etiqueta="Correo corporativo" htmlFor={campo("email-fijo")}>
                <Entrada id={campo("email-fijo")} value={correo} disabled readOnly />
              </Campo>
            )}

            <Campo etiqueta="Nombre" htmlFor={campo("name")} problema={problemaDe(resultado, "name")}>
              <Entrada
                id={campo("name")}
                name="name"
                defaultValue={nombreInicial}
                placeholder="Nombre y apellidos"
                problema={problemaDe(resultado, "name")}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta="Rol"
              htmlFor={campo("role")}
              problema={problemaDe(resultado, "role")}
            >
              <Seleccion
                id={campo("role")}
                name="role"
                defaultValue={rolInicial}
                disabled={usuario?.esYo}
                problema={problemaDe(resultado, "role")}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETA_ROL[r]}
                  </option>
                ))}
              </Seleccion>
              {/* Un select deshabilitado no viaja en el FormData; el rol tiene que llegar igual. */}
              {usuario?.esYo && <input type="hidden" name="role" value={usuario.role} />}
            </Campo>

            <Campo
              etiqueta="Países"
              htmlFor={campo("pais-MX")}
              problema={problemaDe(resultado, "countryCodes")}
            >
              <div className="flex flex-wrap gap-4 py-2">
                {paises.map((p) => (
                  <Casilla
                    key={p}
                    id={campo(`pais-${p}`)}
                    name="countryCodes"
                    value={p}
                    defaultChecked={paisesIniciales.has(p)}
                    etiqueta={NOMBRE_PAIS[p]}
                  />
                ))}
              </div>
            </Campo>
          </div>

          {usuario && (
            <Campo
              etiqueta="Estado"
              htmlFor={campo("active")}
              problema={problemaDe(resultado, "active")}
            >
              <div className="py-2">
                <Casilla
                  id={campo("active")}
                  name="active"
                  value="true"
                  defaultChecked={usuario.active}
                  disabled={usuario.esYo}
                  etiqueta="Con acceso"
                />
                {usuario.esYo && <input type="hidden" name="active" value="true" />}
              </div>
            </Campo>
          )}

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
