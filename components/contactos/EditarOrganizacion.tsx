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

/** Las sedes posibles. La cuenta puede no tener ninguna (§18). */
const SEDES: { valor: CountryCode; etiqueta: string }[] = (["MX", "CO", "CL"] as const).map(
  (p) => ({ valor: p, etiqueta: NOMBRE_PAIS[p] }),
);

export type OrganizacionDelFormulario = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  type: string;
  industry: string | null;
  city: string | null;
  /** País sede, informativo y opcional (§18). */
  countryCode: string | null;
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
 * ## La sede es un dato, no una llave · decisiones §18
 *
 * Las cuentas no son de un país: se ven desde todas las oficinas y se les
 * venden oportunidades en cualquier pipeline. El país queda como **sede**,
 * opcional e informativa —dónde está la empresa—, y por eso se puede elegir
 * cualquiera, o ninguna, al crear y al editar. El identificador fiscal lleva un
 * nombre genérico: una empresa con sede en Chile puede facturar con RFC en
 * México, y el campo no tiene por qué decidir cuál es.
 *
 * El propietario no se elige al crear: es quien crea. Reasignar es de Gerencia
 * y se hace después, desde esta misma ficha.
 *
 * ## Lo que no se edita, y no por olvido
 *
 * **La organización matriz.** La jerarquía matriz-filial es `F-402`, Fase 2.
 */
export function EditarOrganizacion({
  organizacion,
  propietarios = [],
  puedeReasignar = false,
  accion,
  variante,
  etiquetaBoton,
}: {
  /** Sin organización, el formulario da de alta. */
  organizacion?: OrganizacionDelFormulario;
  propietarios?: { id: string; name: string }[];
  puedeReasignar?: boolean;
  accion: (previo: ResultadoDeContacto | null, form: FormData) => Promise<ResultadoDeContacto>;
  variante?: "primario" | "secundario" | "fantasma";
  etiquetaBoton?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const esAlta = organizacion === undefined;

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

  return (
    <>
      <Boton variante={variante ?? (esAlta ? "primario" : "secundario")} onClick={() => setAbierto(true)}>
        {etiquetaBoton ?? (esAlta ? "Nueva cuenta" : "Editar cuenta")}
      </Boton>

      <Panel
        titulo={esAlta ? "Nueva cuenta" : "Editar cuenta"}
        subtitulo={
          esAlta
            ? "Queda a tu nombre y a la vista de toda la operación. Reasignarla se hace después, desde la ficha."
            : `${organizacion.name}. La matriz no se edita aquí.`
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
            <Campo
              etiqueta="Identificador fiscal"
              htmlFor={`${idFormulario}-taxId`}
              ayuda="RFC, NIT o RUT, según dónde facture la empresa."
            >
              <Entrada
                id={`${idFormulario}-taxId`}
                name="taxId"
                defaultValue={organizacion?.taxId ?? ""}
                placeholder="Identificador fiscal de la empresa"
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

          <Campo
            etiqueta="País sede"
            htmlFor={`${idFormulario}-countryCode`}
            problema={problemaDe(resultado, "countryCode")}
            ayuda="Informativo. No limita quién ve la cuenta ni dónde se le venden oportunidades."
          >
            <Seleccion
              id={`${idFormulario}-countryCode`}
              name="countryCode"
              defaultValue={organizacion?.countryCode ?? ""}
              problema={problemaDe(resultado, "countryCode")}
            >
              <option value="">Sin sede definida</option>
              {SEDES.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.etiqueta}
                </option>
              ))}
            </Seleccion>
          </Campo>

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
