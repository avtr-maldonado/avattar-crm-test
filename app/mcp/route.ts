import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { desafioDeBearer, origenDe, verificarPortador } from "@/lib/mcp/auth";
import { crearServidorMcp } from "@/lib/mcp/servidor";

/**
 * `POST /mcp` · el servidor MCP del CRM (decisiones §61).
 *
 * Transporte HTTP «streamable» sin estado: cada request arma su servidor con
 * la sesión del bearer, lo conecta a un transporte nuevo y responde en JSON.
 * Sin sesiones ni Redis: no hay nada que recordar entre llamadas, porque cada
 * una trae su token y su alcance.
 *
 * Sin bearer válido se responde 401 con `WWW-Authenticate` apuntando a los
 * metadatos del recurso (RFC 9728): es lo que el cliente de IA sigue para
 * descubrir Supabase Auth y pedir autorización. Con bearer pero sin perfil en
 * el CRM, 403.
 */
export async function POST(request: Request): Promise<Response> {
  const origen = origenDe(request);
  const bearer = await verificarPortador(request);
  if (!bearer.ok) {
    return Response.json(
      { error: bearer.estado === 401 ? "invalid_token" : "forbidden", error_description: bearer.mensaje },
      {
        status: bearer.estado,
        headers: bearer.estado === 401 ? { "www-authenticate": desafioDeBearer(origen) } : {},
      },
    );
  }

  const server = crearServidorMcp(bearer.sesion);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request, {
    authInfo: { token: bearer.sesion.token, clientId: bearer.sesion.clientId, scopes: bearer.sesion.scopes },
  });
}

/** Sin estado no hay flujo de notificaciones del servidor ni sesión que cerrar. */
function sinMetodo(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function GET(): Promise<Response> {
  return sinMetodo();
}

export async function DELETE(): Promise<Response> {
  return sinMetodo();
}
