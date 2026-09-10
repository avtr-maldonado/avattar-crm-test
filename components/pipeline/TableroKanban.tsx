"use client";

import { startTransition, useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, EstadoVacio } from "@/components/ui/primitivas";
import { Panel } from "@/components/ui/formulario";
import { TarjetaOportunidad, type DatosTarjeta } from "./TarjetaOportunidad";
import { envioDeMovimiento, type TarjetaArrastrada } from "./arrastre";

/**
 * Tablero kanban · §11 P-01.
 *
 * «Una columna por etapa, con conteo, total y ponderado de la columna.»
 *
 * Las columnas vacías **se muestran igual**. Una etapa que desaparece cuando no
 * tiene tarjetas rompe el mapa mental del proceso: el vendedor deja de ver que
 * Propuesta existe y no entiende por qué su negocio saltó de Descubrimiento a
 * Negociación.
 *
 * ## El arrastre · `RN-02`
 *
 * Se usa la API nativa de HTML5, sin librería: `@dnd-kit` costaría ~30 kB y
 * además tendría que esperar la cuarentena de siete días de `minimumReleaseAge`
 * antes de poder instalarse.
 *
 * **La tarjeta no se mueve de forma optimista.** Se atenúa mientras el servidor
 * decide y se mueve cuando de verdad se movió. Saltar y luego regresar, con un
 * panel de requisitos encima, es mucho movimiento para decir «no».
 *
 * ## Lo que el arrastre no cubre
 *
 * Teclado y táctil: el arrastre nativo no funciona con ninguno de los dos. El
 * camino accesible es la barra de etapas del detalle, que sí es un control de
 * teclado en regla, y a la que se llega pulsando la tarjeta.
 */
export type ColumnaKanban = {
  etapaId: string;
  nombre: string;
  /** Ya formateado: «75 %». */
  probabilidad: string;
  /** Ya formateados. */
  total: string;
  ponderado: string;
  esCierre: boolean;
  gateMode: "ADVERTENCIA" | "BLOQUEANTE";
  oportunidades: DatosTarjeta[];
};

type Resultado = ResultadoAccion<{ etapa: string; gateOverride: boolean }>;

export function TableroKanban({
  columnas,
  accionVacio,
  puedeMover,
  accion,
}: {
  columnas: ColumnaKanban[];
  accionVacio: React.ReactNode;
  puedeMover: boolean;
  accion?: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [arrastrada, setArrastrada] = useState<TarjetaArrastrada | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  /** Lo que se intentó y la compuerta detuvo, para el panel de requisitos. */
  const [detenida, setDetenida] = useState<{ destino: ColumnaKanban; tarjeta: TarjetaArrastrada } | null>(null);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      if (!accion) return previo;
      const r = await accion(previo, form);

      if (r.ok) {
        setDetenida(null);
        avisar.exito("Etapa actualizada", r.datos.etapa);
        if (r.datos.gateOverride) {
          avisar.advertencia(
            "Avanzó sin cumplir los requisitos",
            "Queda en su historial y en el reporte semanal de incumplimiento.",
          );
        }
        return r;
      }

      // Los faltantes se muestran en el panel, junto al botón de omitir cuando
      // corresponde. Lo demás sí es aviso.
      if (r.motivo !== "COMPUERTA") {
        setDetenida(null);
        avisarSiCorresponde(r);
      }
      return r;
    },
    null,
  );

  const totalTarjetas = columnas.reduce((n, c) => n + c.oportunidades.length, 0);

  if (totalTarjetas === 0) {
    return (
      <EstadoVacio
        titulo="No hay oportunidades con estos filtros"
        explicacion="Puede que el filtro esté demasiado cerrado, o que todavía no tengas oportunidades asignadas. Recuerda que la visibilidad sigue al propietario, no a quien las creó."
        accion={accionVacio}
      />
    );
  }

  const arrastrable = puedeMover && accion != null;
  const faltantes =
    resultado && !resultado.ok && resultado.motivo === "COMPUERTA" ? resultado.problemas : [];

  /**
   * El envío se arma **aquí**, con los valores que el soltar tiene en la mano.
   *
   * La versión anterior los guardaba en estado y enviaba un formulario con
   * campos ocultos en el mismo tick: React todavía no los había actualizado, así
   * que viajaban vacíos y el arrastre no hacía nada. Ver `arrastre.ts`.
   */
  function soltarEn(destino: ColumnaKanban) {
    const datos = envioDeMovimiento(arrastrada, destino.etapaId);
    const tarjeta = arrastrada;
    setArrastrada(null);
    setSobre(null);
    if (!datos || !tarjeta) return;

    // Se guarda para poder nombrar el destino en el panel de requisitos y para
    // que «Mover de todos modos» sepa a dónde iba.
    setDetenida({ destino, tarjeta });

    // Despachar fuera de una transición deja `enviando` sin actualizarse: la
    // tarjeta no se atenuaría y se podría arrastrar otra vez mientras el
    // servidor todavía decide. El `action` de un formulario envuelve esto solo;
    // al despachar a mano hay que hacerlo aquí.
    startTransition(() => enviar(datos));
  }

  return (
    <>
      {/* Un solo scroll horizontal para todo el tablero: si cada columna
          tuviera el suyo, arrastrar una tarjeta entre etapas sería imposible. */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columnas.map((c) => (
          <section
            key={c.etapaId}
            aria-label={`Etapa ${c.nombre}`}
            onDragOver={(e) => {
              if (!arrastrable || !arrastrada) return;
              // Sin `preventDefault` el navegador no considera la zona un
              // destino válido y nunca dispara `drop`.
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setSobre(c.etapaId);
            }}
            onDragLeave={() => setSobre((s) => (s === c.etapaId ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              soltarEn(c);
            }}
            className={clsx(
              "flex w-72 shrink-0 flex-col rounded-md transition-colors duration-rapido ease-estandar",
              sobre === c.etapaId && arrastrada?.etapaId !== c.etapaId
                ? "bg-superficie-tinte ring-2 ring-acento"
                : "bg-superficie-sutil",
            )}
          >
            <header className="border-b border-borde px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-texto-titulo">{c.nombre}</h2>
                <span className="tabular text-xs text-texto-tenue">
                  {c.oportunidades.length} · {c.probabilidad}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tabular text-sm font-semibold text-texto-titulo">{c.total}</span>
                <span className="tabular text-xs text-texto-tenue">pond. {c.ponderado}</span>
              </div>
              {/* La etapa de cierre se marca: es donde el gate es más exigente. */}
              <div
                className={`mt-2 h-0.5 rounded-pill ${c.esCierre ? "bg-exito" : "bg-borde-fuerte"}`}
              />
            </header>

            <div className="flex min-h-24 flex-col gap-2 p-2">
              {c.oportunidades.map((o) => {
                const moviendose = enviando && detenida?.tarjeta.id === o.id;
                return (
                  <div
                    key={o.id}
                    draggable={arrastrable && !enviando}
                    onDragStart={(e) => {
                      setArrastrada({ id: o.id, nombre: o.nombre, etapaId: c.etapaId });
                      // Firefox no inicia el arrastre si nadie pone datos, y
                      // `move` es lo que hace que el cursor diga que se mueve y
                      // no que se copia.
                      e.dataTransfer.setData("text/plain", o.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setArrastrada(null);
                      setSobre(null);
                    }}
                    className={clsx(
                      arrastrable && "cursor-grab active:cursor-grabbing",
                      arrastrada?.id === o.id && "opacity-40",
                      moviendose && "animate-pulse opacity-60",
                    )}
                  >
                    <TarjetaOportunidad o={o} />
                  </div>
                );
              })}

              {c.oportunidades.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-texto-tenue">
                  {sobre === c.etapaId ? "Soltar aquí" : "Sin oportunidades en esta etapa"}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <Panel
        titulo={`No entra a ${detenida?.destino.nombre ?? ""}`}
        subtitulo={detenida?.tarjeta.nombre}
        abierto={faltantes.length > 0 && detenida != null}
        alCerrar={() => setDetenida(null)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              {detenida?.destino.gateMode === "ADVERTENCIA"
                ? "Avanzar deja constancia en el historial y en el reporte semanal de incumplimiento."
                : "Esta etapa es bloqueante: hay que cumplirlos para entrar."}
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setDetenida(null)}>
                Entendido
              </Boton>
              {detenida?.destino.gateMode === "ADVERTENCIA" && (
                <Boton
                  variante="secundario"
                  disabled={enviando}
                  onClick={() => {
                    const datos = envioDeMovimiento(
                      detenida.tarjeta,
                      detenida.destino.etapaId,
                      { omitirCompuerta: true },
                    );
                    if (datos) startTransition(() => enviar(datos));
                  }}
                >
                  Mover de todos modos
                </Boton>
              )}
            </div>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-texto-cuerpo">
          {faltantes.map((p) => (
            <li key={p.mensaje}>{p.mensaje}</li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
