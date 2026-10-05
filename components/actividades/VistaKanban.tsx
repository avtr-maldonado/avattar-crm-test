import clsx from "clsx";
import { agruparPorEstado, ETIQUETA_DE_ESTADO_DE_AGENDA, type EstadoDeAgenda, type RelojDeAgenda } from "@/lib/domain/agenda";
import { Avatar, Pastilla } from "@/components/ui/primitivas";
import { EnlaceAOportunidad } from "./comun";
import { duracionDe, rangoDeHoras, type ActividadDeTablero, type EditorDe, type Formatos } from "./formato";

/** Las columnas, en el orden del trabajo: lo que viene, lo que está pasando, lo hecho y la deuda. */
const COLUMNAS: readonly EstadoDeAgenda[] = ["por_realizar", "en_progreso", "realizada", "vencida"];

/** El color de cada columna va en la tarjeta, no en la cabecera: verde lo hecho, coral lo vencido, azul lo que corre. */
const TARJETA: Record<EstadoDeAgenda, string> = {
  por_realizar: "border-borde bg-superficie-tarjeta",
  en_progreso: "border-acento/40 bg-superficie-tinte",
  realizada: "border-exito/40 bg-exito/10",
  vencida: "border-coral/40 bg-coral/10",
};

const PASTILLA: Record<EstadoDeAgenda, "neutro" | "acento" | "exito" | "peligro"> = {
  por_realizar: "neutro",
  en_progreso: "acento",
  realizada: "exito",
  vencida: "peligro",
};

/**
 * Vista de kanban · cuatro columnas por estado (decisiones §42). No se
 * arrastra: el estado se calcula, no se captura (INV-11); una actividad cambia
 * de columna al marcarla hecha o reprogramarla desde su lápiz.
 */
export function VistaKanban({
  actividades,
  reloj,
  f,
  editorDe,
}: {
  actividades: ActividadDeTablero[];
  reloj: RelojDeAgenda;
  f: Formatos;
  editorDe: EditorDe;
}) {
  const grupos = agruparPorEstado(actividades, reloj);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNAS.map((estado) => {
        const lista = grupos[estado];
        return (
          <section key={estado} className="min-w-0 rounded-md border border-borde bg-superficie-sutil p-3">
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-texto-titulo">{ETIQUETA_DE_ESTADO_DE_AGENDA[estado]}</h2>
              <Pastilla tono={lista.length > 0 ? PASTILLA[estado] : "neutro"}>{lista.length}</Pastilla>
            </header>
            {lista.length === 0 ? (
              <p className="rounded-sm border border-dashed border-borde px-3 py-6 text-center text-xs text-texto-tenue">Nada aquí</p>
            ) : (
              <ul className="space-y-2">
                {lista.map((a) => (
                  <li key={a.id} className={clsx("rounded-md border px-3 py-2.5 text-xs", TARJETA[estado])}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={clsx("text-sm font-medium", estado === "realizada" ? "text-texto-tenue line-through" : "text-texto-titulo")}>
                        {a.subject}
                      </p>
                      {editorDe(a)}
                    </div>
                    <EnlaceAOportunidad a={a} className="mt-0.5 block truncate text-texto-tenue hover:text-acento" />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="tabular text-texto-tenue">
                        {f.fecha.format(a.startsAt)} · {rangoDeHoras(a, f)}
                        {duracionDe(a) ? ` · ${duracionDe(a)}` : ""}
                      </span>
                      <Avatar iniciales={a.user.initials} titulo={a.user.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
