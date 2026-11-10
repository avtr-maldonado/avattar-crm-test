import { createClient } from "@supabase/supabase-js";
import type { Session } from "@/lib/auth/permissions";
import { sesionDesdeClaims } from "@/lib/auth/perfil";

/**
 * El bearer del servidor MCP · decisiones §61.
 *
 * Supabase Auth es el servidor OAuth 2.1 y el CRM el *resource server*. El
 * token que llega es un JWT de Supabase emitido a un cliente OAuth: se
 * verifica con el JWKS del proyecto (ES256, en local), se exige el claim
 * `client_id` —un token de sesión del navegador no entra por aquí— y se
 * resuelve el perfil de `public.users` con la **misma** función que la sesión
 * de la app. Ninguna herramienta corre con más alcance que ese usuario; nunca
 * `service_role`.
 *
 * ## Alcances
 *
 * Supabase Auth rechaza alcances propios (`unsupported scope: crm:read`,
 * verificado el 10-nov-2026), así que **al servidor de autorización solo se
 * le piden los que emite** (`ALCANCES_DEL_SERVIDOR`): anunciar `crm:*` en los
 * metadatos o en el desafío haría fallar la autorización de todo cliente que
 * los pidiera. `crm:read` y `crm:write` siguen siendo la unidad en que cada
 * herramienta declara lo que necesita: si un token trajera alcances `crm:*`,
 * se exigen; si no trae ninguno —el caso real—, la puerta queda en la matriz
 * de permisos y el alcance por rol, que son la autorización real. `scopes`
 * queda en el registro de llamadas para saber cuál de los dos casos aplicó.
 */
export const ALCANCES = ["crm:read", "crm:write"] as const;
/** Lo que se pide a Supabase Auth: identidad y correo, con los que se resuelve el perfil. */
export const ALCANCES_DEL_SERVIDOR = ["openid", "email"] as const;
export type Alcance = (typeof ALCANCES)[number];

export type SesionMcp = { session: Session; clientId: string; scopes: string[]; token: string };

export type ResultadoDeBearer =
  | { ok: true; sesion: SesionMcp }
  | { ok: false; estado: 401 | 403; mensaje: string };

/** Solo bajo pruebas: llaves públicas inyectadas en vez del JWKS del proyecto. */
let llavesDePrueba: JsonWebKey[] | null = null;
export function usarLlavesDePrueba(keys: JsonWebKey[] | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("usarLlavesDePrueba solo existe bajo pruebas.");
  llavesDePrueba = keys;
}

export async function verificarPortador(
  request: Request,
  opciones: { keys?: JsonWebKey[] } = {},
): Promise<ResultadoDeBearer> {
  const cabecera = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(cabecera)?.[1]?.trim();
  if (!token) return { ok: false, estado: 401, mensaje: "Falta el token. Autoriza el cliente con OAuth y manda Authorization: Bearer." };

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const keys = opciones.keys ?? llavesDePrueba ?? undefined;
  const { data, error } = await supabase.auth.getClaims(token, keys ? { keys: keys as never } : undefined);
  const claims = data?.claims;
  if (error || !claims) {
    return { ok: false, estado: 401, mensaje: "El token no es válido o venció. Vuelve a autorizar el cliente." };
  }
  if (typeof claims.client_id !== "string" || !claims.client_id) {
    return {
      ok: false,
      estado: 401,
      mensaje: "Este servidor acepta solo tokens emitidos por OAuth a un cliente registrado, no sesiones del navegador.",
    };
  }

  const perfil = await sesionDesdeClaims({ sub: claims.sub, email: claims.email });
  if (!perfil.ok) {
    return { ok: false, estado: 403, mensaje: "Tu cuenta entró, pero no tiene perfil en el CRM. El alta la hace Administración." };
  }

  const scopes = typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter((s) => s.startsWith("crm:")) : [];
  return { ok: true, sesion: { session: perfil.session, clientId: claims.client_id, scopes, token } };
}

/** ¿El token permite este alcance? Sin alcances `crm:*` en el token, decide la matriz. */
export function permiteAlcance(sesion: Pick<SesionMcp, "scopes">, alcance: Alcance): boolean {
  return sesion.scopes.length === 0 || sesion.scopes.includes(alcance);
}

/** El origen público del servidor: `MCP_RESOURCE_URL` si está, si no el del request. */
export function origenDe(request: Request): string {
  const fijo = process.env.MCP_RESOURCE_URL?.trim();
  if (fijo) return fijo.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export const RUTA_DE_METADATOS = "/.well-known/oauth-protected-resource";

/** El `WWW-Authenticate` de un 401 o 403 (RFC 9728 §5.1 y RFC 6750 §3). */
export function desafioDeBearer(origen: string, scope: string = ALCANCES_DEL_SERVIDOR.join(" "), error?: string): string {
  const partes = [
    ...(error ? [`error="${error}"`] : []),
    `resource_metadata="${origen}${RUTA_DE_METADATOS}"`,
    `scope="${scope}"`,
  ];
  return `Bearer ${partes.join(", ")}`;
}

/** Los metadatos del recurso protegido (RFC 9728). */
export function metadatosDelRecurso(origen: string) {
  const issuer = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`;
  return {
    resource: `${origen}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [...ALCANCES_DEL_SERVIDOR],
    bearer_methods_supported: ["header"],
    resource_name: "CRM Avattar",
  };
}
