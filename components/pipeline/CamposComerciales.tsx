"use client";

import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { etiquetaDeTrimestre } from "@/lib/etiquetas";
import { Campo, Entrada, Seleccion } from "@/components/ui/formulario";
import { SelectorDeEtapa, type EtapaElegible } from "./SelectorDeEtapa";

const TIPOS_DE_NEGOCIO = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "EXPANSION", etiqueta: "Expansión" },
  { valor: "RENOVACION", etiqueta: "Renovación" },
];

/**
 * `COMPROMISO` no está en la lista a propósito: `RN-29` la condiciona a un
 * puntaje MEDDIC mínimo, y una oportunidad recién creada no tiene ninguno.
 * Ofrecerla aquí sería ofrecer algo que el sistema tendría que rechazar.
 */
const CATEGORIAS = [
  { valor: "PIPELINE", etiqueta: "Pipeline" },
  { valor: "MEJOR_CASO", etiqueta: "Mejor caso" },
  { valor: "OMITIDA", etiqueta: "Omitida" },
];

export function CamposComerciales({
  pipelines,
  pipelineId,
  etapas,
  stageId,
  cierre,
  origenes,
  propietarios,
  usuarioActual,
  puedeAsignar,
  resultado,
  alCambiarPipeline,
  alCambiarEtapa,
  alCambiarCierre,
}: {
  pipelines: { id: string; name: string }[];
  pipelineId: string;
  etapas: EtapaElegible[];
  stageId: string;
  cierre: string;
  origenes: { id: string; name: string }[];
  propietarios: { id: string; name: string }[];
  usuarioActual: { id: string; name: string };
  puedeAsignar: boolean;
  resultado: ResultadoAccion<unknown> | null;
  alCambiarPipeline: (id: string) => void;
  alCambiarEtapa: (id: string) => void;
  alCambiarCierre: (iso: string) => void;
}) {
  const esPrimeraEtapa = stageId === etapas[0]?.id;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo etiqueta="Pipeline" htmlFor="pipelineId" problema={problemaDe(resultado, "pipelineId")}>
          <Seleccion
            id="pipelineId"
            name="pipelineId"
            value={pipelineId}
            onChange={(e) => alCambiarPipeline(e.target.value)}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Valor estimado"
          htmlFor="estimatedAmount"
          anotacion="se recalcula al cotizar"
          problema={problemaDe(resultado, "estimatedAmount")}
        >
          <Entrada
            id="estimatedAmount"
            name="estimatedAmount"
            inputMode="decimal"
            placeholder="Monto sin símbolo"
            className="[font-variant-numeric:tabular-nums]"
            problema={problemaDe(resultado, "estimatedAmount")}
          />
        </Campo>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue">
          Etapa
        </span>
        <SelectorDeEtapa name="stageId" etapas={etapas} valor={stageId} alCambiar={alCambiarEtapa} />
        {!esPrimeraEtapa && (
          <p className="text-xs text-texto-tenue">
            Nace en una etapa avanzada: queda en su historial, como cualquier movimiento.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo
          etiqueta="Cierre estimado"
          htmlFor="expectedCloseDate"
          anotacion={cierre ? etiquetaDeTrimestre(cierre) : null}
          problema={problemaDe(resultado, "expectedCloseDate")}
        >
          <Entrada
            id="expectedCloseDate"
            name="expectedCloseDate"
            type="date"
            value={cierre}
            onChange={(e) => alCambiarCierre(e.target.value)}
            problema={problemaDe(resultado, "expectedCloseDate")}
          />
        </Campo>

        <Campo etiqueta="Tipo de negocio" htmlFor="businessType">
          <Seleccion id="businessType" name="businessType" defaultValue="NUEVO">
            {TIPOS_DE_NEGOCIO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo etiqueta="Origen" htmlFor="sourceId">
          <Seleccion id="sourceId" name="sourceId" defaultValue="">
            <option value="">Sin especificar</option>
            {origenes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Propietario"
          htmlFor="ownerId"
          problema={problemaDe(resultado, "ownerId")}
          ayuda={puedeAsignar ? undefined : "Las oportunidades que das de alta son tuyas."}
        >
          <Seleccion
            id="ownerId"
            name="ownerId"
            defaultValue={usuarioActual.id}
            disabled={!puedeAsignar}
          >
            {(puedeAsignar ? propietarios : [usuarioActual]).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo
          etiqueta="Categoría de pronóstico"
          htmlFor="forecastCategory"
          ayuda="«Compromiso» exige puntaje MEDDIC y llega con ese módulo."
        >
          <Seleccion id="forecastCategory" name="forecastCategory" defaultValue="PIPELINE">
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>
    </>
  );
}
