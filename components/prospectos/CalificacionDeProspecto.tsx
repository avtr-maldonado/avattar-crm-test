"use client";

import { useActionState, useId, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { puntajeDe } from "@/lib/domain/leadScoring";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import { AvisosDeAccion, useEnvioQueConserva } from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ score: number }>;

export type CalificacionGuardada = {
  score: number;
  quien: string | null;
  cuando: string;
  items: { criterionId: string; name: string; weight: number; met: boolean }[];
};

/**
 * La calificación del prospecto con la rúbrica · decisiones §71. En En validación y Contactado, quien
 * gestiona marca el checklist y el total se ve en vivo; en las demás etapas se lee cómo se calificó,
 * con el nombre y el peso de ese momento. Solo informa: no mueve la etapa.
 */
export function CalificacionDeProspecto({
  leadId,
  editable,
  criterios,
  guardada,
  accion,
}: {
  leadId: string;
  editable: boolean;
  /** La rúbrica vigente, en su orden. */
  criterios: { id: string; name: string; weight: number }[];
  guardada: CalificacionGuardada | null;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  if (!editable) return <Lectura guardada={guardada} />;
  return <Checklist leadId={leadId} criterios={criterios} guardada={guardada} accion={accion} />;
}

function Checklist({
  leadId,
  criterios,
  guardada,
  accion,
}: {
  leadId: string;
  criterios: { id: string; name: string; weight: number }[];
  guardada: CalificacionGuardada | null;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const id = useId();
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(guardada?.items.flatMap((i) => (i.met ? [i.criterionId] : [])) ?? []),
  );
  const [resultado, enviar, enviando] = useActionState(async (previo: Resultado | null, form: FormData) => {
    const r = await accion(previo, form);
    if (!r.ok) avisarSiCorresponde(r);
    else avisar.exito("Calificación guardada", `${r.datos.score} puntos`);
    return r;
  }, null);
  const alEnviar = useEnvioQueConserva(enviar);

  const total = puntajeDe(criterios.map((c) => ({ weight: c.weight, met: marcados.has(c.id) })));
  const alternar = (criterio: string) =>
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(criterio)) siguiente.delete(criterio);
      else siguiente.add(criterio);
      return siguiente;
    });

  if (criterios.length === 0) {
    return <p className="text-sm text-texto-tenue">La rúbrica no tiene criterios activos. Defínelos en Configuración › Prospectos.</p>;
  }

  return (
    <form onSubmit={alEnviar} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <ul className="divide-y divide-borde rounded-md border border-borde">
        {criterios.map((c) => {
          const marcado = marcados.has(c.id);
          return (
            <li key={c.id}>
              <label htmlFor={`${id}-${c.id}`} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-superficie-sutil">
                <input
                  id={`${id}-${c.id}`}
                  type="checkbox"
                  name="criterio"
                  value={c.id}
                  checked={marcado}
                  onChange={() => alternar(c.id)}
                  className="size-4 accent-acento"
                />
                <span className={clsx("flex-1 text-sm", marcado ? "text-texto-titulo" : "text-texto-cuerpo")}>{c.name}</span>
                <span className={clsx("tabular text-xs", marcado ? "font-semibold text-acento" : "text-texto-tenue")}>{c.weight}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto-cuerpo">
          Puntaje <span className="tabular text-lg font-semibold text-texto-titulo">{total}</span>
          <span className="tabular text-texto-tenue"> / 100</span>
        </p>
        <Boton type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar calificación"}
        </Boton>
      </div>
      {guardada && <Firma guardada={guardada} />}
      <AvisosDeAccion resultado={resultado && !resultado.ok ? resultado : null} />
    </form>
  );
}

function Lectura({ guardada }: { guardada: CalificacionGuardada | null }) {
  if (!guardada) {
    return <p className="text-sm text-texto-tenue">Sin calificar. Se califica en En validación o Contactado.</p>;
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-borde rounded-md border border-borde">
        {guardada.items.map((i) => (
          <li key={i.criterionId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className={clsx("flex size-5 items-center justify-center rounded-pill", i.met ? "bg-exito/10 text-exito" : "bg-superficie-sutil text-texto-tenue")}>
              {i.met ? <Icono nombre="palomita" className="size-3" /> : <span aria-hidden>–</span>}
            </span>
            <span className={clsx("flex-1", i.met ? "text-texto-titulo" : "text-texto-tenue")}>{i.name}</span>
            <span className={clsx("tabular text-xs", i.met ? "font-semibold text-acento" : "text-texto-tenue")}>{i.weight}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-texto-cuerpo">
        Puntaje <span className="tabular text-lg font-semibold text-texto-titulo">{guardada.score}</span>
        <span className="tabular text-texto-tenue"> / 100</span>
      </p>
      <Firma guardada={guardada} />
    </div>
  );
}

function Firma({ guardada }: { guardada: CalificacionGuardada }) {
  return (
    <p className="text-xs text-texto-tenue">
      Calificó {guardada.quien ?? "—"} · {guardada.cuando}
    </p>
  );
}
