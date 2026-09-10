import type { OportunidadSeed } from "./datos";

/**
 * Las actividades que respaldan las fechas de cada oportunidad.
 *
 * ## Por qué existe este módulo
 *
 * El seed pone `lastActivityAt` y `nextActivityAt` en la oportunidad, pero sin
 * filas de `Activity` esas fechas no tienen nada detrás: la bitácora de P-02
 * saldría vacía junto a una fecha de última actividad, y P-07 no tendría qué
 * mostrar. Es el mismo defecto que tenía `meddicScore` antes de derivarlo de
 * sus componentes.
 *
 * Aquí las fechas mandan y las actividades se derivan de ellas, no al revés:
 * así las banderas de riesgo siguen dando los totales verificados de §15.
 *
 * ## Lo que produce
 *
 * Por oportunidad, dos o tres actividades **realizadas** que llegan hasta
 * `lastActivityAt`, y una **pendiente** en `nextActivityAt` si la hay. Las que
 * no tienen próxima —OPP-2026-00374 y OPP-2026-00322— se quedan sin pendiente,
 * que es exactamente lo que las pone en la tercera lista de la bandeja de
 * trabajo (§12.4) y lo que enciende su bandera (RN-10).
 */
export type ActividadDerivada = {
  tipo: string;
  asunto: string;
  /** Días respecto a la fecha base del escenario. Negativo = pasado. */
  dias: number;
  realizada: boolean;
  notas?: string;
  resultado?: string;
};

/** El guion de contacto según la etapa: no se llama igual a un prospecto que a un cierre. */
const GUION_POR_ETAPA: Record<string, { tipo: string; asunto: string; notas: string }[]> = {
  Calificación: [
    {
      tipo: "Llamada",
      asunto: "Primer contacto",
      notas: "Se confirma el interés y quién lleva el tema internamente.",
    },
    {
      tipo: "Correo enviado",
      asunto: "Envío de presentación institucional",
      notas: "Material de capacidades y casos comparables.",
    },
  ],
  Descubrimiento: [
    {
      tipo: "Videollamada",
      asunto: "Sesión de descubrimiento",
      notas: "Se levantan requerimientos y se identifica quién decide.",
    },
    {
      tipo: "Taller técnico",
      asunto: "Taller de arquitectura",
      notas: "Se revisa el estado actual y las restricciones técnicas.",
    },
    {
      tipo: "Seguimiento",
      asunto: "Seguimiento de la sesión técnica",
      notas: "Se responden las dudas que quedaron abiertas.",
    },
  ],
  Propuesta: [
    {
      tipo: "Envío de propuesta",
      asunto: "Envío de propuesta comercial",
      notas: "Alcance, tiempos y condiciones comerciales.",
    },
    {
      tipo: "Presentación a comité",
      asunto: "Presentación al comité técnico",
      notas: "Se expone la solución ante el equipo evaluador.",
    },
    {
      tipo: "Seguimiento",
      asunto: "Seguimiento de la propuesta",
      notas: "Se confirma recepción y se acuerdan los siguientes pasos.",
    },
  ],
  Negociación: [
    {
      tipo: "Reunión presencial",
      asunto: "Revisión de condiciones comerciales",
      notas: "Se negocian precio, plazos y niveles de servicio.",
    },
    {
      tipo: "Videollamada",
      asunto: "Ajuste de alcance",
      notas: "Se acota el alcance para encuadrar el presupuesto.",
    },
    {
      tipo: "Correo recibido",
      asunto: "Contrapropuesta del cliente",
      notas: "El cliente pide revisar dos puntos del contrato.",
    },
  ],
  Cierre: [
    {
      tipo: "Reunión presencial",
      asunto: "Revisión legal del contrato",
      notas: "Se acuerdan los últimos ajustes con el área jurídica.",
    },
    {
      tipo: "Llamada",
      asunto: "Confirmación de firma",
      notas: "Se confirma la fecha en que se libera la orden de compra.",
    },
  ],
};

const PROXIMA_POR_ETAPA: Record<string, { tipo: string; asunto: string }> = {
  Calificación: { tipo: "Llamada", asunto: "Calificar presupuesto y tiempos" },
  Descubrimiento: { tipo: "Videollamada", asunto: "Validar requerimientos con el área usuaria" },
  Propuesta: { tipo: "Presentación a comité", asunto: "Presentar propuesta al comité de compra" },
  Negociación: { tipo: "Reunión presencial", asunto: "Cerrar condiciones comerciales" },
  Cierre: { tipo: "Llamada", asunto: "Confirmar liberación de la orden de compra" },
};

/**
 * Deriva las actividades de una oportunidad.
 *
 * Las realizadas se reparten hacia atrás desde `lastActivityAt`, para que la
 * bitácora tenga profundidad y no una sola línea. La pendiente cae exactamente
 * en `nextActivityAt`: si esa fecha ya pasó cuando alguien abre la pantalla,
 * aparece como vencida, que es lo correcto y lo que la bandeja debe mostrar.
 */
export function derivarActividades(o: OportunidadSeed): ActividadDerivada[] {
  const guion = GUION_POR_ETAPA[o.etapa] ?? GUION_POR_ETAPA.Calificación;
  const diasUltima = -Math.min(o.diasEnEtapa, 3);

  const realizadas: ActividadDerivada[] = guion.map((paso, i) => ({
    tipo: paso.tipo,
    asunto: paso.asunto,
    // La última cae en `lastActivityAt`; las previas, una semana antes cada una.
    dias: diasUltima - (guion.length - 1 - i) * 7,
    realizada: true,
    notas: paso.notas,
    resultado: i === guion.length - 1 ? "Avanza según lo previsto." : undefined,
  }));

  if (o.proximaActividadEnDias === null) return realizadas;

  const proxima = PROXIMA_POR_ETAPA[o.etapa] ?? PROXIMA_POR_ETAPA.Calificación;
  return [
    ...realizadas,
    {
      tipo: proxima.tipo,
      asunto: proxima.asunto,
      dias: o.proximaActividadEnDias,
      realizada: false,
    },
  ];
}
