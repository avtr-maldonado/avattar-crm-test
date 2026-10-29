"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Desplegable, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";
import { etiquetaDeLapso, parametrosDeLapso, type Lapso } from "@/lib/filters/lapso";
import { SelectorDeLapso } from "@/components/analisis/SelectorDeLapso";

export type FiltrosActivosDeActividades = {
  estado: string[];
  tipo: string[];
  oportunidad: string[];
  /** `null` es el reposo de la agenda: pendientes de cualquier fecha y hechas en dos semanas. */
  lapso: Lapso | null;
};

type Clave = "estado" | "tipo" | "oportunidad" | "lapso";

/** Lo que el lapso puede escribir en la URL: se borra todo antes de escribir el modo elegido. */
const PARAMETROS_DE_LAPSO = ["anio", "q", "mes", "desde", "hasta"] as const;

/**
 * Los filtros de Actividades · estado, tipo, oportunidad y lapso (decisiones §55).
 *
 * Las mismas pastillas que Análisis y el pipeline (`Desplegable`): cada una
 * dice lo que tiene aplicado, los de varios abren casillas con «Ninguno» y
 * «Aplicar», y aplicar navega una sola vez reescribiendo la URL (INV-10).
 * Vista, responsable y semana se conservan tal cual. El lapso no se ofrece en
 * la vista semanal: ahí la semana ya es el lapso.
 */
export function FiltrosDeActividades({
  activos,
  catalogos,
  conLapso,
}: {
  activos: FiltrosActivosDeActividades;
  catalogos: {
    estados: OpcionDeFiltro[];
    tipos: OpcionDeFiltro[];
    oportunidades: OpcionDeFiltro[];
    anios: number[];
  };
  conLapso: boolean;
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState<Clave | null>(null);

  function navegar(cambio: Partial<FiltrosActivosDeActividades>) {
    const f = { ...activos, ...cambio };
    const p = new URLSearchParams(window.location.search);
    for (const clave of ["estado", "tipo", "op", ...PARAMETROS_DE_LAPSO]) p.delete(clave);
    for (const v of f.estado) p.append("estado", v);
    for (const v of f.tipo) p.append("tipo", v);
    for (const v of f.oportunidad) p.append("op", v);
    if (f.lapso) {
      for (const [clave, valor] of Object.entries(parametrosDeLapso(f.lapso))) {
        if (valor !== null) p.set(clave, valor);
      }
    }
    setAbierto(null);
    iniciar(() => router.push(`/actividades?${p.toString()}`));
  }

  const hayFiltros = activos.estado.length + activos.tipo.length + activos.oportunidad.length > 0 || activos.lapso !== null;
  const atenuado = navegando ? "opacity-60" : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Desplegable
        className={atenuado}
        etiqueta="Estado"
        resumen={resumenDeVarios(catalogos.estados, activos.estado)}
        activo={activos.estado.length > 0}
        abierto={abierto === "estado"}
        alAlternar={(v) => setAbierto(v ? "estado" : null)}
        ancho="w-52"
      >
        <ListaDeVarios opciones={catalogos.estados} elegidosAlAbrir={activos.estado} vacio="Sin estados." alAplicar={(v) => navegar({ estado: v })} />
      </Desplegable>

      <Desplegable
        className={atenuado}
        etiqueta="Tipo"
        resumen={resumenDeVarios(catalogos.tipos, activos.tipo)}
        activo={activos.tipo.length > 0}
        abierto={abierto === "tipo"}
        alAlternar={(v) => setAbierto(v ? "tipo" : null)}
        ancho="w-60"
      >
        <ListaDeVarios
          opciones={catalogos.tipos}
          elegidosAlAbrir={activos.tipo}
          buscable
          vacio="No hay tipos de actividad activos."
          alAplicar={(v) => navegar({ tipo: v })}
        />
      </Desplegable>

      <Desplegable
        className={atenuado}
        etiqueta="Oportunidad"
        resumen={resumenDeVarios(catalogos.oportunidades, activos.oportunidad)}
        activo={activos.oportunidad.length > 0}
        abierto={abierto === "oportunidad"}
        alAlternar={(v) => setAbierto(v ? "oportunidad" : null)}
        ancho="w-80"
      >
        <ListaDeVarios
          opciones={catalogos.oportunidades}
          elegidosAlAbrir={activos.oportunidad}
          buscable
          vacio="Ninguna actividad tiene oportunidad en lo que se ve."
          alAplicar={(v) => navegar({ oportunidad: v })}
        />
      </Desplegable>

      {conLapso && (
        <Desplegable
          className={atenuado}
          etiqueta="Lapso"
          resumen={activos.lapso ? etiquetaDeLapso(activos.lapso) : "Pendientes y recientes"}
          activo={activos.lapso !== null}
          abierto={abierto === "lapso"}
          alAlternar={(v) => setAbierto(v ? "lapso" : null)}
          ancho="w-80"
        >
          <div className="divide-y divide-borde">
            <button
              type="button"
              onClick={() => navegar({ lapso: null })}
              className={clsx(
                "flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors duration-rapido hover:bg-superficie-sutil",
                activos.lapso === null ? "font-medium text-texto-titulo" : "text-texto-cuerpo",
              )}
            >
              <span>Pendientes y hechas en dos semanas</span>
              {activos.lapso === null && <span className="shrink-0 text-acento">✓</span>}
            </button>
            <SelectorDeLapso
              lapso={activos.lapso ?? { tipo: "anio", fiscalYear: catalogos.anios[Math.floor(catalogos.anios.length / 2)] ?? new Date().getFullYear() }}
              anios={catalogos.anios}
              alAplicar={(l) => navegar({ lapso: l })}
            />
          </div>
        </Desplegable>
      )}

      {hayFiltros && (
        <button
          type="button"
          onClick={() => navegar({ estado: [], tipo: [], oportunidad: [], lapso: null })}
          className={clsx(
            "rounded-pill px-2.5 py-1.5 text-xs font-medium text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline",
            atenuado,
          )}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
