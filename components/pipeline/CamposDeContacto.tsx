"use client";

import { Campo, Entrada, Seleccion } from "@/components/ui/formulario";
import { Autocompletado, type Eleccion, type Sugerencia } from "@/components/ui/Autocompletado";

const TIPOS_DE_ORGANIZACION = [
  { valor: "PROSPECTO", etiqueta: "Prospecto" },
  { valor: "CLIENTE", etiqueta: "Cliente" },
  { valor: "PARTNER", etiqueta: "Partner" },
  { valor: "FABRICANTE", etiqueta: "Fabricante" },
  { valor: "PROVEEDOR", etiqueta: "Proveedor" },
];

/** La opción del desplegable que significa «voy a capturar uno nuevo». */
const NUEVO_CONTACTO = "__nuevo__";

/** `existente` / `nueva` · lo que el sistema hizo con lo que se acaba de elegir. */
function anotacionDe(e: Eleccion) {
  return e.tipo === "EXISTENTE" ? "existente" : e.tipo === "NUEVA" ? "nueva" : null;
}

function valorDelDesplegable(persona: Eleccion): string {
  return persona.tipo === "EXISTENTE"
    ? persona.id
    : persona.tipo === "NUEVA"
      ? NUEVO_CONTACTO
      : "";
}

/**
 * El desplegable de persona principal cuando la cuenta ya existe.
 *
 * Es un `<select>` nativo y no el autocompletado: una cuenta tiene un puñado
 * de contactos, y verlos todos de golpe evita el error de teclear «Miguel» y
 * crear a un Miguel Hidalgo que ya estaba en la lista. Crear uno nuevo sigue
 * siendo una opción del mismo control, no otro camino.
 */
function SelectorDeContacto({
  nombreDeCuenta,
  persona,
  contactos,
  cargando,
  alElegir,
}: {
  nombreDeCuenta: string;
  persona: Eleccion;
  contactos: Sugerencia[] | null;
  cargando: boolean;
  alElegir: (e: Eleccion) => void;
}) {
  if (contactos == null) {
    return (
      <Seleccion id="persona" disabled aria-busy={cargando} value="" onChange={() => undefined}>
        <option value="">{cargando ? "Cargando contactos…" : "Sin contactos"}</option>
      </Seleccion>
    );
  }

  return (
    <Seleccion
      id="persona"
      value={valorDelDesplegable(persona)}
      onChange={(e) => {
        const valor = e.target.value;
        if (valor === "") return alElegir({ tipo: "VACIA" });
        if (valor === NUEVO_CONTACTO) return alElegir({ tipo: "NUEVA", nombre: "" });
        const contacto = contactos.find((c) => c.id === valor);
        if (contacto) alElegir({ tipo: "EXISTENTE", id: contacto.id, nombre: contacto.nombre });
      }}
    >
      <option value="">Sin persona principal</option>
      {contactos.length > 0 && (
        <optgroup label={`Contactos de ${nombreDeCuenta}`}>
          {contactos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.detalle ? `${c.nombre} · ${c.detalle}` : c.nombre}
            </option>
          ))}
        </optgroup>
      )}
      <option value={NUEVO_CONTACTO}>Nuevo contacto…</option>
    </Seleccion>
  );
}

/**
 * Organización y persona principal, con lo que haga falta capturar si son
 * nuevas.
 *
 * Los campos extra solo aparecen cuando de verdad hay algo nuevo que capturar.
 * Un formulario que muestra todo desde el principio se lee como un trámite, y
 * este es el que decide si el equipo adopta el sistema o no (§12.4).
 *
 * La persona principal cambia de forma según la cuenta: con una existente es
 * un desplegable de sus contactos, con «Nuevo contacto…» al final; con una
 * nueva no hay a quién elegir, así que el campo es directamente el nombre.
 */
export function CamposDeContacto({
  organizacion,
  persona,
  rolesDeComite,
  contactos,
  cargandoContactos,
  problema,
  buscarOrganizaciones,
  alElegirOrganizacion,
  alElegirPersona,
}: {
  organizacion: Eleccion;
  persona: Eleccion;
  rolesDeComite: { id: string; name: string }[];
  /** Los de la cuenta elegida, o `null` mientras no lleguen (`estadoDeAlta`). */
  contactos: Sugerencia[] | null;
  cargandoContactos: boolean;
  problema: (campo: string) => string | undefined;
  buscarOrganizaciones: (texto: string) => Promise<Sugerencia[]>;
  alElegirOrganizacion: (e: Eleccion) => void;
  alElegirPersona: (e: Eleccion) => void;
}) {
  const organizacionEsNueva = organizacion.tipo === "NUEVA";
  const organizacionExiste = organizacion.tipo === "EXISTENTE";
  const personaEsNueva = persona.tipo === "NUEVA";

  const lista = organizacionExiste ? contactos : null;

  const ayudaDePersona = organizacionEsNueva
    ? "La empresa es nueva: la persona también se creará."
    : lista?.length === 0
      ? "No hay contactos que elegir: captura uno nuevo."
      : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo
          etiqueta="Organización"
          htmlFor="organizacion"
          anotacion={anotacionDe(organizacion)}
          tonoAnotacion={organizacionExiste ? "exito" : "acento"}
          problema={problema("organizacionNombre")}
        >
          <Autocompletado
            id="organizacion"
            placeholder="Nombre de la empresa"
            buscar={buscarOrganizaciones}
            alElegir={alElegirOrganizacion}
            etiquetaCrear="Crear organización"
            problema={problema("organizacionNombre")}
          />
        </Campo>

        <Campo
          etiqueta="Persona principal"
          htmlFor="persona"
          anotacion={anotacionDe(persona)}
          tonoAnotacion={persona.tipo === "EXISTENTE" ? "exito" : "acento"}
          ayuda={ayudaDePersona}
        >
          {organizacionExiste ? (
            <SelectorDeContacto
              nombreDeCuenta={organizacion.nombre}
              persona={persona}
              contactos={lista}
              cargando={cargandoContactos}
              alElegir={alElegirPersona}
            />
          ) : (
            <Entrada
              id="persona"
              name={organizacionEsNueva ? "personaNombre" : undefined}
              placeholder={
                organizacionEsNueva ? "Nombre del contacto" : "Elige primero la organización"
              }
              disabled={!organizacionEsNueva}
              value={personaEsNueva ? persona.nombre : ""}
              onChange={(e) =>
                alElegirPersona(
                  e.target.value.trim() === ""
                    ? { tipo: "VACIA" }
                    : { tipo: "NUEVA", nombre: e.target.value },
                )
              }
            />
          )}
        </Campo>
      </div>

      {(organizacionEsNueva || personaEsNueva) && (
        <div className="grid grid-cols-1 gap-5 rounded-sm border border-borde bg-superficie-sutil p-4 sm:grid-cols-2">
          {organizacionEsNueva && (
            <Campo etiqueta="Tipo de organización" htmlFor="organizacionTipo">
              <Seleccion id="organizacionTipo" name="organizacionTipo" defaultValue="PROSPECTO">
                {TIPOS_DE_ORGANIZACION.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          )}

          {/* Con cuenta existente el nombre no cabe en el desplegable: se captura aquí. */}
          {personaEsNueva && organizacionExiste && (
            <Campo etiqueta="Nombre del contacto" htmlFor="personaNombre">
              <Entrada
                id="personaNombre"
                name="personaNombre"
                placeholder="Nombre y apellido"
                autoFocus
                value={persona.nombre}
                onChange={(e) => alElegirPersona({ tipo: "NUEVA", nombre: e.target.value })}
              />
            </Campo>
          )}

          {personaEsNueva && (
            <>
              <Campo etiqueta="Cargo" htmlFor="personaCargo">
                <Entrada id="personaCargo" name="personaCargo" placeholder="Puesto en la empresa" />
              </Campo>
              <Campo
                etiqueta="Rol en el comité"
                htmlFor="personaRolComiteId"
                ayuda="Declararlo satisface el requisito de entrada a Descubrimiento."
              >
                <Seleccion id="personaRolComiteId" name="personaRolComiteId" defaultValue="">
                  <option value="">Sin declarar</option>
                  {rolesDeComite.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
            </>
          )}
        </div>
      )}
    </>
  );
}
