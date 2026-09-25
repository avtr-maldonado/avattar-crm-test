"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { Seleccion } from "@/components/ui/formulario";

export type OpcionDeAnalisis = { valor: string; etiqueta: string };

export type FiltrosActivosDeAnalisis = {
  pais: string | null;
  vendedor: string | null;
  anio: number;
  producto: string | null;
  tipo: string | null;
};

/**
 * La barra de filtros de Análisis · país, vendedor, año, producto y tipo.
 *
 * Cinco desplegables nativos que reescriben la URL (INV-10): cambiar uno
 * navega, y lo demás de la URL —la pestaña y las agrupaciones de cada
 * reporte— se conserva tal cual. Con un solo país no se ofrece «País»: no hay
 * nada que elegir.
 */
export function FiltrosDeAnalisis({
  activos,
  catalogos,
  conservar,
}: {
  activos: FiltrosActivosDeAnalisis;
  catalogos: {
    paises: OpcionDeAnalisis[];
    vendedores: OpcionDeAnalisis[];
    anios: number[];
    productos: OpcionDeAnalisis[];
    tipos: OpcionDeAnalisis[];
  };
  /** Los demás parámetros de la URL, que no son filtros y se conservan. */
  conservar: Record<string, string[]>;
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();

  function navegar(cambio: Partial<FiltrosActivosDeAnalisis>) {
    const f = { ...activos, ...cambio };
    const p = new URLSearchParams();
    for (const [clave, valores] of Object.entries(conservar)) for (const v of valores) p.append(clave, v);
    if (f.pais) p.set("pais", f.pais);
    if (f.vendedor) p.set("vendedor", f.vendedor);
    p.set("anio", String(f.anio));
    if (f.producto) p.set("producto", f.producto);
    if (f.tipo) p.set("tipo", f.tipo);
    iniciar(() => router.push(`/analisis?${p.toString()}`));
  }

  const atenuado = navegando ? "opacity-60" : undefined;

  return (
    <div className={clsx("flex flex-wrap items-end gap-3", atenuado)}>
      {catalogos.paises.length > 1 && (
        <Filtro etiqueta="País" htmlFor="f-pais">
          <Seleccion id="f-pais" value={activos.pais ?? ""} onChange={(e) => navegar({ pais: e.target.value || null, vendedor: null })}>
            <option value="">Todos</option>
            {catalogos.paises.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Filtro>
      )}

      <Filtro etiqueta="Vendedor" htmlFor="f-vendedor">
        <Seleccion id="f-vendedor" value={activos.vendedor ?? ""} onChange={(e) => navegar({ vendedor: e.target.value || null })}>
          <option value="">Todos</option>
          {catalogos.vendedores.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Seleccion>
      </Filtro>

      <Filtro etiqueta="Año fiscal" htmlFor="f-anio">
        <Seleccion id="f-anio" value={String(activos.anio)} onChange={(e) => navegar({ anio: Number(e.target.value) })}>
          {catalogos.anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Seleccion>
      </Filtro>

      <Filtro etiqueta="Producto" htmlFor="f-producto">
        <Seleccion id="f-producto" value={activos.producto ?? ""} onChange={(e) => navegar({ producto: e.target.value || null })}>
          <option value="">Todos</option>
          {catalogos.productos.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Seleccion>
      </Filtro>

      <Filtro etiqueta="Tipo de negocio" htmlFor="f-tipo">
        <Seleccion id="f-tipo" value={activos.tipo ?? ""} onChange={(e) => navegar({ tipo: e.target.value || null })}>
          <option value="">Todos</option>
          {catalogos.tipos.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Seleccion>
      </Filtro>
    </div>
  );
}

function Filtro({ etiqueta, htmlFor, children }: { etiqueta: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
