"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import type { CountryCode, LeadStage } from "@/lib/dto";
import { ETIQUETA_DE_ETAPA } from "@/lib/domain/leadStages";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Seleccion } from "@/components/ui/formulario";
import { AsignarProspectos, type VendedorAsignable } from "./AsignarProspectos";
import { DescartarProspecto, type MotivoDeDescarte } from "./DescartarProspecto";

type ResultadoDeEtapa = ResultadoAccion<{ etapa: string }>;

/**
 * Las acciones del detalle · asignar, cambiar de etapa y descartar (decisiones
 * §58). Cada botón abre su panel; lo que la sesión no puede hacer no aparece.
 * «Agendar actividad» y «Convertir» viven aparte: la primera es el composer,
 * la segunda llega en la entrega 2.
 */
export function AccionesDeProspecto({
  leadId,
  nombre,
  pais,
  etapa,
  etapasPosibles,
  vendedores,
  motivos,
  puede,
  acciones,
}: {
  leadId: string;
  nombre: string;
  pais: CountryCode;
  etapa: LeadStage;
  /** A dónde puede moverse por mano esta sesión, ya filtrado por la tabla de transiciones. */
  etapasPosibles: LeadStage[];
  vendedores: VendedorAsignable[];
  motivos: MotivoDeDescarte[];
  puede: { asignar: boolean; descartar: boolean };
  acciones: {
    asignar: (previo: ResultadoAccion<{ asignados: number }> | null, form: FormData) => Promise<ResultadoAccion<{ asignados: number }>>;
    descartar: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
    cambiarEtapa: (previo: ResultadoDeEtapa | null, form: FormData) => Promise<ResultadoDeEtapa>;
  };
}) {
  const [panel, setPanel] = useState<"asignar" | "descartar" | null>(null);
  const [, cambiar, cambiando] = useActionState(async (previo: ResultadoDeEtapa | null, form: FormData) => {
    const r = await acciones.cambiarEtapa(previo, form);
    if (r.ok) avisar.exito("Etapa actualizada", r.datos.etapa);
    else if (r.motivo === "VALIDACION") avisar.error("No se movió", r.problemas.map((p) => p.mensaje).join(" "));
    else avisarSiCorresponde(r);
    return r;
  }, null);

  return (
    <div className="space-y-2">
      {etapasPosibles.length > 0 && (
        <form action={cambiar} className="flex items-center gap-2">
          <input type="hidden" name="leadId" value={leadId} />
          <label htmlFor="toStage" className="sr-only">
            Mover a
          </label>
          <Seleccion id="toStage" name="toStage" defaultValue="" disabled={cambiando} className="flex-1">
            <option value="" disabled>
              Mover de {ETIQUETA_DE_ETAPA[etapa]} a…
            </option>
            {etapasPosibles.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_DE_ETAPA[e]}
              </option>
            ))}
          </Seleccion>
          <Boton type="submit" variante="secundario" disabled={cambiando}>
            Mover
          </Boton>
        </form>
      )}

      {puede.asignar && (
        <Boton onClick={() => setPanel("asignar")} className="w-full justify-center">
          Asignar vendedor
        </Boton>
      )}
      {puede.descartar && (
        <Boton variante="peligro" onClick={() => setPanel("descartar")} className="w-full justify-center">
          Descartar
        </Boton>
      )}

      <AsignarProspectos ids={[leadId]} vendedores={vendedores} abierto={panel === "asignar"} alCerrar={() => setPanel(null)} accion={acciones.asignar} />
      <DescartarProspecto leadId={leadId} nombre={nombre} motivos={motivos} abierto={panel === "descartar"} alCerrar={() => setPanel(null)} accion={acciones.descartar} />
      <span className="sr-only">{pais}</span>
    </div>
  );
}
