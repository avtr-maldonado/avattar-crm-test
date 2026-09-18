import Link from "next/link";
import { clsx } from "clsx";
import { ETIQUETA_CATEGORIA } from "@/lib/etiquetas";
import { ControlSegmentado, EstadoVacio } from "@/components/ui/primitivas";
import { TarjetaOportunidad, type DatosTarjeta } from "./TarjetaOportunidad";

/**
 * Vista Forecast de P-01 · un tablero de columnas por mes o por trimestre.
 *
 * Es el mismo lenguaje que el kanban —columnas, cabecera con total y
 * ponderado, las mismas tarjetas— pero la columna es **cuándo** en vez de
 * **en qué etapa**. Quien ya sabe leer el tablero sabe leer esto; no hay que
 * aprender una segunda pantalla.
 *
 * ## La cabecera de cada columna
 *
 * Total abierto y ponderado por etapa (`RN-01`), y debajo una barra con la
 * mezcla del periodo por categoría de pronóstico (`RN-15`): la saturación crece
 * con la certeza —pipeline claro, mejor caso en el azul de marca, compromiso en
 * navy—, un solo matiz en tres intensidades. La barra es la mezcla de **esa**
 * columna, no una comparación entre columnas: para comparar están las cifras.
 * «Omitida» queda fuera de la barra y dentro del total, y el `title` lo dice
 * con números.
 *
 * ## La ventana
 *
 * Seis meses o cuatro trimestres, siempre desde el periodo en curso o más
 * adelante; el pasado del forecast es la columna de vencidas. Las flechas
 * llevan cuántas oportunidades quedan fuera hacia cada lado, para que mover la
 * ventana no sea a ciegas.
 *
 * Presentacional y de servidor: recibe todo formateado.
 */
export type ColumnaVisible = {
  clave: string;
  etiqueta: string;
  /** «en curso», «cierre estimado ya pasado», o nada. */
  nota: string | null;
  cuantas: number;
  total: string;
  ponderado: string;
  /** Fracciones 0 a 1 de la mezcla de la columna, sin lo omitido. */
  barra: { compromiso: number; mejorCaso: number; pipeline: number };
  /** El desglose por categoría en palabras, para el `title` de la barra. */
  desglose: string;
  esVencidas: boolean;
  esActual: boolean;
  oportunidades: DatosTarjeta[];
};

export type Agrupacion = "mes" | "trimestre";

const AGRUPACIONES = [
  { valor: "mes", etiqueta: "Meses" },
  { valor: "trimestre", etiqueta: "Trimestres" },
] as const;

export function Forecast({
  columnas,
  agrupar,
  desplazamiento,
  fueraDeVentana,
  hrefDe,
  accionVacio,
}: {
  columnas: ColumnaVisible[];
  agrupar: Agrupacion;
  desplazamiento: number;
  fueraDeVentana: { antes: number; despues: number };
  hrefDe: (cambio: { agrupar?: Agrupacion; desde?: number }) => string;
  accionVacio: React.ReactNode;
}) {
  const enColumnas = columnas.reduce((n, c) => n + c.cuantas, 0);
  const total = enColumnas + fueraDeVentana.antes + fueraDeVentana.despues;

  if (total === 0) {
    return (
      <EstadoVacio
        titulo="No hay nada abierto que pronosticar"
        explicacion="Con los filtros actuales no queda ninguna oportunidad abierta, así que no hay cierre estimado que acomodar en el calendario."
        accion={accionVacio}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ControlSegmentado
          opciones={AGRUPACIONES}
          activa={agrupar}
          hrefDe={(v) => hrefDe({ agrupar: v, desde: 0 })}
        />

        <nav aria-label="Mover la ventana del forecast" className="flex items-center gap-1">
          <Paso
            href={desplazamiento > 0 ? hrefDe({ desde: desplazamiento - 1 }) : null}
            etiqueta={fueraDeVentana.antes > 0 ? `${fueraDeVentana.antes} antes` : "Anteriores"}
            direccion="atras"
          />
          <Paso href={desplazamiento > 0 ? hrefDe({ desde: 0 }) : null} etiqueta="Hoy" />
          <Paso
            href={hrefDe({ desde: desplazamiento + 1 })}
            etiqueta={fueraDeVentana.despues > 0 ? `${fueraDeVentana.despues} después` : "Siguientes"}
            direccion="adelante"
          />
        </nav>

        <p className="ml-auto text-xs text-texto-tenue">
          {agrupar === "mes" ? "Por mes de cierre estimado" : "Por trimestre fiscal de cierre estimado"}
        </p>
      </div>

      {/* La misma rejilla del kanban: tantas columnas iguales como periodos,
          cada una un contenedor de consulta para que las tarjetas se compacten. */}
      <div
        className="grid gap-3 pb-4 lg:grid-cols-[repeat(var(--columnas),minmax(0,1fr))] xl:gap-4"
        style={{ "--columnas": columnas.length } as React.CSSProperties}
      >
        {columnas.map((c) => (
          <section
            key={c.clave}
            aria-label={c.etiqueta}
            className={clsx(
              "flex flex-col rounded-md [container-name:columna] [container-type:inline-size]",
              c.esVencidas
                ? "bg-coral/[0.05]"
                : c.esActual
                  ? "bg-superficie-tinte"
                  : "bg-superficie-sutil",
            )}
          >
            <header className="border-b border-borde px-3 py-2 col-angosta:px-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h2
                  className={clsx(
                    "text-sm font-semibold leading-snug",
                    c.esVencidas ? "text-coral" : "text-texto-titulo",
                  )}
                >
                  {c.etiqueta}
                </h2>
                <span className="tabular whitespace-nowrap text-xs text-texto-tenue">
                  {c.cuantas === 0 ? "—" : c.cuantas}
                </span>
              </div>
              {c.nota && <p className="text-xs text-texto-tenue">{c.nota}</p>}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-sm font-semibold text-texto-titulo">{c.total}</span>
                <span className="tabular whitespace-nowrap text-xs text-texto-tenue">
                  pond. {c.ponderado}
                </span>
              </div>
              <div
                title={c.desglose}
                className="mt-1.5 flex h-1 overflow-hidden rounded-pill bg-borde"
              >
                <span className="h-full bg-navy-700" style={{ width: `${c.barra.compromiso * 100}%` }} />
                <span className="h-full bg-acento" style={{ width: `${c.barra.mejorCaso * 100}%` }} />
                <span className="h-full bg-blue-200" style={{ width: `${c.barra.pipeline * 100}%` }} />
              </div>
            </header>

            <div className="grid min-h-24 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-1.5 p-1.5 lg:grid-cols-1">
              {c.oportunidades.map((o) => (
                <TarjetaOportunidad key={o.id} o={o} />
              ))}
              {c.oportunidades.length === 0 && (
                <p className="col-span-full px-2 py-6 text-center text-xs text-texto-tenue">
                  Sin cierres estimados aquí
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-texto-tenue">
        <Leyenda color="bg-navy-700">{ETIQUETA_CATEGORIA.COMPROMISO}</Leyenda>
        <Leyenda color="bg-acento">{ETIQUETA_CATEGORIA.MEJOR_CASO}</Leyenda>
        <Leyenda color="bg-blue-200">{ETIQUETA_CATEGORIA.PIPELINE}</Leyenda>
        <span>
          La barra es la mezcla de cada columna por categoría (el juicio del vendedor); el
          ponderado es la probabilidad de la etapa. «Omitida» cuenta en el total y no en la barra.
        </span>
      </div>
    </div>
  );
}

/**
 * Un paso de la ventana. Sin `href` se pinta apagado: no hay nada hacia ese
 * lado, y un enlace que no lleva a ningún lado enseña a desconfiar de los demás.
 */
function Paso({
  href,
  etiqueta,
  direccion,
}: {
  href: string | null;
  etiqueta: string;
  direccion?: "atras" | "adelante";
}) {
  const contenido = (
    <>
      {direccion === "atras" && <span aria-hidden>‹</span>}
      {etiqueta}
      {direccion === "adelante" && <span aria-hidden>›</span>}
    </>
  );
  const base = "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs font-medium";

  if (!href) {
    return (
      <span aria-disabled className={clsx(base, "border-borde text-texto-tenue opacity-50")}>
        {contenido}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={clsx(
        base,
        "border-borde bg-superficie-pagina text-texto-cuerpo transition-colors duration-rapido ease-estandar hover:bg-superficie-sutil",
      )}
    >
      {contenido}
    </Link>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={clsx("inline-block size-2 rounded-xs", color)} />
      {children}
    </span>
  );
}
