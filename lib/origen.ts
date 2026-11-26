/**
 * El origen público con el que la app arma sus propias URLs (redirecciones de login y de salida,
 * metadatos del MCP) · decisiones §70.
 *
 * Detrás de Nginx Proxy Manager, el servidor standalone de Next ve `request.url` con su HOSTNAME
 * interno (`https://0.0.0.0:3132`), y el callback de login mandaba ahí al usuario. En producción
 * manda `APP_URL`. Sin ella —`pnpm dev`— el request ya trae el origen correcto.
 *
 * No se lee `Host` ni `X-Forwarded-Host`: los manda el cliente, y una redirección de login armada con
 * ellos lleva a donde el atacante diga. Puro; lo importa también el código de servidor de Next.
 */
export function origenPublico(request: Request, env: Record<string, string | undefined> = process.env): string {
  const fijo = env.APP_URL?.trim();
  if (fijo) return fijo.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
