import Link from "next/link";
import { clsx } from "clsx";

/**
 * Pestañas del detalle · §11 P-02.
 *
 * El estado vive en la URL (INV-10): cada pestaña es un enlace, así que se
 * puede pegar en un correo —«mira los hitos de esta oportunidad»— y el botón de
 * regresar funciona.
 *
 * ## Las pestañas que todavía no existen se muestran igual
 *
 * Cotización, MEDDIC, Hitos y Documentos llegan con E2 y E3. Aparecen aquí,
 * marcadas, en vez de ocultarse: una pestaña ausente se lee como un defecto o
 * como que el sistema no hace eso. Una pestaña que dice cuándo llega es
 * información, y además evita que el encabezado cambie de forma cuando el
 * incremento aterrice.
 */
export type Pestana = {
  clave: string;
  etiqueta: string;
  /** Cuenta al lado del nombre. Solo se pinta si es mayor que cero. */
  contador?: number;
  /** El incremento en que llega. Si está, la pestaña se ve pero no navega. */
  llegaEn?: string;
};

export function Pestanas({
  pestanas,
  activa,
  hrefDe,
}: {
  pestanas: Pestana[];
  activa: string;
  hrefDe: (clave: string) => string;
}) {
  return (
    <nav aria-label="Secciones de la oportunidad" className="border-b border-borde">
      <ul className="flex gap-1 overflow-x-auto">
        {pestanas.map((p) => {
          const esActiva = p.clave === activa;
          const contenido = (
            <>
              {p.etiqueta}
              {p.contador !== undefined && p.contador > 0 && (
                <span className="tabular ml-1.5 rounded-pill bg-superficie-sutil px-1.5 py-0.5 text-xs text-texto-tenue">
                  {p.contador}
                </span>
              )}
            </>
          );

          if (p.llegaEn) {
            return (
              <li key={p.clave}>
                <span
                  title={`Disponible en ${p.llegaEn}`}
                  className="inline-flex cursor-not-allowed items-center whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-texto-tenue opacity-55"
                >
                  {contenido}
                </span>
              </li>
            );
          }

          return (
            <li key={p.clave}>
              <Link
                href={hrefDe(p.clave)}
                aria-current={esActiva ? "page" : undefined}
                className={clsx(
                  "inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm",
                  "transition-colors duration-rapido ease-estandar",
                  esActiva
                    ? "border-acento font-semibold text-texto-titulo"
                    : "border-transparent text-texto-tenue hover:border-borde-fuerte hover:text-texto-cuerpo",
                )}
              >
                {contenido}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
