/**
 * La variante por ruta de los metadatos (RFC 9728 §3.1): algunos clientes
 * piden `/.well-known/oauth-protected-resource/mcp` para el recurso `/mcp`.
 * Mismo documento.
 */
export { GET, OPTIONS } from "../route";
