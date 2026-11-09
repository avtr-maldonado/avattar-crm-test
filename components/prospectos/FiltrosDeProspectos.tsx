"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Desplegable, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";
import { Boton } from "@/components/ui/primitivas";
import { hrefDeProspectos, type FiltrosDeProspectos as Filtros } from "@/lib/filters/leads";

type Clave = "etapa" | "canal" | "campana" | "vendedor" | "ingreso";

/**
 * Las pastillas de Prospectos · etapa, canal, campaña, vendedor e ingreso
 * (decisiones §58). Las mismas que el pipeline y Análisis: cada una dice lo que
 * tiene aplicado, aplicar navega una vez reescribiendo la URL (INV-10), y la
 * vista, el prospecto abierto y «solo los míos» se conservan.
 */
export function FiltrosDeProspectos({
  activos,
  conservar,
  catalogos,
}: {
  activos: Filtros;
  /** Lo que no es filtro y sobrevive: `vista`, `p`. */
  conservar: Record<string, string | undefined>;
  catalogos: { etapas: OpcionDeFiltro[]; canales: OpcionDeFiltro[]; campanas: OpcionDeFiltro[]; vendedores: OpcionDeFiltro[] };
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState<Clave | null>(null);

  function navegar(cambio: Partial<Filtros>) {
    setAbierto(null);
    iniciar(() => router.push(hrefDeProspectos({ ...activos, ...cambio }, conservar)));
  }

  const hayFiltros = activos.etapas.length + activos.canales.length + activos.campanas.length + activos.vendedores.length > 0 || activos.desde !== null || activos.hasta !== null;
  const atenuado = navegando ? "opacity-60" : undefined;
  const ingreso = activos.desde || activos.hasta ? `${activos.desde ?? "…"} – ${activos.hasta ?? "…"}` : "todo";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Desplegable className={atenuado} etiqueta="Etapa" resumen={activos.etapas.length === 0 ? "abiertas" : resumenDeVarios(catalogos.etapas, activos.etapas)} activo={activos.etapas.length > 0} abierto={abierto === "etapa"} alAlternar={(v) => setAbierto(v ? "etapa" : null)} ancho="w-56">
        <ListaDeVarios opciones={catalogos.etapas} elegidosAlAbrir={activos.etapas} vacio="Sin etapas." alAplicar={(v) => navegar({ etapas: v as Filtros["etapas"] })} />
      </Desplegable>

      <Desplegable className={atenuado} etiqueta="Canal" resumen={resumenDeVarios(catalogos.canales, activos.canales)} activo={activos.canales.length > 0} abierto={abierto === "canal"} alAlternar={(v) => setAbierto(v ? "canal" : null)} ancho="w-56">
        <ListaDeVarios opciones={catalogos.canales} elegidosAlAbrir={activos.canales} vacio="Sin canales activos." alAplicar={(v) => navegar({ canales: v })} />
      </Desplegable>

      <Desplegable className={atenuado} etiqueta="Campaña" resumen={resumenDeVarios(catalogos.campanas, activos.campanas)} activo={activos.campanas.length > 0} abierto={abierto === "campana"} alAlternar={(v) => setAbierto(v ? "campana" : null)} ancho="w-64">
        <ListaDeVarios opciones={catalogos.campanas} elegidosAlAbrir={activos.campanas} buscable vacio="Sin campañas activas." alAplicar={(v) => navegar({ campanas: v })} />
      </Desplegable>

      {catalogos.vendedores.length > 0 && (
        <Desplegable className={atenuado} etiqueta="Vendedor" resumen={resumenDeVarios(catalogos.vendedores, activos.vendedores)} activo={activos.vendedores.length > 0} abierto={abierto === "vendedor"} alAlternar={(v) => setAbierto(v ? "vendedor" : null)} ancho="w-64">
          <ListaDeVarios opciones={catalogos.vendedores} elegidosAlAbrir={activos.vendedores} buscable vacio="No hay vendedores en este país." alAplicar={(v) => navegar({ vendedores: v })} />
        </Desplegable>
      )}

      <Desplegable className={atenuado} etiqueta="Ingreso" resumen={ingreso} activo={activos.desde !== null || activos.hasta !== null} abierto={abierto === "ingreso"} alAlternar={(v) => setAbierto(v ? "ingreso" : null)} ancho="w-72">
        <RangoDeIngreso desde={activos.desde} hasta={activos.hasta} alAplicar={(desde, hasta) => navegar({ desde, hasta })} />
      </Desplegable>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => navegar({ etapas: [], canales: [], campanas: [], vendedores: [], desde: null, hasta: null })}
          className={clsx("rounded-pill px-2.5 py-1.5 text-xs font-medium text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline", atenuado)}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Dos fechas y «Aplicar»; se monta al abrir, así que el borrador nace de lo aplicado. */
function RangoDeIngreso({ desde, hasta, alAplicar }: { desde: string | null; hasta: string | null; alAplicar: (desde: string | null, hasta: string | null) => void }) {
  const [d, setD] = useState(desde ?? "");
  const [h, setH] = useState(hasta ?? "");
  const valido = (!d || !h || d <= h) && (d !== "" || h !== "");
  const entrada = "w-full rounded-sm border border-borde bg-superficie-pagina px-2 py-1.5 text-sm tabular outline-none focus:border-acento focus:shadow-ring";
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-texto-tenue">
          Desde
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-tenue">
          Hasta
          <input type="date" value={h} onChange={(e) => setH(e.target.value)} className={entrada} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-borde pt-2">
        <button type="button" onClick={() => alAplicar(null, null)} className="text-xs text-texto-tenue underline-offset-2 hover:underline">
          Todo
        </button>
        <Boton onClick={() => alAplicar(d || null, h || null)} disabled={!valido} className="px-3 py-1 text-xs">
          Aplicar
        </Boton>
      </div>
    </div>
  );
}
