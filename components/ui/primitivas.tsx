import Link from "next/link";
import { clsx } from "clsx";

/**
 * Primitivas del sistema de diseño · §13.4.
 *
 * Todas accesibles por teclado y con estado de foco visible: es una aplicación
 * de trabajo, se usa muchas horas y buena parte sin soltar el teclado.
 *
 * Van juntas en un archivo porque son pequeñas y se leen mejor de corrido que
 * repartidas en veinte. Cuando alguna crezca —`Table` con ordenamiento,
 * `DateRangePicker`— se muda a su propio módulo.
 */

// ─────────────────────────────────────────────────────────────── StatTile

/**
 * Indicador de encabezado. Etiqueta, cifra grande, subtexto.
 *
 * La cifra lleva `tabular` **siempre**: cuando hay cuatro o cinco en fila, los
 * dígitos de ancho variable las desalinean y la fila se ve torcida (§13.2).
 *
 * `tono` no es decoración. §13.1: si algo es rojo, requiere atención. Un
 * indicador en coral significa que hay algo que atender, no que sea importante.
 */
export function StatTile({
  etiqueta,
  valor,
  subtexto,
  tono = "neutro",
  denso = false,
}: {
  etiqueta: string;
  valor: string;
  subtexto?: string;
  tono?: "neutro" | "acento" | "exito" | "alerta" | "peligro";
  /**
   * Etiqueta y cifra, nada más, en menos alto. Para pantallas donde los
   * indicadores compiten por espacio con lo que de verdad se trabaja —el
   * tablero—. El subtexto no se pierde: pasa al `title`, para quien lo quiera.
   */
  denso?: boolean;
}) {
  const color = {
    neutro: "text-texto-titulo",
    acento: "text-acento",
    exito: "text-exito",
    alerta: "text-navy-500",
    peligro: "text-coral",
  }[tono];

  return (
    <div
      title={denso ? subtexto : undefined}
      className={clsx(
        "rounded-md border border-borde bg-superficie-tarjeta",
        denso ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <p className="eyebrow">{etiqueta}</p>
      <p
        className={clsx(
          "tabular font-semibold leading-none",
          denso ? "mt-0.5 text-lg" : "mt-1 text-h4",
          color,
        )}
      >
        {valor}
      </p>
      {subtexto && !denso && <p className="mt-1.5 text-xs text-texto-tenue">{subtexto}</p>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── Botón

export function Boton({
  children,
  variante = "primario",
  href,
  type = "button",
  onClick,
  disabled,
  className,
  name,
  value,
  form,
  title,
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "fantasma" | "peligro" | "exito";
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /**
   * `name` y `value` en un botón de envío hacen que el botón **lleve su propio
   * dato**. Es lo que permite distinguir «Crear» de «Crear de todos modos» sin
   * un campo oculto que haya que sincronizar con estado.
   */
  name?: string;
  value?: string;
  /** Para enviar un formulario que está fuera del botón, como el pie de un modal. */
  form?: string;
  /** Tooltip nativo: lo que el botón abre o hace, cuando la etiqueta sola no lo dice todo. */
  title?: string;
}) {
  const estilo = clsx(
    "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold",
    "transition-colors duration-rapido ease-estandar disabled:cursor-not-allowed disabled:opacity-50",
    {
      primario: "bg-acento text-acento-texto hover:bg-acento-hover",
      secundario:
        "border border-borde-fuerte bg-superficie-pagina text-texto-cuerpo hover:bg-superficie-sutil",
      fantasma: "text-texto-cuerpo hover:bg-superficie-sutil",
      peligro: "bg-coral text-white hover:brightness-95",
      // Reservado a la decisión buena: marcar ganada. Verde es cumplir (§13.1).
      exito: "bg-exito text-white hover:brightness-95",
    }[variante],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={estilo} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={estilo}
      name={name}
      value={value}
      form={form}
      title={title}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────── Pastilla

/**
 * Pastilla de estado, tipo o bandera.
 *
 * `peligro` está reservado a lo que requiere atención —una bandera de riesgo,
 * un margen bajo el piso—, nunca a destacar algo por bonito.
 */
export function Pastilla({
  children,
  tono = "neutro",
  titulo,
}: {
  children: React.ReactNode;
  tono?: "neutro" | "acento" | "exito" | "alerta" | "peligro";
  titulo?: string;
}) {
  return (
    <span
      title={titulo}
      className={clsx(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium",
        {
          neutro: "bg-superficie-sutil text-texto-tenue",
          acento: "bg-superficie-tinte text-blue-700",
          exito: "bg-exito/10 text-exito",
          alerta: "bg-lima/25 text-navy-700",
          peligro: "bg-coral/10 text-coral",
        }[tono],
      )}
    >
      {children}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────── Avatar

export function Avatar({ iniciales, titulo }: { iniciales: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-pill bg-navy-600 text-[10px] font-semibold text-white"
    >
      {iniciales}
    </span>
  );
}

// ─────────────────────────────────────────────────── Control segmentado

/**
 * Conmutador de vistas. El estado vive en la URL (INV-10), así que cada opción
 * es un enlace: la vista es compartible y el botón de regresar funciona.
 */
export function ControlSegmentado<T extends string>({
  opciones,
  activa,
  hrefDe,
}: {
  opciones: readonly {
    valor: T;
    etiqueta: string;
    /** Cuántos hay detrás de la opción. Un cero no se pinta: sería ruido. */
    contador?: number;
    deshabilitada?: boolean;
  }[];
  activa: T;
  hrefDe: (valor: T) => string;
}) {
  return (
    <div
      role="group"
      className="inline-flex rounded-sm border border-borde bg-superficie-sutil p-0.5"
    >
      {opciones.map((o) =>
        o.deshabilitada ? (
          <span
            key={o.valor}
            title="Disponible en un incremento posterior"
            className="cursor-not-allowed rounded-xs px-3 py-1 text-sm text-texto-tenue opacity-50"
          >
            {o.etiqueta}
          </span>
        ) : (
          <Link
            key={o.valor}
            href={hrefDe(o.valor)}
            aria-current={o.valor === activa ? "page" : undefined}
            className={clsx(
              "rounded-xs px-3 py-1 text-sm transition-colors duration-rapido ease-estandar",
              o.valor === activa
                ? "bg-superficie-pagina font-semibold text-texto-titulo shadow-xs"
                : "text-texto-tenue hover:text-texto-cuerpo",
            )}
          >
            {o.etiqueta}
            {o.contador !== undefined && o.contador > 0 && (
              <span className="tabular ml-1.5 text-xs font-normal text-texto-tenue">
                {o.contador}
              </span>
            )}
          </Link>
        ),
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────── Estado vacío

/**
 * §11 y §13.5 · «Los estados vacíos siempre proponen la acción siguiente.
 * Nunca una pantalla en blanco.»
 *
 * La firma **exige** una acción: no se puede construir un estado vacío mudo.
 * Es la misma idea que `auditedTransaction`: hacer que lo correcto sea lo único
 * expresable.
 */
export function EstadoVacio({
  titulo,
  explicacion,
  accion,
}: {
  titulo: string;
  explicacion: string;
  accion: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-borde-fuerte px-8 py-12 text-center">
      <p className="font-medium text-texto-titulo">{titulo}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-texto-tenue">{explicacion}</p>
      <div className="mt-5 flex justify-center gap-3">{accion}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────── Barra de progreso

export function BarraProgreso({
  fraccion,
  tono = "acento",
}: {
  /** 0 a 1. Se recorta a ese rango: una barra al 140 % no significa nada. */
  fraccion: number;
  tono?: "acento" | "exito" | "peligro";
}) {
  const ancho = Math.max(0, Math.min(1, fraccion)) * 100;
  const color = { acento: "bg-acento", exito: "bg-exito", peligro: "bg-coral" }[tono];

  return (
    <div className="h-1 w-full overflow-hidden rounded-pill bg-superficie-sutil">
      <div className={clsx("h-full rounded-pill", color)} style={{ width: `${ancho}%` }} />
    </div>
  );
}
