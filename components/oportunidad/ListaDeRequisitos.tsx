import type { GateFailure, GateRequirement } from "@/lib/domain/stageGate";
import { Pastilla } from "@/components/ui/primitivas";

/**
 * Qué falta para avanzar · §11 P-02, RN-02.
 *
 * ## Por qué muestra la etapa SIGUIENTE
 *
 * §8.3 define `gateRequires` como «requisitos para ENTRAR a esta etapa», así
 * que los de la etapa actual ya se cumplieron: mostrarlos es un recibo, no una
 * tarea. Lo accionable es qué falta para avanzar, y eso es lo que esta lista
 * responde. El título lo dice explícitamente para que no se confunda con lo
 * otro.
 *
 * ## Los mensajes vienen del dominio, no de aquí
 *
 * §13.5 · «Los mensajes de error dicen qué falta y cómo arreglarlo, con el dato
 * concreto: "faltan $200,000 por asignar en hitos", no "datos inválidos".» Esos
 * textos los produce `evaluateGate`, que es donde vive la regla y donde están
 * las pruebas. Este componente los pinta.
 *
 * ## Advertencia y bloqueo se ven distinto
 *
 * `Stage.gateMode` decide si la compuerta detiene o solo avisa (§8.3, que
 * recomienda arrancar en advertencia el primer trimestre). Un requisito que no
 * detiene nada no debe verse igual que uno que sí: mezclar los dos enseña a
 * ignorar ambos.
 */
export function ListaDeRequisitos({
  etapaDestino,
  requisitos,
  faltantes,
  modo,
}: {
  etapaDestino: string;
  requisitos: readonly GateRequirement[];
  faltantes: GateFailure[];
  modo: "ADVERTENCIA" | "BLOQUEANTE";
}) {
  if (requisitos.length === 0) {
    return (
      <p className="text-sm text-texto-tenue">
        Avanzar a <strong className="font-medium text-texto-cuerpo">{etapaDestino}</strong>{" "}
        no tiene requisitos configurados.
      </p>
    );
  }

  const faltantesPorCodigo = new Map(faltantes.map((f) => [f.requirement, f.message]));
  const cumplidos = requisitos.length - faltantes.length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-texto-titulo">
          Para avanzar a {etapaDestino}
        </h3>
        <span className="tabular text-xs text-texto-tenue">
          {cumplidos} de {requisitos.length}
        </span>
        {faltantes.length > 0 && (
          <Pastilla tono={modo === "BLOQUEANTE" ? "peligro" : "alerta"}>
            {modo === "BLOQUEANTE" ? "Bloquea el avance" : "Advierte, no bloquea"}
          </Pastilla>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {requisitos.map((r) => {
          const mensaje = faltantesPorCodigo.get(r);
          const cumplido = mensaje === undefined;

          return (
            <li key={r} className="flex gap-2.5 text-sm">
              <span
                aria-hidden
                className={
                  cumplido
                    ? "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-pill bg-exito/15 text-[10px] font-bold text-exito"
                    : "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-pill bg-coral/15 text-[10px] font-bold text-coral"
                }
              >
                {cumplido ? "✓" : "!"}
              </span>
              <span className={cumplido ? "text-texto-tenue" : "text-texto-cuerpo"}>
                <span className="sr-only">{cumplido ? "Cumplido: " : "Falta: "}</span>
                {mensaje ?? ETIQUETA_REQUISITO[r]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Cómo se nombra un requisito **cumplido**. El texto de lo que falta lo escribe
 * `evaluateGate`, porque incluye el dato concreto —cuánto falta por asignar, qué
 * puntaje se tiene contra cuál se necesita— y eso solo se sabe evaluando.
 */
const ETIQUETA_REQUISITO: Record<GateRequirement, string> = {
  PERSONA_CON_ROL_DECLARADO: "Contacto principal con rol en el comité de compra",
  PROPUESTA_CARGADA: "Propuesta comercial cargada",
  CONTRATO_O_OC_CARGADO: "Contrato u orden de compra cargados",
  COTIZACION_CONGELADA: "Cotización con líneas",
  HITOS_CAPTURADOS: "Calendario de facturación capturado",
  HITOS_CUADRADOS: "Los hitos cuadran contra el neto de la cotización",
  MEDDIC_E_CONFIRMADO: "Decisor económico confirmado en MEDDIC",
  MEDDIC_MIN_CIERRE: "Puntaje MEDDIC sobre el mínimo de cierre",
  SIN_AUTORIZACION_PENDIENTE: "Sin autorizaciones de descuento pendientes",
};
