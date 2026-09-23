"use client";

import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar } from "@/components/ui/avisos";
import { Icono } from "@/components/ui/iconos";

export type OpcionDeCampo = { valor: string; etiqueta: string; deshabilitada?: boolean };

/**
 * Un dato de la ficha que se corrige sin abrir nada · P-02.
 *
 * ## Por qué en su lugar y no en el panel de edición
 *
 * Mover el cierre estimado una semana es el cambio más frecuente de toda la
 * pantalla, y hacerlo costaba abrir un formulario de nueve campos, encontrar
 * el que importa y guardar los nueve. Aquí se pulsa el dato, se elige, y se
 * guardó. El panel completo sigue existiendo para cuando de verdad se está
 * editando la oportunidad entera.
 *
 * ## Qué pasa cuando el servidor dice que no
 *
 * El valor vuelve al que tenía y el aviso dice por qué. No se deja en pantalla
 * un valor que no está guardado: la ficha es lo que la gente lee para decidir,
 * y una ficha que miente es peor que una que tarda medio segundo.
 *
 * La autorización, `RN-29` y el resto de las reglas siguen donde estaban, en
 * `editarOportunidad`: esto es un control, no un atajo.
 */
export function DatoEditable({
  etiqueta,
  campo,
  valor,
  texto,
  opciones,
  tipo = "select",
  editable = true,
  guardar,
}: {
  etiqueta: string;
  /** El nombre que entiende `cambioDeCampo`, no el de la columna. */
  campo: string;
  /** El valor que lleva el control. */
  valor: string;
  /** Lo que se lee cuando no se está editando. */
  texto: string;
  opciones?: OpcionDeCampo[];
  tipo?: "select" | "date";
  /**
   * Con `false` se pinta como cualquier otro dato, sin nada que invite a
   * pulsarlo. Ofrecer el control a quien el servidor va a rechazar es prometer
   * algo que no se puede cumplir (`Q-13`).
   */
  editable?: boolean;
  guardar: (campo: string, valor: string) => Promise<ResultadoAccion>;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, iniciar] = useTransition();
  // El valor con el que se abrió: sirve para saber si hubo cambio y para no
  // avisar de nada cuando alguien abre y cierra sin tocar.
  const original = useRef(valor);

  function aplicar(nuevo: string) {
    setEditando(false);
    if (nuevo === original.current) return;

    iniciar(async () => {
      const r = await guardar(campo, nuevo);
      if (r.ok) {
        original.current = nuevo;
        return;
      }
      // `revalidatePath` no corre si la acción falló, así que la ficha sigue
      // mostrando el valor viejo: no hay nada que revertir, solo que decir.
      const problema = r.problemas[0]?.mensaje ?? "No se pudo guardar.";
      avisar.error(`${etiqueta}: no se guardó`, problema);
    });
  }

  if (!editable) {
    return (
      <div>
        <dt className="eyebrow">{etiqueta}</dt>
        <dd className={clsx("mt-0.5 text-sm text-texto-cuerpo", tipo === "date" && "tabular")}>
          {texto}
        </dd>
      </div>
    );
  }

  if (!editando) {
    return (
      <div>
        <dt className="eyebrow">{etiqueta}</dt>
        <dd className="mt-0.5">
          <button
            type="button"
            onClick={() => setEditando(true)}
            disabled={guardando}
            className={clsx(
              "group -mx-1 flex w-full items-center gap-1 rounded-xs px-1 py-0.5 text-left",
              "text-sm text-texto-cuerpo transition-colors duration-rapido ease-estandar",
              "hover:bg-superficie-sutil focus:shadow-ring focus:outline-none",
              guardando && "opacity-60",
            )}
          >
            <span className={clsx("min-w-0 truncate", tipo === "date" && "tabular")}>{texto}</span>
            <Icono
              nombre="lapiz"
              className="size-3 shrink-0 text-texto-tenue opacity-0 transition-opacity duration-rapido group-hover:opacity-100 group-focus:opacity-100"
            />
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="eyebrow">
        <label htmlFor={`campo-${campo}`}>{etiqueta}</label>
      </dt>
      <dd className="mt-0.5">
        {tipo === "select" ? (
          <select
            id={`campo-${campo}`}
            autoFocus
            defaultValue={valor}
            onChange={(e) => aplicar(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
            onBlur={() => setEditando(false)}
            className={CONTROL}
          >
            {opciones?.map((o) => (
              <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`campo-${campo}`}
            type="date"
            autoFocus
            defaultValue={valor}
            // Enter guarda, Escape descarta. Es lo que hace cualquiera que
            // acaba de teclear una fecha sin pensar en el ratón.
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditando(false);
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar(e.currentTarget.value);
              }
            }}
            onBlur={(e) => aplicar(e.target.value)}
            className={clsx(CONTROL, "tabular")}
          />
        )}
      </dd>
    </div>
  );
}

const CONTROL =
  "w-full rounded-sm border border-acento bg-superficie-pagina px-2 py-1 text-sm " +
  "text-texto-cuerpo shadow-ring outline-none";
