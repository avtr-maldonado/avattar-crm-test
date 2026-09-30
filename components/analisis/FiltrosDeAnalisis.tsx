"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Desplegable, ListaDeUno, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeUno, resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";

export type FiltrosActivosDeAnalisis = {
  pais: string[];
  vendedor: string[];
  anio: number;
};

type Clave = "pais" | "vendedor" | "anio";

/**
 * La barra de filtros de Análisis · país, vendedor y año. Producto y tipo de
 * negocio dejaron de ser filtros (decisiones §36); siguen como agrupaciones.
 *
 * Las mismas pastillas que la barra del pipeline (`Desplegable`): cada una
 * dice lo que tiene aplicado, los de varios —país y vendedor— abren una lista de casillas con «Ninguno» y «Aplicar», y aplicar navega una
 * sola vez reescribiendo la URL (INV-10). Nada elegido significa «todos». La
 * pestaña y las agrupaciones de cada reporte se conservan tal cual, leídas de
 * la URL viva.
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
    for (const clave of ["pais", "vendedor", "anio"]) p.delete(clave);
    for (const c of f.pais) p.append("pais", c);
    for (const v of f.vendedor) p.append("vendedor", v);
    p.set("anio", String(f.anio));
    setAbierto(null);
    iniciar(() => router.push(`/analisis?${p.toString()}`));
  }

  const hayFiltros = activos.pais.length + activos.vendedor.length > 0;
  const atenuado = navegando ? "opacity-60" : undefined;
  const anios = catalogos.anios.map((a) => ({ valor: String(a), etiqueta: String(a) }));

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
        etiqueta="Año fiscal"
        resumen={resumenDeUno(anios, String(activos.anio))}
        activo={false}
        abierto={abierto === "anio"}
        alAlternar={(v) => setAbierto(v ? "anio" : null)}
        ancho="w-44"
      >
        <ListaDeUno
          opciones={anios}
          elegido={String(activos.anio)}
          alElegir={(v) => navegar({ anio: v ? Number(v) : activos.anio })}
        />
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
