import Link from "next/link";
import { clsx } from "clsx";

/**
 * Los cuatro trimestres, uno al lado del otro · §10.3.
 *
 * «Con `TRIMESTRAL`, además una tira de T1 a T4 para saltar entre trimestres,
 * con el actual marcado.» Cumple eso y una cosa más: como la medición es
 * acumulada, hace falta poder ver **de dónde viene la deuda**. La tira responde
 * esa pregunta de un vistazo, porque cada trimestre muestra lo suyo, no el
 * acumulado.
 *
 * Cada cuadro es un enlace: el periodo vive en la URL (INV-10).
 */
export type TrimestreVisible = {
  quarter: number;
  href: string;
  /** Lo del trimestre solo, ya formateado. */
  logrado: string;
  cuota: string;
  /** 0 a 1 del trimestre solo. Nulo cuando no hay cuota fijada. */
  cumplimiento: number | null;
  esActual: boolean;
  /** El trimestre en curso todavía no terminó: su cumplimiento es parcial. */
  enCurso: boolean;
};

export function TiraDeTrimestres({ trimestres }: { trimestres: TrimestreVisible[] }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {trimestres.map((t) => {
        const cumplio = t.cumplimiento !== null && t.cumplimiento >= 1;
        return (
          <li key={t.quarter}>
            <Link
              href={t.href}
              aria-current={t.esActual ? "true" : undefined}
              className={clsx(
                "block rounded-md border px-3 py-2.5",
                "transition-colors duration-rapido ease-estandar",
                t.esActual
                  ? "border-acento bg-superficie-tinte"
                  : "border-borde bg-superficie-tarjeta hover:bg-superficie-sutil",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-texto-titulo">T{t.quarter}</p>
                {t.enCurso && <p className="text-xs text-texto-tenue">en curso</p>}
              </div>

              <p className="tabular mt-1.5 text-sm font-semibold text-texto-titulo">{t.logrado}</p>
              <p className="tabular text-xs text-texto-tenue">de {t.cuota}</p>

              <div className="mt-2 h-1 overflow-hidden rounded-pill bg-superficie-sutil">
                <div
                  className={clsx(
                    "h-full rounded-pill",
                    t.cumplimiento === null ? "bg-borde" : cumplio ? "bg-exito" : "bg-acento",
                  )}
                  style={{ width: `${Math.min(Math.max(t.cumplimiento ?? 0, 0), 1) * 100}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
