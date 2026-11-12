import Link from "next/link";
import type { ResultadoAccion } from "@/lib/acciones";
import { enCurso } from "@/lib/agente/espera";
import { TEXTO_DE_ESTADO, TONO_DE_ESTADO } from "@/lib/agente/etiquetas";
import { leerFicha, type PuntoDeFicha } from "@/lib/agente/ficha";
import { AGENTE } from "@/lib/domain/bitacora";
import type { EstadoDeAnalisis } from "@/lib/scope/agente";
import type { Recomendacion } from "@/lib/scope/insights";
import { fechaEn, horaEn } from "@/lib/tiempo";
import { EstadoVacio, Pastilla } from "@/components/ui/primitivas";
import { AnalizarConIa, type SolicitudDeAnalisis } from "./AnalizarConIa";
import { RefrescoPeriodico } from "./RefrescoPeriodico";

/**
 * La pestaña «Análisis» · decisiones §62 y §63.
 *
 * La ficha más reciente arriba, con su estado, resumen, riesgos, acciones y
 * huecos; cada riesgo y acción enlaza a las actividades y muestra la cita que
 * lo sostiene. Las anteriores van plegadas. Arriba, lo que está pasando:
 * analizando, falló, o el agente está apagado. Nada corre solo: el botón
 * «Analizar con IA» es de quien tiene el permiso en la matriz.
 */
/**
 * §64 · la ficha se lee con `leerFicha`, que acepta la forma nueva (diagnóstico
 * y cuatro cuadrantes) y traduce la anterior (resumen, acciones, huecos).
 */
const fichaDe = leerFicha;

function origenDe(f: Recomendacion): string {
  if (f.origin === "AGENTE") return AGENTE;
  return f.generatedBy ? `${f.generatedBy.name} desde un cliente de IA` : "Cliente de IA";
}

export function FichaDeAnalisis({
  fichas,
  estado,
  encendido,
  puedeAnalizar,
  zona,
  opportunityId,
  accion,
}: {
  fichas: Recomendacion[];
  estado: EstadoDeAnalisis | null;
  /** Hay llave de Anthropic en este ambiente. */
  encendido: boolean;
  /** Tiene el permiso ANALIZAR_CON_IA y la oportunidad está abierta. */
  puedeAnalizar: boolean;
  zona: string;
  opportunityId: string;
  accion: (entrada: SolicitudDeAnalisis) => Promise<ResultadoAccion<null>>;
}) {
  const [actual, ...anteriores] = fichas;
  const analizando = enCurso(estado?.analysisStartedAt ?? null, new Date());
  const fallo = !analizando && estado?.analysisError ? estado.analysisError : null;

  const boton = puedeAnalizar ? (
    <AnalizarConIa opportunityId={opportunityId} zona={zona} accion={accion} disabled={!encendido || analizando} />
  ) : null;

  const aviso = !encendido ? (
    <Aviso tono="neutro">El agente está apagado en este ambiente.</Aviso>
  ) : analizando ? (
    <Aviso tono="acento">
      Analizando… <RefrescoPeriodico />
    </Aviso>
  ) : fallo ? (
    <Aviso tono="peligro">No se pudo analizar: {fallo}</Aviso>
  ) : null;

  if (!actual) {
    return (
      <div className="space-y-4">
        {aviso}
        <EstadoVacio
          titulo="Sin análisis todavía"
          explicacion={
            puedeAnalizar
              ? "Pide la ficha de estado al agente cuando la necesites."
              : "Quien tenga el permiso puede pedirla aquí; también se puede guardar desde un cliente de IA."
          }
          accion={boton ?? <span />}
        />
      </div>
    );
  }

  const ficha = fichaDe(actual.payload);
  const hrefActividades = `/oportunidades/${opportunityId}?p=actividades`;

  return (
    <div className="space-y-6">
      {aviso}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {ficha ? <Pastilla tono={TONO_DE_ESTADO[ficha.etiqueta]}>{TEXTO_DE_ESTADO[ficha.etiqueta]}</Pastilla> : null}
            <span className="text-xs text-texto-tenue">
              Generada el {fechaEn(actual.generatedAt, zona)} a las {horaEn(actual.generatedAt, zona)} · {origenDe(actual)}
              {actual.model ? ` · ${actual.model}` : ""}
            </span>
          </div>
        </div>
        {boton}
      </div>

      {ficha ? (
        <>
          <section aria-labelledby="diagnostico" className="rounded-md border border-borde bg-superficie-sutil px-4 py-3">
            <h3 id="diagnostico" className="text-sm font-semibold text-texto-titulo">
              Diagnóstico
            </h3>
            <p className="mt-1 max-w-prose text-sm text-texto-cuerpo">{ficha.diagnostico}</p>
          </section>
          {/* §64 · cuatro cuadrantes: arriba lo que hay (a favor y en contra), abajo lo que sigue. */}
          <div className="grid gap-4 md:grid-cols-2">
            <Cuadrante titulo="Fortalezas" vacio="Sin fortalezas citadas." tono="exito" puntos={ficha.fortalezas} href={hrefActividades} />
            <Cuadrante titulo="Riesgos" vacio="Sin riesgos citados." tono="peligro" puntos={ficha.riesgos} href={hrefActividades} />
            <Cuadrante
              titulo="Siguientes pasos"
              vacio="Sin tareas ni reuniones pendientes."
              tono="acento"
              puntos={ficha.siguientesPasos}
              href={hrefActividades}
            />
            <Cuadrante titulo="Recomendaciones" vacio="Sin recomendaciones." tono="alerta" puntos={ficha.recomendaciones} href={hrefActividades} />
          </div>
        </>
      ) : (
        <Aviso tono="peligro">La ficha guardada no se puede leer.</Aviso>
      )}

      {anteriores.length > 0 ? (
        <details className="rounded-md border border-borde">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-texto-titulo">
            Versiones anteriores ({anteriores.length})
          </summary>
          <ul className="divide-y divide-borde">
            {anteriores.map((f) => {
              const v = fichaDe(f.payload);
              return (
                <li key={f.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2 text-sm">
                  {v ? <Pastilla tono={TONO_DE_ESTADO[v.etiqueta]}>{TEXTO_DE_ESTADO[v.etiqueta]}</Pastilla> : null}
                  <span className="text-xs text-texto-tenue">
                    {fechaEn(f.generatedAt, zona)} · {origenDe(f)}
                  </span>
                  {v ? <span className="basis-full text-texto-cuerpo">{v.diagnostico}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Aviso({ tono, children }: { tono: "neutro" | "acento" | "peligro"; children: React.ReactNode }) {
  const clase =
    tono === "peligro"
      ? "border-coral/40 bg-coral/10"
      : tono === "acento"
        ? "border-acento/40 bg-acento/10"
        : "border-borde bg-superficie-sutil";
  return (
    <p role="status" className={`rounded-sm border px-3 py-2 text-xs text-texto-cuerpo ${clase}`}>
      {children}
    </p>
  );
}

const MARCA: Record<"exito" | "peligro" | "acento" | "alerta", { punto: string; borde: string }> = {
  exito: { punto: "marker:text-exito", borde: "border-t-exito" },
  peligro: { punto: "marker:text-coral", borde: "border-t-coral" },
  acento: { punto: "marker:text-acento", borde: "border-t-acento" },
  alerta: { punto: "marker:text-alerta", borde: "border-t-alerta" },
};

function Cuadrante({
  titulo,
  vacio,
  tono,
  puntos,
  href,
}: {
  titulo: string;
  vacio: string;
  tono: keyof typeof MARCA;
  puntos: PuntoDeFicha[];
  href: string;
}) {
  return (
    <section className={`rounded-md border border-borde border-t-2 bg-superficie-tarjeta px-4 py-3 ${MARCA[tono].borde}`}>
      <h3 className="text-sm font-semibold text-texto-titulo">{titulo}</h3>
      {puntos.length === 0 ? (
        <p className="mt-2 text-sm text-texto-tenue">{vacio}</p>
      ) : (
        <ul className={`mt-2 list-disc space-y-2 pl-5 ${MARCA[tono].punto}`}>
          {puntos.map((p) => (
            <li key={`${p.descripcion}·${p.cita ?? ""}`} className="text-sm">
              <p className="text-texto-cuerpo">{p.descripcion}</p>
              {p.cita ? (
                <p className="mt-0.5 text-xs italic text-texto-tenue">
                  «{p.cita}»{" "}
                  <Link href={href} className="not-italic text-acento hover:underline">
                    Ver actividades
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
