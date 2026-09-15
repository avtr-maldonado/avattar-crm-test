import clsx from "clsx";

/**
 * Esqueletos de carga.
 *
 * ## Qué se dibuja y qué no
 *
 * **Solo se pinta en gris lo que de verdad no se sabe todavía.** El título de
 * «Productos» es siempre «Productos»: no depende de ninguna consulta, así que
 * se muestra de una vez. Lo que se ignora hasta que la base responda son los
 * conteos del subtítulo, las cifras de los indicadores y las filas.
 *
 * Esa distinción es la diferencia entre una navegación que se siente inmediata
 * y un destello de gris que se lee como que la aplicación se reinició. Un
 * esqueleto que tapa la pantalla completa —encabezado incluido— destruye la
 * continuidad justo cuando más falta hace.
 *
 * ## Por qué no el componente de shadcn
 *
 * El de shadcn pinta con `bg-muted` y `bg-primary/10`, tokens de su propio
 * tema. Este proyecto no los tiene: su Tailwind mapea a los del manual gráfico
 * de Avattar (§13), que son `superficie-*`, `gray-*` y `acento`. El componente
 * de shadcn se vería invisible o de un gris que no es el de la marca.
 *
 * ## Movimiento
 *
 * `animate-pulse` de Tailwind. `app/globals.css` ya neutraliza toda animación
 * bajo `prefers-reduced-motion` con `!important`, así que esto lo respeta sin
 * hacer nada más (§13.3).
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("block animate-pulse rounded-xs bg-gray-10", className)}
    />
  );
}

/**
 * El contenedor de una pantalla que carga.
 *
 * Lleva `aria-busy` y un texto para lector de pantalla: sin eso, quien navega
 * con lector oye silencio y no sabe si la aplicación está trabajando o si se
 * quedó callada.
 */
export function RegionQueCarga({
  children,
  anuncio = "Cargando…",
}: {
  children: React.ReactNode;
  anuncio?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{anuncio}</span>
      {children}
    </div>
  );
}

/**
 * El encabezado, con el título real.
 *
 * Imita a `BarraSuperior` en alto y estructura para que no salte nada al
 * aparecer el contenido. El título se conoce por la ruta; el subtítulo lleva
 * conteos, y esos sí se esperan.
 */
export function EsqueletoDeEncabezado({ titulo }: { titulo: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-borde bg-superficie-pagina px-8 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-texto-titulo">{titulo}</h1>
        <Esqueleto className="mt-1.5 h-3 w-64" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <Esqueleto className="hidden h-8 w-80 rounded-sm lg:block" />
        <div className="flex items-center gap-2 border-l border-borde pl-4">
          <Esqueleto className="h-8 w-8 rounded-pill" />
          <div className="hidden flex-col gap-1 sm:flex">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-2.5 w-16" />
          </div>
        </div>
      </div>
    </header>
  );
}

/** La fila de indicadores. `columnas` iguala la rejilla real de cada pantalla. */
export function EsqueletoDeIndicadores({
  cuantos = 5,
  columnas = "lg:grid-cols-5",
}: {
  cuantos?: number;
  columnas?: string;
}) {
  return (
    <div className={clsx("grid grid-cols-2 gap-4", columnas)}>
      {Array.from({ length: cuantos }, (_, i) => (
        <div key={i} className="rounded-md border border-borde bg-superficie-tarjeta px-4 py-3">
          <Esqueleto className="h-2.5 w-20" />
          <Esqueleto className="mt-2 h-6 w-28" />
          <Esqueleto className="mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * Una tabla.
 *
 * Las columnas se declaran con anchos distintos a propósito: filas de bloques
 * idénticos se leen como una barra de progreso disfrazada, no como una tabla
 * que está por aparecer.
 */
export function EsqueletoDeTabla({
  filas = 8,
  anchos = ["w-48", "w-32", "w-24", "w-20", "w-16"],
}: {
  filas?: number;
  anchos?: string[];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-borde">
      <div className="flex items-center gap-6 border-b border-borde bg-superficie-sutil px-4 py-2.5">
        {anchos.map((ancho, i) => (
          <Esqueleto key={i} className={clsx("h-2.5", ancho)} />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div
          key={f}
          className="flex items-center gap-6 border-b border-borde px-4 py-3 last:border-b-0"
        >
          {anchos.map((ancho, i) => (
            <Esqueleto key={i} className={clsx("h-3", ancho)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Cuántas tarjetas por columna. Fijo y desigual a propósito: un pipeline real
 * no reparte sus oportunidades en partes iguales, y fingir que sí se ve
 * artificial.
 */
const TARJETAS_POR_COLUMNA = [3, 4, 2, 3, 2];

/**
 * El tablero kanban.
 *
 * Misma rejilla que `TableroKanban`, y por la misma razón: si el esqueleto
 * tuviera columnas fijas con scroll horizontal y el tablero real no, la
 * pantalla cambiaría de forma al cargar. Desde `lg`, tantas columnas iguales
 * como etapas; debajo, franjas apiladas con las tarjetas en rejilla. Las barras
 * grises van en anchos proporcionales, no fijos, para que una columna angosta
 * no las desborde.
 */
export function EsqueletoDeKanban({ columnas = 5 }: { columnas?: number }) {
  return (
    <div
      className="grid gap-3 pb-4 lg:grid-cols-[repeat(var(--etapas),minmax(0,1fr))] xl:gap-4"
      style={{ "--etapas": columnas } as React.CSSProperties}
    >
      {Array.from({ length: columnas }, (_, c) => (
        <div
          key={c}
          className="flex flex-col rounded-md bg-superficie-sutil [container-name:columna] [container-type:inline-size]"
        >
          <header className="border-b border-borde px-3 py-3 col-angosta:px-2">
            <div className="flex items-baseline justify-between gap-2">
              <Esqueleto className="h-3.5 w-3/5" />
              <Esqueleto className="h-2.5 w-1/6" />
            </div>
            <Esqueleto className="mt-2 h-2.5 w-3/4" />
            <div className="mt-2 h-0.5 rounded-pill bg-borde-fuerte" />
          </header>

          <div className="grid min-h-24 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 p-2 lg:grid-cols-1 col-angosta:p-1.5">
            {Array.from({ length: TARJETAS_POR_COLUMNA[c % TARJETAS_POR_COLUMNA.length] }, (_, t) => (
              <div
                key={t}
                className="rounded-md border border-borde bg-superficie-tarjeta p-3 shadow-xs col-angosta:p-2.5"
              >
                <Esqueleto className="h-3.5 w-full" />
                <Esqueleto className="mt-1.5 h-2.5 w-2/3" />
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <Esqueleto className="h-3.5 w-1/2" />
                  <Esqueleto className="h-3.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Anchos desiguales: nombres de pestaña reales no miden todos lo mismo. */
const ANCHOS_DE_PESTANA = ["w-20", "w-24", "w-28", "w-20", "w-16", "w-24"];

/** Una fila de pestañas, para las pantallas que las tienen. */
export function EsqueletoDePestanas({ cuantas = 6 }: { cuantas?: number }) {
  return (
    <div className="flex gap-6 border-b border-borde">
      {Array.from({ length: cuantas }, (_, i) => (
        <Esqueleto key={i} className={clsx("mb-3 h-3", ANCHOS_DE_PESTANA[i % ANCHOS_DE_PESTANA.length])} />
      ))}
    </div>
  );
}

/** Una tarjeta de contenido con título y renglones. */
export function EsqueletoDeTarjeta({
  renglones = 4,
  className,
}: {
  renglones?: number;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-md border border-borde bg-superficie-tarjeta p-4", className)}>
      <Esqueleto className="h-3 w-32" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: renglones }, (_, i) => (
          <Esqueleto key={i} className={clsx("h-3", i % 3 === 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
