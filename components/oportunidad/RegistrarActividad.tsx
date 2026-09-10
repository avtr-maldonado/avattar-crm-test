"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AreaDeTexto,
  Campo,
  Entrada,
  Panel,
  Seleccion,
} from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ siguienteEn: Date | null }>;

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Registrar lo que pasó y agendar lo que sigue, en la misma forma · §12.4.
 *
 * ## Por qué el siguiente paso está en el mismo formulario
 *
 * «Resuelve cada una registrando la actividad **y su siguiente paso en el mismo
 * formulario**.» Separarlos en dos pantallas es cómo se llega a un pipeline
 * lleno de oportunidades sin próximo paso: la segunda pantalla se pospone.
 *
 * ## La confirmación no es cosmética
 *
 * Si no se agenda nada, el servidor **rechaza** con `CONFIRMACION` y no escribe.
 * Ese rechazo llega aquí y se convierte en la pregunta explícita que §12.4 exige,
 * con el botón que reenvía confirmando. La pregunta no la hace el navegador: la
 * hace la regla.
 */
export function RegistrarActividad({
  opportunityId,
  tipos,
  accion,
}: {
  opportunityId: string;
  tipos: { id: string; name: string }[];
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [agendaSiguiente, setAgendaSiguiente] = useState(true);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      setAgendaSiguiente(true);
      avisar.exito(
        "Actividad registrada",
        r.datos.siguienteEn
          ? `Siguiente paso el ${r.datos.siguienteEn.toLocaleDateString("es-MX", { day: "numeric", month: "long" })}.`
          : "Sin próximo paso: aparecerá mañana en tu bandeja.",
      );
      return r;
    },
    null,
  );

  const pideConfirmacion = resultado != null && !resultado.ok && resultado.motivo === "CONFIRMACION";

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Registrar actividad</Boton>

      <Panel
        titulo="Registrar actividad"
        subtitulo="Lo que pasó y lo que sigue, en la misma captura."
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              El siguiente paso mantiene viva la oportunidad. Sin él, mañana aparece en tu bandeja
              como pendiente.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="registrar-actividad" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        <form id="registrar-actividad" action={enviar} className="flex flex-col gap-5">
          <input type="hidden" name="opportunityId" value={opportunityId} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo etiqueta="Tipo" htmlFor="typeId" problema={problemaDe(resultado, "typeId")}>
              <Seleccion id="typeId" name="typeId" defaultValue={tipos[0]?.id}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Campo etiqueta="Cuándo ocurrió" htmlFor="ocurrioEn">
              <Entrada id="ocurrioEn" name="ocurrioEn" type="date" defaultValue={hoyISO()} />
            </Campo>
          </div>

          <Campo etiqueta="Asunto" htmlFor="subject" problema={problemaDe(resultado, "subject")}>
            <Entrada
              id="subject"
              name="subject"
              placeholder="De qué se trató"
              problema={problemaDe(resultado, "subject")}
            />
          </Campo>

          <Campo
            etiqueta="Resultado"
            htmlFor="outcome"
            ayuda="Lo que cambió: qué dijeron, qué falta, con quién hay que hablar."
          >
            <AreaDeTexto id="outcome" name="outcome" placeholder="Qué salió de la conversación" />
          </Campo>

          {/* ── El siguiente paso, en la misma forma · §12.4 ──────────────── */}
          <div className="rounded-sm border border-borde bg-superficie-sutil p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-texto-cuerpo">
              <input
                type="checkbox"
                checked={agendaSiguiente}
                onChange={(e) => setAgendaSiguiente(e.target.checked)}
                className="size-4 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
              />
              Agendar el siguiente paso
            </label>

            {agendaSiguiente ? (
              <div className="mt-4 flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Campo etiqueta="Tipo" htmlFor="siguienteTypeId">
                    <Seleccion
                      id="siguienteTypeId"
                      name="siguienteTypeId"
                      defaultValue={tipos[0]?.id}
                    >
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Seleccion>
                  </Campo>
                  <Campo etiqueta="Cuándo" htmlFor="siguienteStartsAt">
                    <Entrada id="siguienteStartsAt" name="siguienteStartsAt" type="date" />
                  </Campo>
                </div>
                <Campo
                  etiqueta="Qué sigue"
                  htmlFor="siguienteSubject"
                  problema={problemaDe(resultado, "siguiente.subject")}
                >
                  <Entrada
                    id="siguienteSubject"
                    name="siguienteSubject"
                    placeholder="La acción concreta que sigue"
                    problema={problemaDe(resultado, "siguiente.subject")}
                  />
                </Campo>
              </div>
            ) : (
              <p className="mt-2 text-xs text-texto-tenue">
                Sin siguiente paso, esta oportunidad aparecerá mañana en tu bandeja bajo
                «sin próximo paso».
              </p>
            )}
          </div>

          {pideConfirmacion && (
            <div
              role="alert"
              className="rounded-sm border border-borde-fuerte bg-superficie-tinte px-4 py-3"
            >
              <p className="text-sm text-texto-cuerpo">
                {resultado.problemas.map((p) => p.mensaje).join(" ")}
              </p>
              <div className="mt-3">
                <Boton
                  variante="secundario"
                  type="submit"
                  name="sinSeguimiento"
                  value="true"
                  disabled={enviando}
                >
                  Cerrar sin seguimiento
                </Boton>
              </div>
            </div>
          )}
        </form>
      </Panel>
    </>
  );
}
