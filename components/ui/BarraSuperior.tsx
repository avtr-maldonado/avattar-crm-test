import type { CountryCode, Role } from "@/lib/dto";
import { ETIQUETA_ROL, NOMBRE_PAIS } from "@/lib/etiquetas";

/**
 * Encabezado de pantalla · §13.5.
 *
 * «Título, subtítulo de contexto (conteos, totales), búsqueda global y selector
 * de país cuando el rol tiene más de uno.»
 *
 * Cada pantalla lo renderiza con su propio título y su subtítulo, porque el
 * contexto que importa cambia: en el pipeline son las abiertas y el ponderado;
 * en contactos, cuántas cuentas y cuántas sin actividad. Un encabezado genérico
 * en el layout no podría saberlo.
 *
 * El selector de país **solo aparece si el usuario tiene más de uno**. Para un
 * gerente de México no es una elección: es ruido que ocupa lugar y sugiere que
 * puede ver Colombia, cuando el alcance por rol se lo impide (AC-05).
 */
export function BarraSuperior({
  titulo,
  subtitulo,
  usuario,
  paisActivo,
}: {
  titulo: string;
  /** Conteos y totales. Es lo que convierte un título en información. */
  subtitulo?: string;
  usuario: { nombre: string; iniciales: string; rol: Role; paises: CountryCode[] };
  paisActivo?: CountryCode;
}) {
  const activo = paisActivo ?? usuario.paises[0];

  return (
    <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-borde bg-superficie-pagina px-8 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-texto-titulo">{titulo}</h1>
        {subtitulo && (
          <p className="tabular truncate text-xs text-texto-tenue">{subtitulo}</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <BuscadorGlobal />

        {usuario.paises.length > 1 && (
          <SelectorDePais paises={usuario.paises} activo={activo} />
        )}

        <div className="flex items-center gap-2 border-l border-borde pl-4">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-pill bg-navy-600 text-xs font-semibold text-white"
          >
            {usuario.iniciales}
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-texto-titulo">{usuario.nombre}</p>
            <p className="text-xs text-texto-tenue">{ETIQUETA_ROL[usuario.rol]}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Búsqueda global. Todavía sin conectar: la búsqueda por trigram es de E1
 * (`pg_trgm` ya está instalado). Se deja visible y deshabilitada para que el
 * encabezado no cambie de forma cuando llegue.
 */
function BuscadorGlobal() {
  return (
    <div className="relative hidden lg:block">
      <input
        type="search"
        disabled
        placeholder="Buscar cuenta, oportunidad, folio…"
        aria-label="Búsqueda global"
        className="w-72 rounded-sm border border-borde bg-superficie-sutil py-1.5 pl-3 pr-12 text-sm text-texto-cuerpo placeholder:text-texto-tenue disabled:cursor-not-allowed"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-xs border border-borde bg-superficie-pagina px-1.5 py-0.5 text-xs text-texto-tenue">
        ⌘K
      </kbd>
    </div>
  );
}

function SelectorDePais({
  paises,
  activo,
}: {
  paises: CountryCode[];
  activo: CountryCode;
}) {
  return (
    <div
      role="group"
      aria-label="País"
      className="flex overflow-hidden rounded-sm border border-borde"
    >
      {paises.map((p) => (
        <span
          key={p}
          title={NOMBRE_PAIS[p]}
          aria-current={p === activo ? "true" : undefined}
          className={`px-3 py-1.5 text-xs font-semibold ${
            p === activo
              ? "bg-acento text-acento-texto"
              : "bg-superficie-pagina text-texto-tenue"
          }`}
        >
          {p}
        </span>
      ))}
    </div>
  );
}
