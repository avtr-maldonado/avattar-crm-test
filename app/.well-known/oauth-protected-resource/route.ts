import { metadatosDelRecurso, origenDe } from "@/lib/mcp/auth";

/**
 * Metadatos del recurso protegido (RFC 9728) · decisiones §61.
 *
 * Es lo primero que un cliente de IA lee al recibir un 401 de `/mcp`: dónde
 * está el servidor de autorización (Supabase Auth) y qué alcances existen.
 * Pública y con CORS abierto: la lee cualquier cliente desde cualquier origen,
 * y no dice nada que no sea público.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version",
};

export async function GET(request: Request): Promise<Response> {
  return Response.json(metadatosDelRecurso(origenDe(request)), { headers: { ...CORS, "cache-control": "public, max-age=300" } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}
