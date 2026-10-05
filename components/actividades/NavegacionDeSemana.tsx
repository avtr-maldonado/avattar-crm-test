import Link from "next/link";
import clsx from "clsx";
import { sumarDias } from "@/lib/tiempo";
import { rangoDeSemana } from "./formato";

/**
 * La tira de la vista semanal (decisiones §42, §44): la semana que se ve, y
 * las flechas para ir a la anterior o a la siguiente. Son enlaces: la semana
 * vive en la URL (INV-10) y el servidor lee esa semana, no otra. «Hoy» vuelve
 * a la semana en curso y solo aparece cuando no se está en ella.
 */
export function NavegacionDeSemana({
  lunes,
  lunesDeHoy,
  hrefDe,
}: {
  /** El lunes de la semana que se ve, `YYYY-MM-DD` en la zona de la oficina. */
  lunes: string;
  lunesDeHoy: string;
  hrefDe: (lunes: string) => string;
}) {
  const esActual = lunes === lunesDeHoy;
  return (
    <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
      <Flecha href={hrefDe(sumarDias(lunes, -7))} titulo="Semana anterior" direccion="izquierda" />
      <p className={clsx("tabular min-w-[12rem] text-center text-sm font-semibold", esActual ? "text-texto-titulo" : "text-texto-cuerpo")}>
        {rangoDeSemana(lunes)}
      </p>
      <Flecha href={hrefDe(sumarDias(lunes, 7))} titulo="Semana siguiente" direccion="derecha" />
      {esActual ? null : (
        <Link
          href={hrefDe(lunesDeHoy)}
          className="rounded-sm border border-borde px-2.5 py-1 text-xs font-medium text-texto-cuerpo transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-titulo focus:shadow-ring focus:outline-none"
        >
          Hoy
        </Link>
      )}
    </nav>
  );
}

function Flecha({ href, titulo, direccion }: { href: string; titulo: string; direccion: "izquierda" | "derecha" }) {
  return (
    <Link
      href={href}
      aria-label={titulo}
      title={titulo}
      className="inline-flex size-8 items-center justify-center rounded-sm border border-borde text-texto-cuerpo transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-titulo focus:shadow-ring focus:outline-none"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d={direccion === "izquierda" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
