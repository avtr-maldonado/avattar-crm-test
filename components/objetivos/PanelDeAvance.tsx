import { clsx } from "clsx";

/**
 * El avance acumulado de una métrica · P-08.
 *
 * Es el elemento protagonista de la pantalla, y lo es porque la regla del
 * negocio vive aquí: **lo que se mide es el acumulado del año, no el trimestre
 * suelto.** Un trimestre flojo no se perdona, se arrastra; uno bueno lo paga.
 *
 * ## La marca en la barra
 *
 * La barra va contra la cuota acumulada, así que llena es ir a la par. La marca
 * vertical está donde terminaba la cuota de los trimestres anteriores: si el
 * relleno la pasó, la deuda vieja quedó saldada; si no la alcanza, lo que falta
 * es de antes, no de ahora. Es la única forma de ver la acumulación en vez de
 * leerla en una frase.
 *
 * No hay porcentaje dentro de la barra ni etiquetas flotando: la cifra grande
 * ya dice cuánto, la barra dice cuánto falta, y el pie dice de dónde viene.
 */
export type AvanceVisible = {
  titulo: string;
  /** Lo logrado, ya formateado. La cifra grande. */
  logrado: string;
  /** La cuota acumulada, ya formateada. */
  cuota: string;
  /** 0 a 1; puede pasar de 1 y la barra lo recorta. Nulo si no hay cuota. */
  cumplimiento: number | null;
  /** Dónde cae la cuota anterior dentro de la barra, de 0 a 1. */
  marcaDeArrastre: number | null;
  /** «Entras al T3 debiendo $120,000». Ya redactado por la pantalla. */
  pie: string;
};

export function PanelDeAvance({ avance }: { avance: AvanceVisible }) {
  const { cumplimiento } = avance;
  // §13.1 · verde es cumplir, coral es lo que requiere atención. A la par o
  // arriba, verde; debajo, coral. Sin cuota no hay veredicto que dar.
  const alDia = cumplimiento !== null && cumplimiento >= 1;

  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-texto-titulo">{avance.titulo}</h2>
        <p
          className={clsx(
            "tabular text-sm font-semibold",
            cumplimiento === null ? "text-texto-tenue" : alDia ? "text-exito" : "text-coral",
          )}
        >
          {cumplimiento === null ? "Sin cuota" : `${Math.round(cumplimiento * 100)} %`}
        </p>
      </div>

      <p className="tabular mt-2 text-h3 font-semibold leading-none text-texto-titulo">
        {avance.logrado}
      </p>
      <p className="tabular mt-1 text-xs text-texto-tenue">de {avance.cuota} acumulados</p>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-pill bg-superficie-sutil">
        <div
          className={clsx(
            "h-full rounded-pill transition-[width] duration-base ease-estandar",
            alDia ? "bg-exito" : "bg-acento",
          )}
          style={{ width: `${Math.min(Math.max(cumplimiento ?? 0, 0), 1) * 100}%` }}
        />
        {avance.marcaDeArrastre !== null && (
          <span
            aria-hidden
            title="Hasta aquí llegaba la cuota de los trimestres anteriores"
            className="absolute top-0 h-full w-px bg-navy-500"
            style={{ left: `${Math.min(Math.max(avance.marcaDeArrastre, 0), 1) * 100}%` }}
          />
        )}
      </div>

      <p className="mt-2 text-xs leading-snug text-texto-tenue">{avance.pie}</p>
    </section>
  );
}
