/**
 * Fechas y periodos · §9.3.
 *
 * «Un rango de fechas sin decir sobre qué campo aplica produce números que
 * nadie puede reproducir.» Por eso `dateField` es obligatorio junto con el
 * rango, y por eso nunca queda implícito: si el usuario no lo eligió, la barra
 * de filtros muestra el que se aplicó (AC-23).
 *
 * Todo se resuelve contra el **año fiscal configurado** (`Country
 * .fiscalYearStartMonth`), no contra el calendario. Hoy son el mismo por
 * omisión (Q-02), pero está parametrizado por si cambia.
 */

export type DateField =
  /** El del pronóstico. El más usado. */
  | "CIERRE_ESTIMADO"
  /** Solo tiene sentido con status distinto de ABIERTA. Mide lo que ya pasó. */
  | "CIERRE_REAL"
  /** Para medir generación de pipeline. */
  | "CREACION"
  /** Para encontrar cuentas frías. */
  | "ULTIMA_ACTIVIDAD";

/** A qué columna de `Opportunity` corresponde cada campo. */
export const CAMPO_PRISMA: Record<DateField, string> = {
  CIERRE_ESTIMADO: "expectedCloseDate",
  CIERRE_REAL: "actualCloseDate",
  CREACION: "createdAt",
  ULTIMA_ACTIVIDAD: "lastActivityAt",
};

export const ETIQUETA_CAMPO: Record<DateField, string> = {
  CIERRE_ESTIMADO: "Cierre estimado",
  CIERRE_REAL: "Cierre real",
  CREACION: "Creación",
  ULTIMA_ACTIVIDAD: "Última actividad",
};

export type DatePreset =
  | "ESTE_TRIMESTRE"
  | "TRIMESTRE_ANTERIOR"
  | "PROXIMO_TRIMESTRE"
  | "ESTE_ANIO"
  | "ANIO_ANTERIOR"
  | "ULTIMOS_30_DIAS"
  | "ULTIMOS_90_DIAS"
  | "VENCIDAS"
  | "PERSONALIZADO";

export const ETIQUETA_PREAJUSTE: Record<DatePreset, string> = {
  ESTE_TRIMESTRE: "Este trimestre",
  TRIMESTRE_ANTERIOR: "Trimestre anterior",
  PROXIMO_TRIMESTRE: "Próximo trimestre",
  ESTE_ANIO: "Este año",
  ANIO_ANTERIOR: "Año anterior",
  ULTIMOS_30_DIAS: "Últimos 30 días",
  ULTIMOS_90_DIAS: "Últimos 90 días",
  VENCIDAS: "Vencidas",
  PERSONALIZADO: "Personalizado",
};

/** `from` nulo significa «sin piso»: solo lo usa VENCIDAS. */
export type Periodo = { from: Date | null; to: Date };

/** Día en UTC, sin hora: las fechas de negocio son `@db.Date`. */
function dia(anio: number, mes: number, diaDelMes: number): Date {
  return new Date(Date.UTC(anio, mes, diaDelMes));
}

/**
 * En qué trimestre fiscal cae una fecha.
 *
 * `fiscalYearStartMonth` es 1..12. Con 1, el año fiscal es el calendario y
 * septiembre cae en T3, como muestra el prototipo. Con 4, el año fiscal empieza
 * en abril y enero pertenece al año fiscal anterior.
 */
export function trimestreDe(
  fecha: Date,
  fiscalYearStartMonth: number,
): { fiscalYear: number; quarter: number } {
  const mes = fecha.getUTCMonth(); // 0..11
  const inicio = fiscalYearStartMonth - 1; // 0..11
  const mesesTranscurridos = (mes - inicio + 12) % 12;
  const fiscalYear = mes >= inicio ? fecha.getUTCFullYear() : fecha.getUTCFullYear() - 1;
  return { fiscalYear, quarter: Math.floor(mesesTranscurridos / 3) + 1 };
}

/** Primer día del trimestre fiscal indicado. */
function inicioDeTrimestre(
  fiscalYear: number,
  quarter: number,
  fiscalYearStartMonth: number,
): Date {
  const mesAbsoluto = fiscalYearStartMonth - 1 + (quarter - 1) * 3;
  return dia(fiscalYear + Math.floor(mesAbsoluto / 12), mesAbsoluto % 12, 1);
}

/** Último día del trimestre: el día anterior al inicio del siguiente. */
function finDeTrimestre(
  fiscalYear: number,
  quarter: number,
  fiscalYearStartMonth: number,
): Date {
  const siguiente = inicioDeTrimestre(
    quarter === 4 ? fiscalYear + 1 : fiscalYear,
    quarter === 4 ? 1 : quarter + 1,
    fiscalYearStartMonth,
  );
  return new Date(siguiente.getTime() - 24 * 60 * 60 * 1000);
}

/** Desplaza un trimestre fiscal, cruzando el fin de año fiscal si hace falta. */
function desplazarTrimestre(
  fiscalYear: number,
  quarter: number,
  delta: number,
): { fiscalYear: number; quarter: number } {
  const indice = (fiscalYear * 4 + (quarter - 1)) + delta;
  return { fiscalYear: Math.floor(indice / 4), quarter: (indice % 4) + 1 };
}

function haceDias(desde: Date, dias: number): Date {
  return dia(
    desde.getUTCFullYear(),
    desde.getUTCMonth(),
    desde.getUTCDate() - dias,
  );
}

/**
 * Traduce un preajuste a un rango concreto.
 *
 * Devuelve `null` para `PERSONALIZADO`: ahí las fechas las pone el usuario y
 * no hay nada que resolver.
 */
export function resolvePeriod(
  preset: DatePreset,
  fiscalYearStartMonth: number,
  ahora: Date,
): Periodo | null {
  const actual = trimestreDe(ahora, fiscalYearStartMonth);
  const hoy = dia(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());

  switch (preset) {
    case "ESTE_TRIMESTRE":
    case "TRIMESTRE_ANTERIOR":
    case "PROXIMO_TRIMESTRE": {
      const delta =
        preset === "ESTE_TRIMESTRE" ? 0 : preset === "TRIMESTRE_ANTERIOR" ? -1 : 1;
      const t = desplazarTrimestre(actual.fiscalYear, actual.quarter, delta);
      return {
        from: inicioDeTrimestre(t.fiscalYear, t.quarter, fiscalYearStartMonth),
        to: finDeTrimestre(t.fiscalYear, t.quarter, fiscalYearStartMonth),
      };
    }

    case "ESTE_ANIO":
    case "ANIO_ANTERIOR": {
      const anio = preset === "ESTE_ANIO" ? actual.fiscalYear : actual.fiscalYear - 1;
      return {
        from: inicioDeTrimestre(anio, 1, fiscalYearStartMonth),
        to: finDeTrimestre(anio, 4, fiscalYearStartMonth),
      };
    }

    case "ULTIMOS_30_DIAS":
      return { from: haceDias(hoy, 30), to: hoy };

    case "ULTIMOS_90_DIAS":
      return { from: haceDias(hoy, 90), to: hoy };

    case "VENCIDAS":
      // Todo lo anterior a hoy, sin piso: una oportunidad con cierre estimado
      // en el pasado sigue siendo relevante por vieja que sea.
      return { from: null, to: haceDias(hoy, 1) };

    case "PERSONALIZADO":
      return null;
  }
}
