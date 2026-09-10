import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para Client Components.
 *
 * Su único uso es el arranque del inicio de sesión con Entra ID. No lee datos
 * de negocio: RLS está en deny-all para `anon` y `authenticated`, a propósito
 * (§4.3 del diseño). Los datos llegan por Server Components vía `lib/scope`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
