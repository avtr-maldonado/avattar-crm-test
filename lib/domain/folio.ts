import type { Prisma } from "@prisma/client";

/**
 * El folio · RN-20, INV-12.
 *
 * Formato `OPP-AAAA-NNNNN`, consecutivo **por año**, único e inmutable — no
 * cambia ni al reabrir una oportunidad cerrada.
 *
 * ## Por qué no `count() + 1`
 *
 * Dos altas simultáneas leerían el mismo conteo y producirían el mismo folio.
 * El spec lo prohíbe explícitamente.
 *
 * ## Por qué no una secuencia de Postgres
 *
 * Una secuencia global no reinicia en enero: el esquema anterior usaba
 * `nextval('seq_oportunidad_folio')` y el 1 de enero de 2027 habría emitido
 * `OPP-2027-00015` en vez de `OPP-2027-00001`.
 *
 * ## Lo que sí
 *
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` sobre `folio_counters`. Es una
 * sola sentencia atómica: Postgres toma el candado de fila, así que dos altas
 * concurrentes se serializan y reciben números distintos. El `INSERT` cubre el
 * primer folio del año sin necesitar un paso previo.
 */

const ANCHO_CONSECUTIVO = 5;

/**
 * Reserva el siguiente folio del año dentro de la transacción de alta.
 *
 * Debe llamarse con el cliente de transacción: si el alta falla, el consecutivo
 * se revierte con ella y no quedan huecos.
 */
export async function nextFolio(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const filas = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO folio_counters (year, last_number)
    VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = folio_counters.last_number + 1
    RETURNING last_number
  `;

  const consecutivo = filas[0]?.last_number;
  if (consecutivo === undefined) {
    throw new Error(`No se pudo reservar el folio del año ${year}.`);
  }

  return formatFolio(year, consecutivo);
}

/** `OPP-2026-00417`. Separado para poder probarlo sin base. */
export function formatFolio(year: number, consecutivo: number): string {
  return `OPP-${year}-${String(consecutivo).padStart(ANCHO_CONSECUTIVO, "0")}`;
}

/** Reconoce un folio bien formado. Para búsquedas y validación de entrada. */
export const PATRON_FOLIO = /^OPP-(\d{4})-(\d{5})$/;

export function esFolioValido(folio: string): boolean {
  return PATRON_FOLIO.test(folio);
}
