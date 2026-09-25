import { Icono } from "./iconos";

/**
 * Un icono de ayuda junto a una etiqueta que despliega una explicación corta.
 *
 * Es un `<details>`: abre y cierra sin JavaScript, se opera con teclado y se
 * cierra con Esc en los navegadores que lo soportan. La explicación es una
 * lista nombre → texto, para campos cuyas opciones no se explican solas, como
 * las categorías de pronóstico (RN-15).
 */
export function AyudaEmergente({
  titulo,
  puntos,
}: {
  /** Lo que oye quien no ve el icono, y el tooltip. */
  titulo: string;
  puntos: { nombre: string; texto: string }[];
}) {
  return (
    <details className="relative inline-block">
      <summary
        aria-label={titulo}
        title={titulo}
        className="flex size-4 cursor-pointer list-none items-center justify-center rounded-full text-texto-tenue transition-colors duration-rapido hover:text-texto-cuerpo focus:shadow-ring focus:outline-none [&::-webkit-details-marker]:hidden"
      >
        <Icono nombre="ayuda" className="size-4" />
      </summary>
      <div
        role="note"
        className="absolute left-0 top-6 z-20 w-72 rounded-md border border-borde bg-superficie-pagina p-3 shadow-md"
      >
        <p className="mb-2 text-xs font-semibold text-texto-titulo">{titulo}</p>
        <dl className="space-y-2">
          {puntos.map((p) => (
            <div key={p.nombre}>
              <dt className="text-xs font-semibold text-texto-titulo">{p.nombre}</dt>
              <dd className="text-xs leading-snug text-texto-cuerpo">{p.texto}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
