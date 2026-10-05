"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Panel } from "@/components/ui/formulario";

export type OportunidadDeEtapa = {
  id: string;
  folio: string;
  nombre: string;
  cuenta: string;
  propietario: string;
  /** Ya formateados. */
  importe: string;
  ponderado: string;
};

export type EtapaDetallada = {
  nombre: string;
  valor: string;
  ponderado: string;
  /** «35 %»: la probabilidad de la etapa, que es lo que pondera (RN-01). */
  probabilidad: string;
  cuantas: number;
  /** La línea de la tasa de paso, tal como se lee bajo la barra. */
  leyendaDePaso: string;
  oportunidades: OportunidadDeEtapa[];
};

/**
 * Qué hay detrás de una barra del embudo.
 *
 * La barra dice cuánto dinero está parado en la etapa; al pulsarla se ve de
 * qué oportunidades sale esa cifra, con su importe, la probabilidad de la
 * etapa y el ponderado (importe × probabilidad, RN-01). Es el mismo dato que
 * el kanban, leído por etapa y con la suma a la vista: nada se calcula aquí.
 */
export function DetalleDeEtapa({ etapa, children }: { etapa: EtapaDetallada; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        title="Ver qué oportunidades suman esta barra"
        className="block w-full rounded-xs text-left focus:shadow-ring focus:outline-none"
      >
        {children}
      </button>

      <Panel
        titulo={`${etapa.nombre} · ${etapa.valor}`}
        subtitulo={`${etapa.cuantas} ${etapa.cuantas === 1 ? "oportunidad abierta" : "oportunidades abiertas"} · probabilidad de etapa ${etapa.probabilidad} · ponderado ${etapa.ponderado}`}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        cerrarAlFondo
      >

        {etapa.oportunidades.length === 0 ? (
          <p className="mt-4 rounded-sm border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-tenue">
            No hay oportunidades abiertas en esta etapa con los filtros actuales.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-borde">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-superficie-sutil">
                <tr className="text-left">
                  <th className="eyebrow px-3 py-2 font-medium">Folio</th>
                  <th className="eyebrow px-3 py-2 font-medium">Oportunidad</th>
                  <th className="eyebrow px-3 py-2 font-medium">Propietario</th>
                  <th className="eyebrow px-3 py-2 text-right font-medium">Importe</th>
                  <th className="eyebrow px-3 py-2 text-right font-medium">Ponderado</th>
                </tr>
              </thead>
              <tbody>
                {etapa.oportunidades.map((o) => (
                  <tr key={o.id} className="border-t border-borde hover:bg-superficie-sutil">
                    <td className="px-3 py-2">
                      <Link href={`/oportunidades/${o.id}`} className="font-medium text-acento hover:underline">
                        {o.folio}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-texto-titulo">{o.nombre}</p>
                      <p className="text-xs text-texto-tenue">{o.cuenta}</p>
                    </td>
                    <td className="px-3 py-2 text-texto-cuerpo">{o.propietario}</td>
                    <td className="tabular px-3 py-2 text-right text-texto-titulo">{o.importe}</td>
                    <td className="tabular px-3 py-2 text-right text-texto-titulo">{o.ponderado}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde-fuerte bg-superficie-sutil font-semibold">
                  <td className="px-3 py-2" colSpan={3}>
                    Total · {etapa.cuantas}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{etapa.valor}</td>
                  <td className="tabular px-3 py-2 text-right">{etapa.ponderado}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
