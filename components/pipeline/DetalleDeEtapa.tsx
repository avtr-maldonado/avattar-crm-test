"use client";

import { useState, type ReactNode } from "react";
import { PanelDeDesglose } from "@/components/ui/PanelDeDesglose";

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
 * Lo pinta `PanelDeDesglose`, el mismo molde que las gráficas de Análisis (§55).
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

      <PanelDeDesglose
        titulo={`${etapa.nombre} · ${etapa.valor}`}
        subtitulo={etapa.leyendaDePaso}
        resumen={[
          { etiqueta: "Oportunidades abiertas", texto: String(etapa.cuantas) },
          { etiqueta: "Probabilidad de etapa", texto: etapa.probabilidad },
          { etiqueta: "Ponderado", texto: etapa.ponderado },
        ]}
        encabezados={{ principal: "Oportunidad", nota: "Propietario", cifras: ["Importe", "Ponderado"] }}
        filas={etapa.oportunidades.map((o) => ({
          clave: o.id,
          titulo: o.nombre,
          subtitulo: `${o.cuenta} · ${o.folio}`,
          href: `/oportunidades/${o.id}`,
          nota: o.propietario,
          cifras: [{ texto: o.importe }, { texto: o.ponderado }],
        }))}
        total={{ etiqueta: `Total · ${etapa.cuantas}`, cifras: [etapa.valor, etapa.ponderado] }}
        vacio="No hay oportunidades abiertas en esta etapa con los filtros actuales."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      />
    </>
  );
}
