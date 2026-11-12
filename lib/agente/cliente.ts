/**
 * Opciones del cliente de Anthropic que salen del entorno · decisiones §62. Puro.
 *
 * Una llave creada a nivel organización (no dentro de un workspace) hace que la
 * API exija el encabezado `anthropic-workspace-id` en cada llamada; sin él
 * responde 400. Con `ANTHROPIC_WORKSPACE_ID` se manda; con una llave de
 * workspace no hace falta y la variable se deja vacía.
 */
export function opcionesDeCliente(env: Record<string, string | undefined>): {
  defaultHeaders?: Record<string, string>;
} {
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {};
}
