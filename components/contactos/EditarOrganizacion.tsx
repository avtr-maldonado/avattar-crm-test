"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
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
 * Editar la ficha de una cuenta · `Q-15`.
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
  propietarios,
  puedeReasignar,
  accion,
}: {
  organizacion: OrganizacionDelFormulario;
  propietarios: { id: string; name: string }[];
  puedeReasignar: boolean;
  accion: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoAccion | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito("Cuenta actualizada");
      return r;
    },
    null,
  );

  const etiquetaFiscal = IDENTIFICADOR[organizacion.countryCode] ?? "Identificador fiscal";

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar cuenta
      </Boton>

      <Panel
        titulo="Editar cuenta"
        subtitulo={`${organizacion.name} · ${organizacion.countryCode}. El país y la matriz no se editan aquí.`}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue">
              Marcarla estratégica la destaca en el tablero y en la ficha.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="editar-organizacion" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="editar-organizacion" action={enviar} className="flex flex-col gap-5">
          <input type="hidden" name="organizationId" value={organizacion.id} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Nombre" htmlFor="name" problema={problemaDe(resultado, "name")}>
              <Entrada
                id="name"
                name="name"
                defaultValue={organizacion.name}
                placeholder="Nombre comercial"
                problema={problemaDe(resultado, "name")}
              />
            </Campo>

            <Campo etiqueta="Razón social" htmlFor="legalName">
              <Entrada
                id="legalName"
                name="legalName"
                defaultValue={organizacion.legalName ?? ""}
                placeholder="Nombre legal para facturar"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta={etiquetaFiscal} htmlFor="taxId">
              <Entrada
                id="taxId"
                name="taxId"
                defaultValue={organizacion.taxId ?? ""}
                placeholder={`${etiquetaFiscal} de la empresa`}
              />
            </Campo>

            <Campo etiqueta="Tipo" htmlFor="type">
              <Seleccion id="type" name="type" defaultValue={organizacion.type}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Sector" htmlFor="industry">
              <Entrada
                id="industry"
                name="industry"
                defaultValue={organizacion.industry ?? ""}
                placeholder="Giro de la empresa"
              />
            </Campo>

            <Campo etiqueta="Ciudad" htmlFor="city">
              <Entrada
                id="city"
                name="city"
                defaultValue={organizacion.city ?? ""}
                placeholder="Dónde opera"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta="Empleados"
              htmlFor="employees"
              problema={problemaDe(resultado, "employees")}
            >
              <Entrada
                id="employees"
                name="employees"
                inputMode="numeric"
                defaultValue={organizacion.employees ?? ""}
                placeholder="Cuántos son"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "employees")}
              />
            </Campo>

            <Campo
              etiqueta="Días de crédito"
              htmlFor="creditDays"
              problema={problemaDe(resultado, "creditDays")}
              ayuda="Lo que se le concede para pagar."
            >
              <Entrada
                id="creditDays"
                name="creditDays"
                inputMode="numeric"
                defaultValue={organizacion.creditDays ?? ""}
                placeholder="Días"
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "creditDays")}
              />
            </Campo>
          </div>

          {puedeReasignar && (
            <Campo
              etiqueta="Propietario de la cuenta"
              htmlFor="ownerId"
              problema={problemaDe(resultado, "ownerId")}
            >
              <Seleccion id="ownerId" name="ownerId" defaultValue={organizacion.ownerId}>
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
            defaultChecked={organizacion.isStrategic}
            etiqueta="Cuenta estratégica"
          />

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
