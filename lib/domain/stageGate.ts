import { formatUSD, type Money } from "@/lib/money";

/**
 * El evaluador de compuertas de etapa · RN-02, INV-13.
 *
 * Genérico: recibe la lista de requisitos que la etapa declara en
 * `Stage.gateRequires` y el contexto de la oportunidad. **No sabe nombres de
 * etapa.** Un `switch` sobre «Negociación» o «Cierre» sería un defecto — las
 * etapas son datos, y Administración puede renombrarlas o agregar una sin que
 * este archivo cambie.
 *
 * Agregar un requisito nuevo es agregar un caso al tipo y su evaluador, sin
 * tocar las pantallas (§8.3).
 *
 * Los requisitos de comité se resuelven **vía MEDDIC**, no como validación
 * paralela (§2.1): por eso existe `MEDDIC_E_CONFIRMADO` y no un
 * `DECISOR_ECONOMICO_IDENTIFICADO` aparte.
 */
export type GateRequirement =
  | "PERSONA_CON_ROL_DECLARADO"
  | "PROPUESTA_CARGADA"
  | "CONTRATO_O_OC_CARGADO"
  | "COTIZACION_CONGELADA"
  | "HITOS_CAPTURADOS"
  | "HITOS_CUADRADOS"
  | "MEDDIC_E_CONFIRMADO"
  | "MEDDIC_MIN_CIERRE"
  | "SIN_AUTORIZACION_PENDIENTE";

export type GateContext = {
  tienePersonaConRol: boolean;
  tienePropuestaCargada: boolean;
  tieneContratoOrdenCompra: boolean;
  tieneCotizacionCongelada: boolean;
  cantidadHitos: number;
  /**
   * Neto de la cotización congelada menos la suma de hitos. Positivo = falta
   * por asignar; negativo = sobra. `null` cuando todavía no hay cotización
   * congelada contra la cual cuadrar.
   */
  diferenciaHitos: Money | null;
  meddicScore: number;
  meddicDecisorConfirmado: boolean;
  autorizacionesPendientes: number;
  /** INV-05 · de CommercialPolicy, no una constante. */
  meddicMinToClosing: number;
};

export type GateFailure = { requirement: GateRequirement; message: string };
export type GateResult = { ok: boolean; missing: GateFailure[] };

/**
 * Evalúa los requisitos y devuelve **todos** los que faltan, no solo el
 * primero. Reportar de a uno obliga al vendedor a arreglar, reintentar y
 * descubrir el siguiente: hay que decirle todo de una vez.
 */
export function evaluateGate(
  requirements: readonly GateRequirement[],
  ctx: GateContext,
): GateResult {
  const missing: GateFailure[] = [];

  for (const requirement of requirements) {
    const message = evaluarUno(requirement, ctx);
    if (message !== null) missing.push({ requirement, message });
  }

  return { ok: missing.length === 0, missing };
}

/** Devuelve `null` si el requisito se cumple, o el mensaje de lo que falta. */
function evaluarUno(requirement: GateRequirement, ctx: GateContext): string | null {
  switch (requirement) {
    case "PERSONA_CON_ROL_DECLARADO":
      return ctx.tienePersonaConRol
        ? null
        : "Falta declarar el contacto principal y su rol en el comité de compra.";

    case "PROPUESTA_CARGADA":
      return ctx.tienePropuestaCargada
        ? null
        : "Falta cargar la propuesta comercial en la pestaña de Documentos.";

    case "CONTRATO_O_OC_CARGADO":
      return ctx.tieneContratoOrdenCompra
        ? null
        : "Falta cargar el contrato o la orden de compra en la pestaña de Documentos.";

    case "COTIZACION_CONGELADA":
      return ctx.tieneCotizacionCongelada
        ? null
        : "Falta congelar la cotización. Mientras sea borrador, el importe puede cambiar.";

    case "HITOS_CAPTURADOS":
      return ctx.cantidadHitos > 0
        ? null
        : "Falta capturar el calendario de facturación en la pestaña de Hitos.";

    case "HITOS_CUADRADOS":
      return evaluarCuadreDeHitos(ctx);

    case "MEDDIC_E_CONFIRMADO":
      return ctx.meddicDecisorConfirmado
        ? null
        : "Falta confirmar el Decisor económico en MEDDIC, con evidencia y la persona ligada.";

    case "MEDDIC_MIN_CIERRE":
      return ctx.meddicScore >= ctx.meddicMinToClosing
        ? null
        : `El puntaje MEDDIC es ${ctx.meddicScore} y se necesitan ${ctx.meddicMinToClosing} para entrar a Cierre.`;

    case "SIN_AUTORIZACION_PENDIENTE":
      return ctx.autorizacionesPendientes === 0
        ? null
        : ctx.autorizacionesPendientes === 1
          ? "Hay una autorización de descuento pendiente. No se puede avanzar hasta que se resuelva."
          : `Hay ${ctx.autorizacionesPendientes} autorizaciones de descuento pendientes. No se puede avanzar hasta que se resuelvan.`;
  }
}

/**
 * RN-06, AC-18 · el mensaje dice la cifra concreta.
 *
 * «faltan $200,000 por asignar», no «los hitos no cuadran». El segundo obliga a
 * ir a otra pantalla a averiguar cuánto.
 */
function evaluarCuadreDeHitos(ctx: GateContext): string | null {
  if (ctx.diferenciaHitos === null) {
    return "Falta congelar la cotización para poder cuadrar los hitos contra su neto.";
  }
  if (ctx.diferenciaHitos.isZero()) return null;

  return ctx.diferenciaHitos.isPositive()
    ? `Faltan ${formatUSD(ctx.diferenciaHitos)} por asignar en hitos.`
    : `Sobran ${formatUSD(ctx.diferenciaHitos.abs())} en hitos: exceden el neto de la cotización.`;
}
