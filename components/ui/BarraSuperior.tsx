import { BuscadorGlobal } from "./BuscadorGlobal";
import { MenuDeUsuario, type UsuarioDeBarra } from "./MenuDeUsuario";
import { SelectorDePais } from "./SelectorDePais";

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
 * El buscador y el selector de oficina no reciben nada de la pantalla: leen el
 * contexto que el layout del grupo provee (`ProveedorDeBarra`), con la oficina
 * activa y las dos acciones globales. Así ninguna pantalla los cablea.
 */
export function BarraSuperior({
  titulo,
  subtitulo,
  usuario,
}: {
  titulo: string;
  /** Conteos y totales. Es lo que convierte un título en información. */
  subtitulo?: string;
  usuario: UsuarioDeBarra;
}) {
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
        <SelectorDePais />

        {/* Quién opera y con qué alcance; al pulsarlo se abre la ficha con el
            correo, el alcance completo y el cierre de sesión. */}
        <div className="border-l border-borde pl-3">
          <MenuDeUsuario usuario={usuario} />
        </div>
      </div>
    </header>
  );
}
