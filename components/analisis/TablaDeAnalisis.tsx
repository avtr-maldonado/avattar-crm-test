import Link from "next/link";
import clsx from "clsx";
import { ControlSegmentado } from "@/components/ui/primitivas";

export type CeldaDeAnalisis =
  | string
  | {
      texto: string;
      tono?: "titulo" | "tenue" | "exito" | "peligro" | "acento";
      /** 0 a 1: pinta una barra corta detrás del texto, para leer proporciones sin sumar. */
      barra?: number;
      negrita?: boolean;
      /** La celda es un enlace: el folio que lleva a la oportunidad. */
      href?: string;
    };

export type ColumnaDeAnalisis = { titulo: string; alineacion?: "izquierda" | "derecha" };

export type FilaDeAnalisis = {
  clave: string;
  celdas: CeldaDeAnalisis[];
  /** `grupo` es una fila de cabecera (el trimestre); `detalle`, las que cuelgan de ella. */
  nivel?: "grupo" | "detalle";
};

/**
 * Una tabla de reporte: columnas, filas y una fila de total.
 *
 * Sin estado ni hooks: la agrupación se cambia con enlaces (`ControlSegmentado`
 * con `hrefDe`), así que un reporte es una URL y se puede pegar en un correo.
 * Todas las cifras llegan formateadas del servidor; aquí no se calcula nada.
 */
export function TablaDeAnalisis({
  columnas,
  filas,
  total,
  vacio,
}: {
  columnas: ColumnaDeAnalisis[];
  filas: FilaDeAnalisis[];
  total?: CeldaDeAnalisis[];
  /** Lo que se dice cuando no hay filas: qué falta, no «sin datos». */
  vacio: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-borde">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-superficie-sutil">
          <tr className="text-left">
            {columnas.map((c) => (
              <th
                key={c.titulo}
                scope="col"
                className={clsx(
                  "whitespace-nowrap px-3 py-2 text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue",
                  c.alineacion === "derecha" && "text-right",
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr className="border-t border-borde">
              <td colSpan={columnas.length} className="px-5 py-8 text-center text-sm text-texto-tenue">
                {vacio}
              </td>
            </tr>
          ) : (
            filas.map((f) => (
              <tr
                key={f.clave}
                className={clsx(
                  "border-t border-borde",
                  f.nivel === "grupo" ? "bg-superficie-sutil font-semibold" : "hover:bg-superficie-sutil",
                )}
              >
                {columnas.map((col, i) => (
                  <Celda
                    key={col.titulo}
                    celda={f.celdas[i] ?? ""}
                    derecha={col.alineacion === "derecha"}
                    sangria={f.nivel === "detalle" && i === 0}
                  />
                ))}
              </tr>
            ))
          )}
        </tbody>
        {total && filas.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 border-borde-fuerte bg-superficie-sutil font-semibold">
              {columnas.map((col, i) => (
                <Celda key={col.titulo} celda={total[i] ?? ""} derecha={col.alineacion === "derecha"} />
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

const COLOR = {
  titulo: "text-texto-titulo",
  tenue: "text-texto-tenue",
  exito: "text-exito",
  peligro: "text-coral",
  acento: "text-acento",
};

function Celda({ celda, derecha, sangria = false }: { celda: CeldaDeAnalisis; derecha: boolean; sangria?: boolean }) {
  const c = typeof celda === "string" ? { texto: celda } : celda;
  const contenido = c.href ? (
    <Link href={c.href} className="font-medium text-acento hover:underline">
      {c.texto}
    </Link>
  ) : (
    c.texto
  );

  return (
    <td
      className={clsx(
        "px-3 py-2",
        derecha && "tabular whitespace-nowrap text-right",
        sangria && "pl-8",
        c.negrita && "font-semibold",
        COLOR[c.tono ?? "titulo"],
      )}
    >
      {c.barra !== undefined ? (
        <span className="relative inline-block min-w-24">
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 rounded-xs bg-acento/15"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, c.barra)) * 100)}%` }}
          />
          <span className="relative px-1">{contenido}</span>
        </span>
      ) : (
        contenido
      )}
    </td>
  );
}

/**
 * Un reporte: título, qué fecha manda, y su conmutador de agrupación cuando
 * lo tiene. El conmutador son enlaces: la agrupación vive en la URL.
 */
export function Reporte({
  titulo,
  fechaQueManda,
  agrupacion,
  children,
}: {
  titulo: string;
  /** Cada rango de fechas dice sobre qué campo aplica; aquí se dice cuál. */
  fechaQueManda: string;
  agrupacion?: {
    etiqueta: string;
    opciones: readonly { valor: string; etiqueta: string }[];
    activa: string;
    hrefDe: (valor: string) => string;
  };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>
          <p className="mt-0.5 text-xs text-texto-tenue">{fechaQueManda}</p>
        </div>
        {agrupacion ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-texto-tenue">{agrupacion.etiqueta}</span>
            <ControlSegmentado
              opciones={agrupacion.opciones}
              activa={agrupacion.activa}
              hrefDe={agrupacion.hrefDe}
            />
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
