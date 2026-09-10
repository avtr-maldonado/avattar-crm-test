"use client";

import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { Campo, Entrada, Seleccion } from "@/components/ui/formulario";
import { Autocompletado, type Eleccion, type Sugerencia } from "@/components/ui/Autocompletado";

const TIPOS_DE_ORGANIZACION = [
  { valor: "PROSPECTO", etiqueta: "Prospecto" },
  { valor: "CLIENTE", etiqueta: "Cliente" },
  { valor: "PARTNER", etiqueta: "Partner" },
  { valor: "FABRICANTE", etiqueta: "Fabricante" },
  { valor: "PROVEEDOR", etiqueta: "Proveedor" },
];

/** `existente` / `nueva` · lo que el sistema hizo con lo que se acaba de escribir. */
function anotacionDe(e: Eleccion) {
  return e.tipo === "EXISTENTE" ? "existente" : e.tipo === "NUEVA" ? "nueva" : null;
}

/**
 * Organización y persona principal, con lo que haga falta capturar si son
 * nuevas.
 *
 * Los campos extra solo aparecen cuando de verdad hay algo nuevo que capturar.
 * Un formulario que muestra todo desde el principio se lee como un trámite, y
 * este es el que decide si el equipo adopta el sistema o no (§12.4).
 */
export function CamposDeContacto({
  organizacion,
  persona,
  rolesDeComite,
  resultado,
  buscarOrganizaciones,
  buscarPersonas,
  alElegirOrganizacion,
  alElegirPersona,
}: {
  organizacion: Eleccion;
  persona: Eleccion;
  rolesDeComite: { id: string; name: string }[];
  resultado: ResultadoAccion<unknown> | null;
  buscarOrganizaciones: (texto: string) => Promise<Sugerencia[]>;
  buscarPersonas: (texto: string) => Promise<Sugerencia[]>;
  alElegirOrganizacion: (e: Eleccion) => void;
  alElegirPersona: (e: Eleccion) => void;
}) {
  const organizacionEsNueva = organizacion.tipo === "NUEVA";
  const personaEsNueva = persona.tipo === "NUEVA";

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo
          etiqueta="Organización"
          htmlFor="organizacion"
          anotacion={anotacionDe(organizacion)}
          tonoAnotacion={organizacion.tipo === "EXISTENTE" ? "exito" : "acento"}
          problema={problemaDe(resultado, "organizacionNombre")}
        >
          <Autocompletado
            id="organizacion"
            placeholder="Nombre de la empresa"
            buscar={buscarOrganizaciones}
            alElegir={alElegirOrganizacion}
            etiquetaCrear="Crear organización"
            problema={problemaDe(resultado, "organizacionNombre")}
          />
        </Campo>

        <Campo
          etiqueta="Persona principal"
          htmlFor="persona"
          anotacion={anotacionDe(persona)}
          tonoAnotacion={persona.tipo === "EXISTENTE" ? "exito" : "acento"}
          ayuda={
            organizacionEsNueva ? "La empresa es nueva: la persona también se creará." : undefined
          }
        >
          <Autocompletado
            id="persona"
            placeholder="Nombre del contacto"
            buscar={buscarPersonas}
            alElegir={alElegirPersona}
            etiquetaCrear="Crear contacto"
            deshabilitado={organizacion.tipo === "VACIA"}
          />
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
