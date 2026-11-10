import { z, type ZodType } from "zod";

/**
 * Cursores de paginación del MCP · decisiones §61.
 *
 * Opacos para el agente: base64url de un JSON pequeño. Un cursor corrupto o de
 * otra herramienta **se rechaza** en vez de reiniciar en la primera página en
 * silencio: un agente que recibiera otra vez la primera página creería que la
 * lista no avanza y seguiría pidiendo.
 */
export const CursorDeBusqueda = z.object({ skip: z.number().int().nonnegative() }).strict();
export const CursorDeActividades = z.object({ startsAt: z.string().datetime(), id: z.string().min(1) }).strict();

export function codificarCursor(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor), "utf8").toString("base64url");
}

export function decodificarCursor<T>(
  cursor: string | undefined,
  esquema: ZodType<T>,
): { ok: true; valor: T | null } | { ok: false } {
  if (cursor === undefined || cursor === "") return { ok: true, valor: null };
  try {
    const r = esquema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
