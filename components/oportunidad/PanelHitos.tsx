"use client";

import { startTransition, useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Entrada, Panel } from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ puntaje?: number; url?: string } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

export type HitoDeLista = {
  id: string;
  descripcion: string;
  vence: string;
  venceISO: string;
  /** Sin formato, para el campo. */
  monto: string;
  montoFormateado: string;
  porcentaje: string;
  cumplido: boolean;
};

/**
 * La pestaña de hitos de facturación · `HF-01`, `HF-04`, `AC-18`.
 *
 * ## La barra de distribución es el mensaje
 *
 * §11 pide «captura con conmutador % / monto, barra de distribución, banner de
 * cuadre». La barra no es decoración: enseña de un vistazo cuánto del neto está
 * repartido y cuánto no, que es la pregunta que responde si esta oportunidad se
 * puede ganar (`RN-06`).
 *
 * ## Se captura en `%` o en monto, pero se guarda monto
 *
 * §4 lo fija. Si se guardara el porcentaje, un cambio de cotización reajustaría
 * el calendario de cobro en silencio; guardado como monto, el sistema avisa que
 * dejó de cuadrar, que es lo que alguien tiene que ir a decidir.
 */
export function PanelHitos({
  opportunityId,
  hitos,
  neto,
  netoFormateado,
  cuadre,
  puedeEditar,
  acciones,
}: {
  opportunityId: string;
  hitos: HitoDeLista[];
  /** Sin formato, para convertir `%` a monto en la captura. */
  neto: string | null;
  netoFormateado: string | null;
  cuadre: { cuadra: boolean; mensaje: string | null; asignado: string; porcentaje: number };
  puedeEditar: boolean;
  acciones: { guardar: Accion; quitar: Accion; marcar: Accion };
}) {
  const [editando, setEditando] = useState<HitoDeLista | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [modo, setModo] = useState<"monto" | "porcentaje">("monto");

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const cual = String(form.get("__accion") ?? "guardar") as keyof typeof acciones;
      const r = await acciones[cual](previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setEditando(null);
      setAgregando(false);
      if (cual === "guardar") avisar.exito("Hito guardado");
      return r;
    },
    null,
  );

  function despachar(campos: Record<string, string>) {
    const datos = new FormData();
    datos.set("opportunityId", opportunityId);
    for (const [k, v] of Object.entries(campos)) datos.set(k, v);
    startTransition(() => enviar(datos));
  }

  const abierto = editando !== null || agregando;

  return (
    <div className="space-y-4">
      {/* ── Banner de cuadre · AC-18 ───────────────────────────────────── */}
      <div
        className={clsx(
          "rounded-md border px-5 py-4",
          cuadre.cuadra ? "border-exito/40 bg-exito/[0.06]" : "border-borde-fuerte bg-superficie-tinte",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            className={clsx(
              "text-sm font-semibold",
              cuadre.cuadra ? "text-exito" : "text-texto-titulo",
            )}
          >
            {cuadre.cuadra ? "Los hitos cuadran con el neto" : cuadre.mensaje}
          </p>
          <p className="tabular text-xs text-texto-tenue">
            {cuadre.asignado} de {netoFormateado ?? "—"}
          </p>
        </div>

        {/* La barra de distribución: cuánto del neto está repartido. */}
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-gray-10">
          <div
            className={clsx("h-full rounded-pill", cuadre.cuadra ? "bg-exito" : "bg-acento")}
            style={{ width: `${Math.min(100, Math.max(0, cuadre.porcentaje))}%` }}
          />
        </div>
      </div>

      {/* ── Los hitos ──────────────────────────────────────────────────── */}
      {hitos.length === 0 ? (
        <p className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-8 text-center text-sm text-texto-tenue">
          Sin hitos de facturación. Sin ellos la oportunidad no se puede marcar como ganada
          (RN-06).
        </p>
      ) : (
        <ul className="space-y-2">
          {hitos.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3"
            >
              {puedeEditar && (
                <input
                  type="checkbox"
                  checked={h.cumplido}
                  disabled={enviando}
                  aria-label={`Marcar «${h.descripcion}» como facturado`}
                  onChange={(e) =>
                    despachar({
                      __accion: "marcar",
                      milestoneId: h.id,
                      cumplido: String(e.target.checked),
                    })
                  }
                  className="size-4 rounded-xs border-borde-fuerte text-exito focus:shadow-ring"
                />
              )}

              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    "text-sm font-medium",
                    h.cumplido ? "text-texto-tenue line-through" : "text-texto-titulo",
                  )}
                >
                  {h.descripcion}
                </p>
                <p className="text-xs text-texto-tenue">Vence {h.vence}</p>
              </div>

              {h.cumplido && <Pastilla tono="exito">Facturado</Pastilla>}

              <p className="tabular w-32 text-right text-sm font-semibold text-texto-titulo">
                {h.montoFormateado}
                <span className="ml-1.5 font-normal text-xs text-texto-tenue">{h.porcentaje}</span>
              </p>

              {puedeEditar && (
                <div className="flex items-center gap-1">
                  <Boton variante="fantasma" onClick={() => setEditando(h)}>
                    Editar
                  </Boton>
                  <button
                    type="button"
                    disabled={enviando}
                    aria-label={`Quitar ${h.descripcion}`}
                    onClick={() => despachar({ __accion: "quitar", milestoneId: h.id })}
                    className="rounded-xs p-1 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-coral focus:shadow-ring focus:outline-none"
                  >
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <Boton variante="secundario" onClick={() => setAgregando(true)}>
          Agregar hito
        </Boton>
      )}

      <Panel
        titulo={editando ? "Editar hito" : "Agregar hito"}
        subtitulo="Se captura en monto o en porcentaje del neto; se guarda siempre en monto."
        abierto={abierto}
        alCerrar={() => {
          setEditando(null);
          setAgregando(false);
        }}
        pie={
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-texto-tenue">Capturar en</span>
              <button
                type="button"
                onClick={() => setModo((m) => (m === "monto" ? "porcentaje" : "monto"))}
                className="font-medium text-acento hover:text-acento-hover"
              >
                {modo === "monto" ? "monto · cambiar a %" : "% · cambiar a monto"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Boton
                variante="fantasma"
                type="button"
                onClick={() => {
                  setEditando(null);
                  setAgregando(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton type="submit" form="guardar-hito" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        <form
          id="guardar-hito"
          className="flex flex-col gap-5"
          action={(datos: FormData) => {
            datos.set("opportunityId", opportunityId);
            datos.set("__accion", "guardar");
            if (editando) datos.set("milestoneId", editando.id);

            // El conmutador convierte antes de enviar: lo que viaja y lo que se
            // guarda es siempre monto (§4).
            if (modo === "porcentaje" && neto) {
              const pct = Number(String(datos.get("amount") ?? "0").replace(/,/g, ""));
              datos.set("amount", ((Number(neto) * pct) / 100).toFixed(4));
            }
            startTransition(() => enviar(datos));
          }}
        >
          <Campo
            etiqueta="Concepto"
            htmlFor="description"
            problema={problemaDe(resultado, "description")}
            ayuda="Qué se factura: «Anticipo», «Entrega de la fase 1»."
          >
            <Entrada
              id="description"
              name="description"
              defaultValue={editando?.descripcion}
              placeholder="Qué se factura en este hito"
              problema={problemaDe(resultado, "description")}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              etiqueta={modo === "monto" ? "Monto" : "Porcentaje del neto"}
              htmlFor="amount"
              problema={problemaDe(resultado, "amount")}
              anotacion={modo === "porcentaje" && neto ? "se guarda en monto" : undefined}
            >
              <Entrada
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={modo === "monto" ? editando?.monto : undefined}
                placeholder={modo === "monto" ? "Sin símbolo" : "Sin el signo de %"}
                className="[font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "amount")}
              />
            </Campo>

            <Campo
              etiqueta="Fecha de facturación"
              htmlFor="dueDate"
              problema={problemaDe(resultado, "dueDate")}
            >
              <Entrada
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={editando?.venceISO}
                problema={problemaDe(resultado, "dueDate")}
              />
            </Campo>
          </div>

          {modo === "porcentaje" && !neto && (
            <p className="text-xs text-coral">
              Sin cotización congelada no hay neto sobre el cual calcular un porcentaje. Captura el
              monto.
            </p>
          )}

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </div>
  );
}
