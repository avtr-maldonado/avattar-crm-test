import type { Prisma } from "@prisma/client";

/**
 * El folio del prospecto · `PRO-AAAA-NNNNN`, consecutivo por año, con un
 * contador propio para no mezclarlo con el de oportunidades (RN-20: nunca
 * `count() + 1`; el `INSERT … ON CONFLICT … RETURNING` es atómico dentro de la
 * transacción del alta).
 */
const ANCHO = 5;

export function formatFolioDeProspecto(year: number, consecutivo: number): string {
  return `PRO-${year}-${String(consecutivo).padStart(ANCHO, "0")}`;
}

export async function nextFolioDeProspecto(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const filas = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO lead_folio_counters (year, last_number)
    VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = lead_folio_counters.last_number + 1
    RETURNING last_number
  `;
  const consecutivo = filas[0]?.last_number;
  if (consecutivo === undefined) throw new Error(`No se pudo reservar el folio de prospecto del año ${year}.`);
  return formatFolioDeProspecto(year, consecutivo);
}
