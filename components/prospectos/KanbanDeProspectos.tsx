"use client";

import { startTransition, useActionState, useState } from "react";
import clsx from "clsx";
import type { LeadStage } from "@/lib/dto";
import type { ResultadoAccion } from "@/lib/acciones";
import { ETIQUETA_DE_ETAPA } from "@/lib/domain/leadStages";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { TarjetaProspecto } from "./TarjetaProspecto";
import type { DatosDeProspecto } from "./formato";

export type ColumnaDeProspectos = { etapa: LeadStage; prospectos: DatosDeProspecto[] };

type Resultado = ResultadoAccion<{ etapa: string }>;

/**
 * El kanban de prospectos · columnas por etapa abierta, arrastre nativo como
 * el del pipeline (decisiones §58). Mover envía la misma acción que el detalle:
 * una sola tabla de transiciones. Lo que la regla rechaza se dice en un aviso
 * —«Para pasar a Asignado elige al vendedor»— y la tarjeta vuelve a su sitio.
 */
export function KanbanDeProspectos({
  columnas,
  puedeMover,
  accion,
  vacio,
}: {
  columnas: ColumnaDeProspectos[];
  puedeMover: boolean;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
  vacio: React.ReactNode;
}) {
  const [arrastrada, setArrastrada] = useState<{ id: string; etapa: LeadStage } | null>(null);
  const [sobre, setSobre] = useState<LeadStage | null>(null);
  const [moviendose, setMoviendose] = useState<string | null>(null);

  const [, enviar, enviando] = useActionState(async (previo: Resultado | null, form: FormData) => {
    const r = await accion(previo, form);
    setMoviendose(null);
    if (r.ok) avisar.exito("Etapa actualizada", r.datos.etapa);
    else if (r.motivo === "VALIDACION") avisar.error("No se movió", r.problemas.map((p) => p.mensaje).join(" "));
    else avisarSiCorresponde(r);
    return r;
  }, null);

  const total = columnas.reduce((n, c) => n + c.prospectos.length, 0);
  if (total === 0) return <>{vacio}</>;

  function soltarEn(etapa: LeadStage) {
    const tarjeta = arrastrada;
    setArrastrada(null);
    setSobre(null);
    if (!tarjeta || tarjeta.etapa === etapa) return;
    const form = new FormData();
    form.set("leadId", tarjeta.id);
    form.set("toStage", etapa);
    setMoviendose(tarjeta.id);
    startTransition(() => enviar(form));
  }

  return (
    <div
      className="grid gap-3 pb-4 lg:grid-cols-[repeat(var(--etapas),minmax(0,1fr))] xl:gap-4"
      style={{ "--etapas": columnas.length } as React.CSSProperties}
    >
      {columnas.map((c) => (
        <section
          key={c.etapa}
          aria-label={`Etapa ${ETIQUETA_DE_ETAPA[c.etapa]}`}
          onDragOver={(e) => {
            if (!puedeMover || !arrastrada) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setSobre(c.etapa);
          }}
          onDragLeave={() => setSobre((s) => (s === c.etapa ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            soltarEn(c.etapa);
          }}
          className={clsx(
            "flex flex-col rounded-md transition-colors duration-rapido ease-estandar",
            "[container-name:columna] [container-type:inline-size]",
            sobre === c.etapa && arrastrada?.etapa !== c.etapa ? "bg-superficie-tinte ring-2 ring-acento" : "bg-superficie-sutil",
          )}
        >
          <header className="border-b border-borde px-3 py-2 col-angosta:px-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <h2 className="text-sm font-semibold leading-snug text-texto-titulo">{ETIQUETA_DE_ETAPA[c.etapa]}</h2>
              <span className="tabular whitespace-nowrap text-xs text-texto-tenue">{c.prospectos.length}</span>
            </div>
            <div className={clsx("mt-1.5 h-0.5 rounded-pill", c.etapa === "ACEPTADO" ? "bg-exito" : "bg-borde-fuerte")} />
          </header>
          <div className="grid min-h-24 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-1.5 p-1.5 lg:grid-cols-1">
            {c.prospectos.map((p) => (
              <div
                key={p.id}
                draggable={puedeMover && !enviando}
                onDragStart={(e) => {
                  setArrastrada({ id: p.id, etapa: c.etapa });
                  e.dataTransfer.setData("text/plain", p.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setArrastrada(null);
                  setSobre(null);
                }}
                className={clsx(
                  puedeMover && "cursor-grab active:cursor-grabbing",
                  arrastrada?.id === p.id && "opacity-40",
                  moviendose === p.id && "animate-pulse opacity-60",
                )}
              >
                <TarjetaProspecto p={p} />
              </div>
            ))}
            {c.prospectos.length === 0 && (
              <p className="col-span-full px-2 py-6 text-center text-xs text-texto-tenue">{sobre === c.etapa ? "Soltar aquí" : "Sin prospectos en esta etapa"}</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
