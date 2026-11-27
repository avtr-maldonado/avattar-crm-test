"use client";

import { useActionState, useRef, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { validarRubrica } from "@/lib/domain/leadScoring";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import { AvisosDeAccion } from "@/components/ui/formulario";

type Guardar = (previo: ResultadoAccion<unknown> | null, form: FormData) => Promise<ResultadoAccion<unknown>>;

export type CriterioDeRubrica = { id: string; name: string; weight: number; active: boolean; usos: number };

/** Una fila de la hoja: las nuevas no traen id ni usos; `clave` las distingue mientras se editan. */
type Fila = { clave: string; id?: string; name: string; weight: number; active: boolean; usos: number };

const aHoja = (criterios: CriterioDeRubrica[]): Fila[] => criterios.map((c) => ({ ...c, clave: c.id }));

/**
 * La rúbrica de calificación de prospectos en Configuración · decisiones §71. Se lee como tabla y se
 * edita como hoja completa: la suma de 100 solo se cumple al final, así que renombres, pesos, altas y
 * bajas viajan juntos. La suma se ve en vivo y «Guardar» se apaga mientras la hoja no valide (la misma
 * regla pura que aplica el servidor). Eliminar es desactivar (MD-05).
 */
export function RubricaDeCalificacion({ criterios, guardar }: { criterios: CriterioDeRubrica[]; guardar: Guardar }) {
  const [editando, setEditando] = useState(false);
  const [hoja, setHoja] = useState<Fila[]>(() => aHoja(criterios));
  // Solo da claves a las filas nuevas mientras se edita: no se pinta, así que no es estado.
  const siguiente = useRef(1);

  const [resultado, enviar, enviando] = useActionState(async (previo: ResultadoAccion<unknown> | null, form: FormData) => {
    const r = await guardar(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    setEditando(false);
    avisar.exito("Rúbrica guardada");
    return r;
  }, null);

  const problemas = validarRubrica(hoja);
  const suma = hoja.filter((f) => f.active).reduce((n, f) => n + (Number.isFinite(f.weight) ? f.weight : 0), 0);

  const abrir = () => {
    setHoja(aHoja(criterios));
    setEditando(true);
  };
  const cambiar = (clave: string, cambio: Partial<Fila>) => setHoja((h) => h.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const agregar = () => {
    const clave = `nuevo-${siguiente.current++}`;
    setHoja((h) => [...h, { clave, name: "", weight: 0, active: true, usos: 0 }]);
  };
  // Una fila nueva que se quita antes de guardar no existía: se borra de la hoja. Las guardadas se desactivan.
  const quitarNueva = (clave: string) => setHoja((h) => h.filter((f) => f.clave !== clave));

  const alEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData();
    form.set("rubrica", JSON.stringify(hoja.map(({ id, name, weight, active }) => ({ ...(id ? { id } : {}), name, weight, active }))));
    enviar(form);
  };

  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-texto-titulo">Rúbrica de calificación</h2>
        {!editando && (
          <Boton variante="secundario" onClick={abrir} className="px-2.5 py-1 text-xs">
            Editar rúbrica
          </Boton>
        )}
      </div>

      {!editando ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-texto-tenue">
              <th className="py-1.5 font-medium">Criterio</th>
              <th className="w-20 py-1.5 text-right font-medium">Peso</th>
              <th className="w-28 py-1.5 text-right font-medium" title="Calificaciones que lo usan">Calificaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {criterios.map((c) => (
              <tr key={c.id}>
                <td className="py-1.5">
                  <span className={c.active ? "text-texto-cuerpo" : "text-texto-tenue line-through"}>{c.name}</span>
                  {!c.active && <span className="ml-2"><Pastilla>Inactivo</Pastilla></span>}
                </td>
                <td className="tabular py-1.5 text-right text-texto-titulo">{c.active ? c.weight : "—"}</td>
                <td className="tabular py-1.5 text-right text-texto-tenue">{c.usos}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-borde-fuerte">
              <td className="py-1.5 text-xs text-texto-tenue">Total de activos</td>
              <td className="tabular py-1.5 text-right font-semibold text-texto-titulo">
                {criterios.filter((c) => c.active).reduce((n, c) => n + c.weight, 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <form onSubmit={alEnviar} className="mt-3 space-y-3">
          <ul className="divide-y divide-borde rounded-md border border-borde">
            {hoja.map((f) => (
              <li key={f.clave} className={clsx("flex flex-wrap items-center gap-2 px-3 py-2", !f.active && "bg-superficie-sutil")}>
                <input
                  aria-label="Criterio"
                  value={f.name}
                  onChange={(e) => cambiar(f.clave, { name: e.target.value })}
                  disabled={!f.active}
                  maxLength={120}
                  placeholder="Nuevo criterio"
                  className="min-w-0 flex-1 rounded-xs border border-borde bg-superficie-tarjeta px-2 py-1 text-sm text-texto-cuerpo focus:shadow-ring focus:outline-none disabled:text-texto-tenue disabled:line-through"
                />
                <input
                  aria-label={`Peso de ${f.name || "el criterio"}`}
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={f.active ? f.weight : ""}
                  onChange={(e) => cambiar(f.clave, { weight: e.target.value === "" ? 0 : Number(e.target.value) })}
                  disabled={!f.active}
                  className="tabular w-20 rounded-xs border border-borde bg-superficie-tarjeta px-2 py-1 text-right text-sm focus:shadow-ring focus:outline-none"
                />
                {f.id ? (
                  <Boton variante="fantasma" onClick={() => cambiar(f.clave, { active: !f.active })} className="px-2 py-1 text-xs">
                    {f.active ? "Desactivar" : "Reactivar"}
                  </Boton>
                ) : (
                  <Boton variante="fantasma" onClick={() => quitarNueva(f.clave)} className="px-2 py-1 text-xs">
                    Quitar
                  </Boton>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Boton variante="secundario" onClick={agregar} className="px-2.5 py-1 text-xs">
              Agregar criterio
            </Boton>
            <p className={clsx("tabular text-sm font-semibold", suma === 100 ? "text-exito" : "text-coral")}>
              Suma {suma} / 100{suma < 100 ? ` · faltan ${100 - suma}` : suma > 100 ? ` · sobran ${suma - 100}` : ""}
            </p>
          </div>

          {problemas.length > 0 && (
            <ul className="space-y-0.5 text-xs text-coral">
              {problemas.map((p) => (
                <li key={p.mensaje}>{p.mensaje}</li>
              ))}
            </ul>
          )}
          <AvisosDeAccion resultado={resultado && !resultado.ok ? resultado : null} />

          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={enviando || problemas.length > 0}>
              {enviando ? "Guardando…" : "Guardar rúbrica"}
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
