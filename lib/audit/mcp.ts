import type { McpCallResult, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Registro de acceso del servidor MCP · decisiones §61.
 *
 * Una fila por llamada a una herramienta: quién, desde qué cliente, qué
 * herramienta, con qué parámetros, sobre qué oportunidad, cuánto tardó y cómo
 * terminó. Se escribe **siempre**, también en rechazo y error, y fuera de la
 * transacción de la herramienta: es registro de acceso, no la bitácora de
 * negocio (esa es `AuditLog`, INV-09, y la escribe el servicio).
 *
 * Si el registro falla no se tumba la respuesta: se anota en la consola del
 * servidor. Lo contrario convertiría una tabla de registro en un punto de
 * falla de todo el MCP.
 */
export type LlamadaMcp = {
  userId: string;
  clientId: string;
  tool: string;
  params: unknown;
  opportunityId: string | null;
  durationMs: number;
  result: McpCallResult;
  message: string | null;
};

export async function registrarLlamadaMcp(llamada: LlamadaMcp): Promise<void> {
  try {
    await prisma.mcpToolCall.create({
      data: {
        userId: llamada.userId,
        clientId: llamada.clientId,
        tool: llamada.tool,
        params: (llamada.params ?? {}) as Prisma.InputJsonValue,
        opportunityId: llamada.opportunityId,
        durationMs: Math.max(0, Math.round(llamada.durationMs)),
        result: llamada.result,
        message: llamada.message,
      },
    });
  } catch (e) {
    console.error("[mcp] no se pudo registrar la llamada", llamada.tool, e);
  }
}
