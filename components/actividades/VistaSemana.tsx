import clsx from "clsx";
import { estadoDeAgenda, type RelojDeAgenda } from "@/lib/domain/agenda";
import { etiquetaDeDuracion } from "@/lib/tiempo";
import { Boton, EstadoVacio } from "@/components/ui/primitivas";
import { EnlaceAOportunidad } from "./comun";
import { rangoDeHoras, type ActividadDeTablero, type EditorDe, type Formatos } from "./formato";

export type DiaDeSemana = {
  fecha: Date;
  dia: number;
  esHoy: boolean;
  actividades: ActividadDeTablero[];
};

/** Verde lo hecho, coral lo vencido, azul lo que corre; lo que viene, en blanco. */
const BLOQUE = {
  realizada: "border-exito/40 bg-exito/10",
  vencida: "border-coral/40 bg-coral/10",
  en_progreso: "border-acento/40 bg-superficie-tinte",
  por_realizar: "border-borde bg-superficie-tarjeta",
} as const;

/**
 * Vista de semana · siete columnas de lunes a domingo (decisiones §42). Cada
 * bloque es una actividad con su rango de horas; la cabecera suma las horas del
 * día. Es un registro, no una lista de pendientes: lo hecho se queda, en verde.
 */
export function VistaSemana({
  dias,
  total,
  reloj,
  f,
  editorDe,
}: {
  dias: DiaDeSemana[];
  total: number;
  reloj: RelojDeAgenda;
  f: Formatos;
  editorDe: EditorDe;
}) {
  if (total === 0) {
    return (
      <EstadoVacio
        titulo="Semana sin actividades"
        explicacion="No hay nada registrado ni agendado entre el lunes y el domingo de esta semana. Las actividades se agendan desde cada oportunidad."
        accion={
          <Boton href="/oportunidades" variante="secundario">
            Ir al pipeline
          </Boton>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {dias.map((d) => {
        const minutos = d.actividades.reduce((acc, a) => acc + (a.durationMin ?? 0), 0);
        return (
          <section
            key={d.fecha.toISOString()}
            className={clsx("min-w-0 rounded-md border p-2.5", d.esHoy ? "border-acento bg-superficie-tinte/60" : "border-borde bg-superficie-tarjeta")}
          >
            <header className="flex items-baseline justify-between gap-2">
              <p className={clsx("tabular text-sm font-semibold", d.esHoy ? "text-acento" : "text-texto-titulo")}>
                {d.dia} <span className="eyebrow font-medium">{f.diaSemana.format(d.fecha)}</span>
              </p>
              <span className="tabular text-xs text-texto-tenue">{minutos > 0 ? etiquetaDeDuracion(minutos) : ""}</span>
            </header>

            <ul className="mt-2.5 space-y-1.5">
              {d.actividades.map((a) => {
                const estado = estadoDeAgenda(a, reloj);
                return (
                  <li key={a.id} className={clsx("rounded-sm border px-2 py-1.5 text-xs", BLOQUE[estado])}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="tabular text-texto-tenue">{rangoDeHoras(a, f)}</span>
                      {editorDe(a)}
                    </div>
                    <p className={clsx("font-medium", estado === "realizada" ? "text-texto-tenue line-through" : "text-texto-cuerpo")}>{a.subject}</p>
                    <EnlaceAOportunidad a={a} className="block truncate text-texto-tenue hover:text-acento" />
                  </li>
                );
              })}
              {d.actividades.length === 0 ? <li className="py-3 text-center text-xs text-texto-tenue">—</li> : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
