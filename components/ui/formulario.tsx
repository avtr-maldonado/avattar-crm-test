"use client";

import clsx from "clsx";
import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SIN_CORRECCIONES,
  corregir,
  problemaPendiente,
  type Problema,
  type ResultadoAccion,
} from "@/lib/acciones";

/**
 * Etiqueta, control, anotación y problema.
 *
 * ## La anotación es el patrón central de esta pantalla
 *
 * A la derecha de cada campo, en versalitas tenues, va lo que el sistema
 * **hizo con lo que acabas de escribir**: `existente` cuando reconoció la
 * empresa, `nueva` cuando la va a crear, `sugerido` cuando el nombre lo puso
 * él, `T4 2026` cuando dedujo el trimestre de la fecha. No es decoración: es
 * la única forma de que quien captura sepa, antes de enviar, si está creando
 * un duplicado o reusando lo que ya existe.
 */
export function Campo({
  etiqueta,
  htmlFor,
  problema,
  anotacion,
  tonoAnotacion = "tenue",
  ayuda,
  ayudaEmergente,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  problema?: string;
  anotacion?: ReactNode;
  tonoAnotacion?: "tenue" | "exito" | "acento" | "alerta";
  ayuda?: string;
  /** Un icono junto a la etiqueta que despliega una explicación (`AyudaEmergente`). */
  ayudaEmergente?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={htmlFor}
          className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue"
        >
          {etiqueta}
        </label>
        {ayudaEmergente}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">{children}</div>
        {anotacion && (
          <span
            className={clsx(
              "shrink-0 whitespace-nowrap text-xs font-medium",
              {
                tenue: "text-texto-tenue",
                exito: "text-exito",
                acento: "text-acento",
                alerta: "text-navy-500",
              }[tonoAnotacion],
            )}
          >
            {anotacion}
          </span>
        )}
      </div>

      {ayuda && !problema && <p className="text-xs text-texto-tenue">{ayuda}</p>}
      {problema && (
        <p role="alert" className="text-xs font-medium text-peligro">
          {problema}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-sm border bg-superficie-pagina px-3 py-2 text-sm text-texto-cuerpo " +
  "outline-none transition-colors duration-rapido ease-estandar placeholder:text-gray-40 " +
  "focus:border-acento focus:shadow-ring disabled:bg-superficie-sutil disabled:text-texto-tenue";

function borde(malo?: string) {
  return malo ? "border-peligro" : "border-borde";
}

export function Entrada({
  problema,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { problema?: string }) {
  return <input {...props} className={clsx(CONTROL, borde(problema), className)} />;
}

export function AreaDeTexto({
  problema,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { problema?: string }) {
  return <textarea rows={3} {...props} className={clsx(CONTROL, borde(problema), className)} />;
}

export function Seleccion({
  problema,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { problema?: string }) {
  return (
    <select {...props} className={clsx(CONTROL, borde(problema), "pr-8", className)}>
      {children}
    </select>
  );
}

export function Casilla({
  etiqueta,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-cuerpo">
      <input
        type="checkbox"
        {...props}
        className={clsx(
          "size-4 rounded-xs border-borde-fuerte text-acento focus:shadow-ring",
          className,
        )}
      />
      {etiqueta}
    </label>
  );
}

/**
 * Ventana modal, sobre el `<dialog>` nativo.
 *
 * `showModal()` da gratis —y mejor de lo que se hace a mano— la trampa de foco,
 * el cierre con Escape, el `inert` sobre el resto de la página y la devolución
 * del foco a lo que la abrió. La versión artesanal de todo eso son cuarenta
 * líneas de `useEffect` que se rompen en cuanto aparece un `<select>` nativo
 * dentro.
 *
 * **No cierra al pulsar el fondo, a propósito.** Es un patrón común, pero aquí
 * el modal contiene captura: un clic desviado destruiría lo tecleado sin que
 * nada lo advirtiera. Escape sigue funcionando —es una tecla que se pulsa
 * queriendo— y están la ✕ y el botón de cancelar.
 */
export function Panel({
  titulo,
  subtitulo,
  abierto,
  alCerrar,
  ancho = "md",
  pie,
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  abierto: boolean;
  alCerrar: () => void;
  ancho?: "md" | "lg";
  pie?: ReactNode;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;

    if (abierto && !el.open) el.showModal();
    if (!abierto && el.open) el.close();
  }, [abierto]);

  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      // Escape dispara `cancel` antes de cerrar: se atiende ahí para que el
      // estado del padre no se quede creyendo que sigue abierto.
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      className={clsx(
        "w-full rounded-lg bg-superficie-tarjeta p-0 text-texto-cuerpo shadow-md",
        "backdrop:bg-navy-950/45 backdrop:backdrop-blur-[2px]",
        ancho === "lg" ? "max-w-3xl" : "max-w-xl",
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-borde px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-h4 font-semibold leading-tight text-texto-titulo">
            {titulo}
          </h2>
          {subtitulo && <p className="mt-1 text-xs text-texto-tenue">{subtitulo}</p>}
        </div>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar"
          className="-m-1.5 rounded-sm p-1.5 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-cuerpo focus:shadow-ring focus:outline-none"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="px-6 py-5">{children}</div>

      {pie && (
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-borde bg-superficie-sutil px-6 py-4">
          {pie}
        </footer>
      )}
    </dialog>
  );
}

/**
 * Los problemas que no pertenecen a ningún campo: compuertas, autorización,
 * conflictos.
 *
 * Van **dentro** del formulario y no en un modal aparte, porque §13.5 pide que
 * las alertas se vean mientras se teclea.
 */
export function AvisosDeAccion({ resultado }: { resultado: ResultadoAccion<unknown> | null }) {
  if (!resultado || resultado.ok) return null;
  const generales: Problema[] = resultado.problemas.filter((p) => !p.campo);
  if (generales.length === 0) return null;

  const compuerta = resultado.motivo === "COMPUERTA";

  return (
    <div
      role="alert"
      className={clsx(
        "rounded-sm border px-3.5 py-3",
        compuerta ? "border-borde-fuerte bg-superficie-tinte" : "border-peligro bg-coral/[0.06]",
      )}
    >
      {compuerta && (
        <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-navy-500">
          Falta para entrar a esa etapa
        </p>
      )}
      <ul className={clsx("flex flex-col gap-1 text-sm", compuerta && "list-disc pl-4")}>
        {generales.map((p) => (
          <li key={p.mensaje} className="text-texto-cuerpo">
            {p.mensaje}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Envía la acción sin que React reinicie el formulario.
 *
 * Con `<form action={enviar}>`, React 19 reinicia los campos no controlados en
 * cuanto la acción termina, y termina también cuando devuelve `VALIDACION`: a
 * quien olvidó la fecha se le borraban el importe, el tipo y el cargo que sí
 * había capturado. Enviar desde `onSubmit`, dentro de una transición, evita
 * ese reinicio y conserva el estado pendiente de `useActionState`. El botón
 * que disparó el envío viaja también en el `FormData`, para que «Crear de
 * todos modos» siga llegando como `omitirCompuerta`.
 */
export function useEnvioQueConserva(enviar: (form: FormData) => void) {
  return useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const boton = (e.nativeEvent as SubmitEvent).submitter;
      const datos = new FormData(e.currentTarget, boton);
      startTransition(() => enviar(datos));
    },
    [enviar],
  );
}

/**
 * Los problemas por campo, apagándose conforme se corrigen.
 *
 * `alCambiar` va en el `<form>`: los eventos de cambio suben desde cada control,
 * así que un solo manejador atiende a todos, también a los no controlados. Lo
 * que no dispara eventos —lo que resuelve un autocompletado y viaja oculto— se
 * apaga a mano con `corregir`. La regla de qué se apaga y cuándo vuelve a
 * encenderse es pura y está probada en `lib/acciones`.
 */
export function useProblemas(resultado: ResultadoAccion<unknown> | null) {
  const [correcciones, setCorrecciones] = useState(SIN_CORRECCIONES);

  const corregirCampo = useCallback(
    (campo: string) => setCorrecciones((c) => corregir(c, resultado, campo)),
    [resultado],
  );

  return {
    problema: (campo: string) => problemaPendiente(resultado, correcciones, campo),
    corregir: corregirCampo,
    alCambiar: (e: React.FormEvent<HTMLFormElement>) => {
      const control = e.target as HTMLInputElement | HTMLSelectElement;
      if (control.name) corregirCampo(control.name);
    },
    reiniciar: () => setCorrecciones(SIN_CORRECCIONES),
  };
}
