"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Desplegable, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";
import { etiquetaDeLapso, parametrosDeLapso, type Lapso } from "@/lib/filters/lapso";
import { SelectorDeLapso } from "./SelectorDeLapso";

export type FiltrosActivosDeAnalisis = {
  pais: string[];
  vendedor: string[];
  lapso: Lapso;
};

type Clave = "pais" | "vendedor" | "lapso";

/** Lo que el lapso puede escribir en la URL: se borra todo antes de escribir el modo elegido. */
const PARAMETROS_DE_LAPSO = ["anio", "q", "mes", "desde", "hasta"] as const;

/**
 * La barra de filtros de Análisis · país, vendedor y lapso. Producto y tipo de
 * negocio dejaron de ser filtros (decisiones §36); siguen como agrupaciones.
 * El lapso (§45) sustituye al año: año fiscal, trimestre, mes o rango.
 *
 * Las mismas pastillas que la barra del pipeline (`Desplegable`): cada una
 * dice lo que tiene aplicado, los de varios —país y vendedor— abren una lista
 * de casillas con «Ninguno» y «Aplicar», y aplicar navega una sola vez
 * reescribiendo la URL (INV-10). Nada elegido significa «todos». La pestaña y
 * las agrupaciones de cada reporte se conservan tal cual, leídas de la URL viva.
 */
export function FiltrosDeAnalisis({
  activos,
  catalogos,
}: {
  activos: FiltrosActivosDeAnalisis;
  catalogos: {
    paises: OpcionDeFiltro[];
    vendedores: OpcionDeFiltro[];
    anios: number[];
    /** El año fiscal en curso: el lapso por omisión, que no cuenta como filtro aplicado. */
    anioActual: number;
  };
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState<Clave | null>(null);

  function navegar(cambio: Partial<FiltrosActivosDeAnalisis>) {
    const f = { ...activos, ...cambio };
    // Se parte de la URL viva, no de la que se renderizó: las gráficas cambian
    // su agrupación con replaceState y eso no vuelve al servidor.
    const p = new URLSearchParams(window.location.search);
    for (const clave of ["pais", "vendedor", ...PARAMETROS_DE_LAPSO]) p.delete(clave);
    for (const c of f.pais) p.append("pais", c);
    for (const v of f.vendedor) p.append("vendedor", v);
    for (const [clave, valor] of Object.entries(parametrosDeLapso(f.lapso))) {
      if (valor !== null) p.set(clave, valor);
    }
    setAbierto(null);
    iniciar(() => router.push(`/analisis?${p.toString()}`));
  }

  const hayFiltros = activos.pais.length + activos.vendedor.length > 0;
  const atenuado = navegando ? "opacity-60" : undefined;
  const lapsoPorOmision = activos.lapso.tipo === "anio" && activos.lapso.fiscalYear === catalogos.anioActual;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {catalogos.paises.length > 1 && (
        <Desplegable
          className={atenuado}
          etiqueta="País"
          resumen={resumenDeVarios(catalogos.paises, activos.pais)}
          activo={activos.pais.length > 0}
          abierto={abierto === "pais"}
          alAlternar={(v) => setAbierto(v ? "pais" : null)}
          ancho="w-56"
        >
          <ListaDeVarios
            opciones={catalogos.paises}
            elegidosAlAbrir={activos.pais}
            vacio="No operas en ningún país."
            alAplicar={(v) => navegar({ pais: v })}
          />
        </Desplegable>
      )}

      <Desplegable
        className={atenuado}
        etiqueta="Vendedor"
        resumen={resumenDeVarios(catalogos.vendedores, activos.vendedor)}
        activo={activos.vendedor.length > 0}
        abierto={abierto === "vendedor"}
        alAlternar={(v) => setAbierto(v ? "vendedor" : null)}
      >
        <ListaDeVarios
          opciones={catalogos.vendedores}
          elegidosAlAbrir={activos.vendedor}
          buscable
          vacio="No hay nadie activo en este alcance."
          alAplicar={(v) => navegar({ vendedor: v })}
        />
      </Desplegable>

      <Desplegable
        className={atenuado}
        etiqueta="Lapso"
        resumen={etiquetaDeLapso(activos.lapso)}
        activo={!lapsoPorOmision}
        abierto={abierto === "lapso"}
        alAlternar={(v) => setAbierto(v ? "lapso" : null)}
        ancho="w-80"
      >
        <SelectorDeLapso lapso={activos.lapso} anios={catalogos.anios} alAplicar={(l) => navegar({ lapso: l })} />
      </Desplegable>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => navegar({ pais: [], vendedor: [] })}
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
