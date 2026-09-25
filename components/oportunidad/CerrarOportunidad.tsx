"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
  useProblemas,
} from "@/components/ui/formulario";

type Accion = (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;

export type RequisitoVisible = { texto: string; cumple: boolean };
export type MotivoDePerdidaVisible = { id: string; name: string; requiresCompetitor: boolean };

/**
 * Marcar ganada o perdida · §11 acciones de cabecera, decisiones §25.
 *
 * Desde cualquier etapa. «Ganada» abre un panel que enseña las tres
 * condiciones con palomita o cruz —cotización con líneas, hitos, hitos que
 * cuadran— y solo deja confirmar cuando las tres se cumplen; el servidor las
 * vuelve a comprobar (INV-07). «Perdida» pide el motivo, y el competidor
 * cuando el motivo lo exige (AC-20).
 *
 * Verde y coral, los dos llenos, porque son las dos decisiones más importantes
 * que se toman sobre una oportunidad; el resto de la barra se queda en
 * secundario.
 */
export function CerrarOportunidad({
  opportunityId,
  requisitos,
  motivos,
  acciones,
}: {
  opportunityId: string;
  requisitos: RequisitoVisible[];
  motivos: MotivoDePerdidaVisible[];
  acciones: { ganada: Accion; perdida: Accion };
}) {
  const [panel, setPanel] = useState<"ganada" | "perdida" | null>(null);
  // Sube al cerrar: el siguiente panel empieza limpio, sin avisos viejos.
  const [generacion, setGeneracion] = useState(0);

  function cerrar() {
    setPanel(null);
    setGeneracion((g) => g + 1);
  }

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoAccion | null, form: FormData) => {
      const cual = form.get("__accion") === "perdida" ? "perdida" : "ganada";
      const r = await acciones[cual](previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      cerrar();
      avisar.exito(
        cual === "ganada" ? "Oportunidad ganada" : "Oportunidad perdida",
        "Queda en la bitácora con el cierre real de hoy.",
      );
      return r;
    },
    null,
  );

  const alEnviar = useEnvioQueConserva(enviar);
  const cumpleTodo = requisitos.every((r) => r.cumple);

  return (
    <>
      <Boton variante="exito" onClick={() => setPanel("ganada")}>
        Ganada
      </Boton>
      <Boton variante="peligro" onClick={() => setPanel("perdida")}>
        Perdida
      </Boton>

      {/* ── Ganada ──────────────────────────────────────────────────────── */}
      <Panel
        titulo="Marcar como ganada"
        subtitulo="Sella el cierre real de hoy y convierte los hitos en facturación firme (RN-23)."
        abierto={panel === "ganada"}
        alCerrar={cerrar}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              {cumpleTodo
                ? "Se puede ganar desde cualquier etapa."
                : "Lo que falta se resuelve en las pestañas Cotización e Hitos."}
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                variante="exito"
                type="submit"
                form="marcar-ganada"
                disabled={enviando || !cumpleTodo}
              >
                {enviando ? "Guardando…" : "Confirmar ganada"}
              </Boton>
            </div>
          </>
        }
      >
        <form
          id="marcar-ganada"
          key={`ganada-${generacion}`}
          className="flex flex-col gap-4"
          onSubmit={alEnviar}
        >
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <input type="hidden" name="__accion" value="ganada" />

          <ul className="space-y-2">
            {requisitos.map((r) => (
              <li key={r.texto} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className={clsx(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    r.cumple ? "border-exito bg-exito/10 text-exito" : "border-coral bg-coral/10 text-coral",
                  )}
                >
                  <Icono nombre={r.cumple ? "palomita" : "riesgo"} className="size-3" />
                </span>
                <span className={r.cumple ? "text-texto-cuerpo" : "font-medium text-texto-titulo"}>
                  {r.texto}
                </span>
                <span className="sr-only">{r.cumple ? "cumple" : "falta"}</span>
              </li>
            ))}
          </ul>

          <AvisosDeAccion resultado={panel === "ganada" ? resultado : null} />
        </form>
      </Panel>

      {/* ── Perdida ─────────────────────────────────────────────────────── */}
      <Panel
        titulo="Marcar como perdida"
        subtitulo="El motivo es obligatorio: es lo que se aprende de una pérdida."
        abierto={panel === "perdida"}
        alCerrar={cerrar}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              Se sella el cierre real de hoy. Reabrirla después es de Administración (RN-18).
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton variante="peligro" type="submit" form="marcar-perdida" disabled={enviando}>
                {enviando ? "Guardando…" : "Confirmar perdida"}
              </Boton>
            </div>
          </>
        }
      >
        <FormularioDePerdida
          key={`perdida-${generacion}`}
          opportunityId={opportunityId}
          motivos={motivos}
          resultado={panel === "perdida" ? resultado : null}
          alEnviar={alEnviar}
        />
      </Panel>
    </>
  );
}

function FormularioDePerdida({
  opportunityId,
  motivos,
  resultado,
  alEnviar,
}: {
  opportunityId: string;
  motivos: MotivoDePerdidaVisible[];
  resultado: ResultadoAccion | null;
  alEnviar: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [motivoId, setMotivoId] = useState("");
  const problemas = useProblemas(resultado);
  const motivo = motivos.find((m) => m.id === motivoId);

  return (
    <form
      id="marcar-perdida"
      className="flex flex-col gap-5"
      onSubmit={alEnviar}
      onChange={problemas.alCambiar}
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="__accion" value="perdida" />

      <Campo etiqueta="Motivo" htmlFor="lossReasonId" problema={problemas.problema("lossReasonId")}>
        <Seleccion
          id="lossReasonId"
          name="lossReasonId"
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
          problema={problemas.problema("lossReasonId")}
        >
          <option value="">Elige el motivo</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Seleccion>
      </Campo>

      {motivo?.requiresCompetitor ? (
        <Campo
          etiqueta="Competidor"
          htmlFor="lossCompetitor"
          problema={problemas.problema("lossCompetitor")}
          ayuda="Este motivo pide saber contra quién se perdió (RN-16)."
        >
          <Entrada
            id="lossCompetitor"
            name="lossCompetitor"
            placeholder="Quién se la llevó"
            problema={problemas.problema("lossCompetitor")}
          />
        </Campo>
      ) : null}

      <AvisosDeAccion resultado={resultado} />
    </form>
  );
}
