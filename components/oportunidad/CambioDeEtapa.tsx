"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";

export type EtapaDelCambio = {
  id: string;
  name: string;
  position: number;
  /** Ya formateada: «75 %». */
  probabilidad: string;
  gateMode: "ADVERTENCIA" | "BLOQUEANTE";
};

type Resultado = ResultadoAccion<{ etapa: string; gateOverride: boolean }>;

/**
 * La barra de etapas, ahora como control · `RN-02`.
 *
 * ## Por qué la barra es el control y no un botón aparte
 *
 * Mover una oportunidad de etapa es la acción más frecuente del día, y la barra
 * ya dice dónde está. Un botón «Cambiar etapa» que abre un `select` con las
 * mismas cinco opciones agrega dos clics y un modal para decir lo que la barra
 * ya muestra. Se pulsa donde se quiere llegar.
 *
 * ## Qué pasa cuando la compuerta no se cumple
 *
 * El servidor devuelve **todos** los requisitos faltantes, no el primero, y se
 * pintan bajo la barra. Si la etapa destino está en `ADVERTENCIA`, aparece
 * «Avanzar de todos modos», que sella `gateOverride` y alimenta el reporte
 * semanal de §8.3. Si está en `BLOQUEANTE` ese botón **no aparece**: ofrecerlo
 * sería prometer algo que el servidor va a rechazar.
 */
export function CambioDeEtapa({
  opportunityId,
  etapas,
  etapaActualId,
  cerrada,
  puedeMover,
  accion,
}: {
  opportunityId: string;
  etapas: EtapaDelCambio[];
  etapaActualId: string;
  cerrada?: "GANADA" | "PERDIDA";
  puedeMover: boolean;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [intentada, setIntentada] = useState<string | null>(null);

  /**
   * El aviso ocurre **dentro del flujo de la acción**, no en un efecto.
   *
   * Con un `useEffect` sobre el resultado hay que llevar un `ref` del último
   * atendido para no avisar dos veces cuando React vuelve a renderizar. Aquí
   * corre una sola vez por envío, que es cuando de verdad pasó algo.
   */
  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const r = await accion(previo, form);

      if (!r.ok) {
        // Los faltantes de compuerta se pintan aquí abajo, junto a la barra
        // donde se pulsó. Solo van a aviso los que no tienen nada que corregir
        // en pantalla.
        avisarSiCorresponde(r);
        return r;
      }

      setIntentada(null);
      avisar.exito("Etapa actualizada", r.datos.etapa);
      if (r.datos.gateOverride) {
        avisar.advertencia(
          "Avanzó sin cumplir los requisitos",
          "Queda en su historial y en el reporte semanal de incumplimiento.",
        );
      }
      return r;
    },
    null,
  );

  const ordenadas = [...etapas].sort((a, b) => a.position - b.position);
  const indiceActual = ordenadas.findIndex((e) => e.id === etapaActualId);
  const destino = ordenadas.find((e) => e.id === intentada);

  const faltantes =
    resultado && !resultado.ok && resultado.motivo === "COMPUERTA" ? resultado.problemas : [];
  const puedeOmitir = faltantes.length > 0 && destino?.gateMode === "ADVERTENCIA";

  return (
    <form action={enviar}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {/*
        El destino, para el botón de omitir: ese envía `omitirCompuerta` y no
        lleva etapa. Va ANTES que los galones a propósito —el enviante aporta su
        valor en orden de árbol y `Object.fromEntries` se queda con el último—,
        así que al pulsar una etapa manda la etapa, y al pulsar «de todos modos»
        manda la que se intentó.
      */}
      <input type="hidden" name="toStageId" value={intentada ?? ""} />

      <div
        role={puedeMover ? "radiogroup" : undefined}
        aria-label="Etapa"
        className="flex w-full items-stretch gap-[3px]"
      >
        {ordenadas.map((etapa, i) => {
          const alcanzada = i <= indiceActual;
          const esActual = i === indiceActual;
          const galon =
            i === 0
              ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
              : i === ordenadas.length - 1
                ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
                : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

          const contenido = (
            <span
              className={clsx(
                "px-3 text-center text-xs font-semibold leading-tight",
                alcanzada ? "text-acento-texto" : "text-texto-tenue",
                i > 0 && "pl-4",
              )}
            >
              {etapa.name} · {etapa.probabilidad}
            </span>
          );

          const estilo = clsx(
            "relative flex h-10 flex-1 items-center justify-center transition-colors duration-rapido ease-estandar",
            i > 0 && "-ml-[12px]",
            cerrada ? "bg-gray-20" : alcanzada ? "bg-acento" : "bg-gray-10",
            esActual && !cerrada && "bg-acento-activo",
            puedeMover && !cerrada && !esActual && "hover:brightness-95",
            "focus-within:z-10 focus-within:shadow-ring",
          );

          // Sin permiso o cerrada, la barra sigue informando: deja de ser
          // control, no desaparece.
          if (!puedeMover || cerrada) {
            return (
              <div key={etapa.id} className={estilo} style={{ clipPath: galon }} title={etapa.name}>
                {contenido}
              </div>
            );
          }

          return (
            <button
              key={etapa.id}
              type="submit"
              name="toStageId"
              value={etapa.id}
              disabled={enviando}
              onClick={() => setIntentada(etapa.id)}
              title={`Mover a ${etapa.name}`}
              className={clsx(estilo, "cursor-pointer disabled:cursor-wait")}
              style={{ clipPath: galon }}
            >
              {contenido}
            </button>
          );
        })}
      </div>

      {faltantes.length > 0 && destino && (
        <div
          role="alert"
          className="mt-3 rounded-sm border border-borde-fuerte bg-superficie-tinte px-4 py-3"
        >
          <p className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-navy-500">
            Falta para entrar a {destino.name}
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-sm text-texto-cuerpo">
            {faltantes.map((p) => (
              <li key={p.mensaje}>{p.mensaje}</li>
            ))}
          </ul>

          {puedeOmitir ? (
            <div className="mt-3">
              <Boton
                variante="secundario"
                type="submit"
                name="omitirCompuerta"
                value="true"
                disabled={enviando}
              >
                Avanzar de todos modos
              </Boton>
              <p className="mt-1.5 text-xs text-texto-tenue">
                Queda registrado en el historial y en el reporte semanal de incumplimiento.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-texto-tenue">
              Esta etapa es bloqueante: hay que cumplirlos para entrar.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
