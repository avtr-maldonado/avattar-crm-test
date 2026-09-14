"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import type { CountryCode } from "@/lib/dto";
import { NOMBRE_PAIS } from "@/lib/etiquetas";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Casilla,
  Entrada,
  Panel,
  Seleccion,
} from "@/components/ui/formulario";

/** Alta y edición comparten formulario, así que comparten tipo de resultado. */
type ResultadoDeContacto = ResultadoAccion<{ id: string } | null>;

const TIPOS = [
  { valor: "PROSPECTO", etiqueta: "Prospecto" },
  { valor: "CLIENTE", etiqueta: "Cliente" },
  { valor: "PARTNER", etiqueta: "Partner" },
  { valor: "FABRICANTE", etiqueta: "Fabricante" },
  { valor: "PROVEEDOR", etiqueta: "Proveedor" },
];

/** El identificador fiscal se llama distinto en cada país (§4). */
const IDENTIFICADOR: Record<string, string> = { MX: "RFC", CO: "NIT", CL: "RUT" };

export type OrganizacionDelFormulario = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  type: string;
  industry: string | null;
  city: string | null;
  countryCode: string;
  employees: number | null;
  creditDays: number | null;
  isStrategic: boolean;
  ownerId: string;
};

/**
 * Alta y edición de la ficha de una cuenta · `Q-15`.
 *
 * El mismo formulario sirve para las dos, como en `EditarPersona`: los campos
 * son los mismos y lo que cambia es si llega una `organizacion`. Sin ella, da
 * de alta.
 *
 * ## En el alta, el país se elige solo si hay de dónde
 *
 * Una cuenta nace en un país donde quien la crea opera. Con un solo país no se
 * pregunta; con varios, el selector ofrece únicamente los de la sesión (AC-05).
 * El nombre del identificador fiscal sigue al país elegido: RFC, NIT o RUT.
 *
 * El propietario no se elige al crear: es quien crea. Reasignar es de Gerencia
 * y se hace después, desde esta misma ficha.
 *
 * ## Lo que no se edita, y no por olvido
 *
 * **El país.** Cambiarlo movería de país todas las oportunidades de la cuenta y
 * con ellas quién las ve: el alcance por rol se aplicaría bien en cada consulta
 * y el dato habría cruzado la frontera igual (`AC-05`). Eso no es editar, es
 * migrar, y necesita su propia decisión.
 *
 * **La organización matriz.** La jerarquía matriz-filial es `F-402`, Fase 2.
 */
export function EditarOrganizacion({
  organizacion,
  paises = [],
  propietarios = [],
  puedeReasignar = false,
  accion,
  variante,
  etiquetaBoton,
}: {
  /** Sin organización, el formulario da de alta. */
  organizacion?: OrganizacionDelFormulario;
  /** Al dar de alta: los países en los que opera la sesión. */
  paises?: CountryCode[];
  propietarios?: { id: string; name: string }[];
  puedeReasignar?: boolean;
  accion: (previo: ResultadoDeContacto | null, form: FormData) => Promise<ResultadoDeContacto>;
  variante?: "primario" | "secundario" | "fantasma";
  etiquetaBoton?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const esAlta = organizacion === undefined;
  const [pais, setPais] = useState<string>(organizacion?.countryCode ?? paises[0] ?? "MX");

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoDeContacto | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito(esAlta ? "Cuenta creada" : "Cuenta actualizada");
      return r;
    },
    null,
  );

  const idFormulario = `organizacion-${organizacion?.id ?? "nueva"}`;
  const etiquetaFiscal = IDENTIFICADOR[pais] ?? "Identificador fiscal";
  const nombrePais = NOMBRE_PAIS[pais as CountryCode] ?? pais;

  return (
    <>
      <Boton variante={variante ?? (esAlta ? "primario" : "secundario")} onClick={() => setAbierto(true)}>
        {etiquetaBoton ?? (esAlta ? "Nueva cuenta" : "Editar cuenta")}
      </Boton>

      <Panel
        titulo={esAlta ? "Nueva cuenta" : "Editar cuenta"}
        subtitulo={
          esAlta
            ? `Nace en ${nombrePais} y queda a tu nombre. Reasignarla se hace después, desde la ficha.`
            : `${organizacion.name} · ${organizacion.countryCode}. El país y la matriz no se editan aquí.`
        }
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue">
              {esAlta
                ? "Con el nombre y el tipo basta para empezar; lo demás se completa desde la ficha."
                : "Marcarla estratégica la destaca en el tablero y en la ficha."}
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idFormulario} disabled={enviando}>
                {enviando ? "Guardando…" : esAlta ? "Crear cuenta" : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
          {organizacion && <input type="hidden" name="organizationId" value={organizacion.id} />}

          {esAlta && paises.length > 1 && (
            <Campo
              etiqueta="País"
              htmlFor={`${idFormulario}-countryCode`}
              problema={problemaDe(resultado, "countryCode")}
              ayuda="Solo los países en los que operas. Decide quién puede ver la cuenta."
            >
              <Seleccion
                id={`${idFormulario}-countryCode`}
                name="countryCode"
                value={pais}
                onChange={(e) => setPais(e.target.value)}
                problema={problemaDe(resultado, "countryCode")}
              >
                {paises.map((p) => (
                  <option key={p} value={p}>
                    {NOMBRE_PAIS[p]}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Nombre" htmlFor={`${idFormulario}-name`} problema={problemaDe(resultado, "name")}>
              <Entrada
                id={`${idFormulario}-name`}
                name="name"
                defaultValue={organizacion?.name ?? ""}
                placeholder="Nombre comercial"
                problema={problemaDe(resultado, "name")}
              />
            </Campo>

            <Campo etiqueta="Razón social" htmlFor={`${idFormulario}-legalName`}>
              <Entrada
                id={`${idFormulario}-legalName`}
                name="legalName"
                defaultValue={organizacion?.legalName ?? ""}
                placeholder="Nombre legal para facturar"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta={etiquetaFiscal} htmlFor={`${idFormulario}-taxId`}>
              <Entrada
                id={`${idFormulario}-taxId`}
                name="taxId"
                defaultValue={organizacion?.taxId ?? ""}
                placeholder={`${etiquetaFiscal} de la empresa`}
              />
            </Campo>

            <Campo etiqueta="Tipo" htmlFor={`${idFormulario}-type`}>
              <Seleccion
                id={`${idFormulario}-type`}
                name="type"
                defaultValue={organizacion?.type ?? "PROSPECTO"}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Sector" htmlFor={`${idFormulario}-industry`}>
              <Entrada
                id={`${idFormulario}-industry`}
                name="industry"
                defaultValue={organizacion?.industry ?? ""}
                placeholder="Giro de la empresa"
              />
            </Campo>

            <Campo etiqueta="Ciudad" htmlFor={`${idFormulario}-city`}>
              <Entrada
                id={`${idFormulario}-city`}
                name="city"
                defaultValue={organizacion?.city ?? ""}
                placeholder="Dónde opera"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta="Empleados"
              htmlFor={`${idFormulario}-employees`}
              problema={problemaDe(resultado, "employees")}
            >
              <Entrada
                id={`${idFormulario}-employees`}
                name="employees"
                inputMode="numeric"
                defaultValue={organizacion?.employees ?? ""}
                placeholder="Cuántos son"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "employees")}
              />
            </Campo>

            <Campo
              etiqueta="Días de crédito"
              htmlFor={`${idFormulario}-creditDays`}
              problema={problemaDe(resultado, "creditDays")}
              ayuda="Lo que se le concede para pagar."
            >
              <Entrada
                id={`${idFormulario}-creditDays`}
                name="creditDays"
                inputMode="numeric"
                defaultValue={organizacion?.creditDays ?? ""}
                placeholder="Días"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "creditDays")}
              />
            </Campo>
          </div>

          {organizacion && puedeReasignar && (
            <Campo
              etiqueta="Propietario de la cuenta"
              htmlFor={`${idFormulario}-ownerId`}
              problema={problemaDe(resultado, "ownerId")}
            >
              <Seleccion id={`${idFormulario}-ownerId`} name="ownerId" defaultValue={organizacion.ownerId}>
                {propietarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          )}

          <Casilla
            name="isStrategic"
            value="true"
            defaultChecked={organizacion?.isStrategic ?? false}
            etiqueta="Cuenta estratégica"
          />

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
