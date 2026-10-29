"use client";

import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/ui/formulario";

export type TonoDeDesglose = "exito" | "peligro" | "tenue";

/** Un renglón de la franja de arriba: «Ponderado · $328,835». */
export type RenglonDeResumen = { etiqueta: string; texto: string; tono?: TonoDeDesglose };

export type CifraDeDesglose = { texto: string; tono?: TonoDeDesglose };

/** Una fila de la tabla: dos líneas a la izquierda, una nota y las cifras a la derecha. */
export type FilaDeDesglose = {
  clave: string;
  titulo: string;
  subtitulo?: string;
  /** Con enlace, el título lleva a la ficha. */
  href?: string;
  nota?: string;
  cifras: CifraDeDesglose[];
};

export type EncabezadosDeDesglose = {
  principal: string;
  /** Sin él, la columna de nota no existe. */
  nota?: string;
  /** Una etiqueta por cifra; las cifras de cada fila van en el mismo orden. */
  cifras: string[];
};

export type TotalDeDesglose = { etiqueta: string; cifras: string[] };

const COLOR_DE_TONO: Record<TonoDeDesglose | "normal", string> = {
  normal: "text-texto-titulo",
  exito: "text-exito",
  peligro: "text-coral",
  tenue: "text-texto-tenue",
};

/**
 * Qué hay detrás de lo que se pulsó · decisiones §55.
 *
 * El embudo del pipeline y las gráficas de Análisis abrían cada uno su propio
 * popup, con la misma intención y distinta anatomía: uno una tabla con total,
 * el otro una lista. Este es el molde único: arriba la franja de resumen —los
 * renglones del tooltip, la probabilidad de la etapa—, debajo una tabla con
 * las mismas columnas en todas partes y, si hay, el total. Un `<dialog>`
 * modal que cierra con Escape, la ✕ o pulsando fuera (§44). El panel toma el
 * ancho de la tabla (§56): crece hasta el viewport antes de que haga falta
 * scroll horizontal, que queda solo para ventanas más angostas que la tabla.
 *
 * Los datos llegan ya formateados: aquí no se calcula nada.
 */
export function PanelDeDesglose({
  titulo,
  subtitulo,
  resumen = [],
  encabezados,
  filas,
  total,
  vacio,
  abierto,
  alCerrar,
}: {
  titulo: string;
  subtitulo?: string;
  resumen?: RenglonDeResumen[];
  encabezados: EncabezadosDeDesglose;
  filas: FilaDeDesglose[];
  total?: TotalDeDesglose;
  /** Lo que se lee cuando no hay filas con los filtros actuales. */
  vacio: string;
  abierto: boolean;
  alCerrar: () => void;
}) {
  const conNota = encabezados.nota !== undefined;

  return (
    <Panel titulo={titulo} subtitulo={subtitulo} abierto={abierto} alCerrar={alCerrar} ancho="contenido" cerrarAlFondo>
      {resumen.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-sm bg-superficie-sutil px-4 py-3 text-xs">
          {resumen.map((d) => (
            <div key={d.etiqueta} className="min-w-0">
              <dt className="text-texto-tenue">{d.etiqueta}</dt>
              <dd className={clsx("tabular text-sm font-semibold", COLOR_DE_TONO[d.tono ?? "normal"])}>{d.texto}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {filas.length === 0 ? (
        <p className="mt-4 rounded-sm border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-tenue">{vacio}</p>
      ) : (
        <div className="mt-4 max-h-[60vh] overflow-auto rounded-md border border-borde">
          {/* El ancho lo pone la tabla; el scroll de este envoltorio es el respaldo. */}
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-superficie-sutil">
              <tr className="text-left">
                <Th>{encabezados.principal}</Th>
                {conNota && <Th>{encabezados.nota}</Th>}
                {encabezados.cifras.map((c) => (
                  <Th key={c} alineada>
                    {c}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-t border-borde hover:bg-superficie-sutil">
                  <td className="max-w-md px-3 py-2">
                    {f.href ? (
                      <Link href={f.href} className="block truncate font-medium text-texto-titulo hover:text-acento hover:underline">
                        {f.titulo}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-texto-titulo">{f.titulo}</p>
                    )}
                    {f.subtitulo ? <p className="truncate text-xs text-texto-tenue">{f.subtitulo}</p> : null}
                  </td>
                  {conNota && <td className="whitespace-nowrap px-3 py-2 text-texto-cuerpo">{f.nota ?? ""}</td>}
                  {/* Se recorren las columnas, no las cifras: la etiqueta es la llave. */}
                  {encabezados.cifras.map((columna, i) => (
                    <td key={columna} className={clsx("tabular whitespace-nowrap px-3 py-2 text-right font-medium", COLOR_DE_TONO[f.cifras[i]?.tono ?? "normal"])}>
                      {f.cifras[i]?.texto ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {total ? (
              <tfoot>
                <tr className="border-t-2 border-borde-fuerte bg-superficie-sutil font-semibold">
                  <td className="px-3 py-2" colSpan={conNota ? 2 : 1}>
                    {total.etiqueta}
                  </td>
                  {encabezados.cifras.map((columna, i) => (
                    <td key={columna} className="tabular whitespace-nowrap px-3 py-2 text-right">
                      {total.cifras[i] ?? ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </Panel>
  );
}

function Th({ children, alineada = false }: { children: React.ReactNode; alineada?: boolean }) {
  return <th className={clsx("eyebrow whitespace-nowrap px-3 py-2 font-medium", alineada && "text-right")}>{children}</th>;
}
