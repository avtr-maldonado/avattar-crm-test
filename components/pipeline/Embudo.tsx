import Link from "next/link";
import { clsx } from "clsx";
import { EstadoVacio } from "@/components/ui/primitivas";

/**
 * Vista de embudo de P-01.
 *
 * ## Dos preguntas, dos lados
 *
 * A la izquierda, **dónde está parado el dinero**: una barra por etapa, larga
 * en proporción a la etapa que más acumula. A la derecha, **qué se está
 * cayendo**: la cola de riesgo, ordenada por valor.
 *
 * No es el trapecio clásico. Un embudo que se angosta hace que el área —lo que
 * el ojo lee primero— no signifique nada, y con cinco etapas de valores muy
 * distintos se vuelve ilegible justo donde importa. Barras horizontales sobre
 * una misma línea de salida dejan comparar etapas de un vistazo, que es la
 * pregunta real: ¿en qué etapa se está juntando el dinero?
 *
 * ## La tasa va debajo, no dentro
 *
 * El largo de la barra es un inventario; la tasa de paso es un flujo. Son
 * cifras de naturaleza distinta y por eso ocupan líneas distintas: meter el
 * porcentaje dentro de la barra invitaría a leerlo como parte de ella.
 *
 * Presentacional y de servidor: todo llega formateado. No hay `Decimal` ni
 * lógica de negocio cruzando a la pantalla.
 */
export type EtapaVisible = {
  nombre: string;
  /** Ya formateado: «$1,061,000.00». */
  valor: string;
  cuantas: number;
  /** 0 a 1, contra la etapa de mayor valor. */
  fraccionDeBarra: number;
  tasaDePaso: number | null;
  base: number;
  pasaron: number;
  vieneDe: string | null;
  esCierre: boolean;
};

export type RiesgoVisible = {
  id: string;
  folio: string;
  nombre: string;
  /** La bandera escrita con su número: «Estancada 26 días en Negociación». */
  motivo: string;
  importe: string;
  propietario: string;
  tono: "peligro" | "alerta";
};

const PORCENTAJE = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export function Embudo({
  etapas,
  riesgos,
  ventanaEnDias,
  accionVacio,
}: {
  etapas: EtapaVisible[];
  riesgos: RiesgoVisible[];
  ventanaEnDias: number;
  accionVacio: React.ReactNode;
}) {
  const hayValor = etapas.some((e) => e.cuantas > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <section className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-4">
        <h2 className="text-sm font-semibold text-texto-titulo">
          Embudo · conversión etapa a etapa
        </h2>
        <p className="mt-0.5 text-xs text-texto-tenue">
          Valor abierto ahora y tasa de paso de los últimos {ventanaEnDias} días.
        </p>

        {hayValor ? (
          <ol className="mt-5 space-y-4">
            {etapas.map((e) => (
              <li key={e.nombre}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="truncate text-sm font-medium text-texto-titulo">{e.nombre}</p>
                  <p className="tabular shrink-0 text-xs text-texto-tenue">
                    {e.valor} · {e.cuantas} {e.cuantas === 1 ? "oportunidad" : "oportunidades"}
                  </p>
                </div>

                <div className="mt-1.5 h-4 overflow-hidden rounded-xs bg-superficie-sutil">
                  <div
                    className={clsx(
                      "h-full rounded-xs transition-[width] duration-base ease-estandar",
                      // Verde solo donde el pipeline marca el cierre: es el dato
                      // del pipeline, no un umbral de probabilidad (INV-05) ni
                      // un `switch` por nombre de etapa (INV-13).
                      e.esCierre ? "bg-exito" : "bg-acento",
                    )}
                    style={{ width: `${Math.max(e.fraccionDeBarra * 100, e.cuantas > 0 ? 1.5 : 0)}%` }}
                  />
                </div>

                <p className="mt-1 text-xs text-texto-tenue">{leyendaDePaso(e)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-5">
            <EstadoVacio
              titulo="No hay nada abierto en este pipeline"
              explicacion="Con los filtros actuales no queda ninguna oportunidad abierta, así que no hay embudo que medir."
              accion={accionVacio}
            />
          </div>
        )}
      </section>

      <ColaDeRiesgo riesgos={riesgos} />
    </div>
  );
}

/**
 * La línea bajo la barra.
 *
 * Cuando no hay con qué medir se dice eso, no «0 %». Cero sería una afirmación
 * sobre el equipo —«ninguna pasó»— y la verdad es que nadie entró a la etapa
 * anterior en la ventana.
 */
function leyendaDePaso(e: EtapaVisible): string {
  if (e.vieneDe === null) return "Entrada del proceso";
  if (e.tasaDePaso === null) {
    return `Nadie entró a ${e.vieneDe} en la ventana: no hay con qué medirlo`;
  }
  return `${PORCENTAJE.format(e.tasaDePaso * 100)} % avanza de ${e.vieneDe} · ${e.pasaron} de ${e.base}`;
}

function ColaDeRiesgo({ riesgos }: { riesgos: RiesgoVisible[] }) {
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-4">
      <h2 className="text-sm font-semibold text-texto-titulo">Cola de riesgo</h2>
      <p className="mt-0.5 text-xs text-texto-tenue">
        Ordenada por valor: sin actividad futura, estancada o margen bajo el piso.
      </p>

      {riesgos.length === 0 ? (
        <p className="mt-5 rounded-sm border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-tenue">
          Nada con bandera activa. Todo lo abierto tiene próximo paso, se movió a tiempo y cotiza
          sobre el piso de margen.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-borde">
          {riesgos.map((r) => (
            <li key={r.id}>
              <Link
                href={`/oportunidades/${r.id}`}
                className="flex items-start gap-3 py-2.5 transition-colors duration-rapido hover:bg-superficie-sutil"
              >
                <span
                  aria-hidden
                  className={clsx(
                    "mt-0.5 h-9 w-0.5 shrink-0 rounded-pill",
                    // §13.1 · coral es lo que cuesta dinero o clientes; lima, lo
                    // que todavía es un problema de ritmo.
                    r.tono === "peligro" ? "bg-coral" : "bg-lima",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto-titulo">{r.nombre}</p>
                  <p
                    className={clsx(
                      "truncate text-xs",
                      r.tono === "peligro" ? "text-coral" : "text-navy-500",
                    )}
                  >
                    {r.motivo}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm font-semibold text-texto-titulo">{r.importe}</p>
                  <p className="truncate text-xs text-texto-tenue">{r.propietario}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
