import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con `service_role`. Bypassa RLS por completo.
 *
 * Solo para operaciones administrativas de Supabase que la clave `anon` no
 * puede hacer: firmar URLs de Storage, y leer o dar de alta usuarios de
 * autenticación. NUNCA para leer datos de negocio: eso rompería INV-01
 * saltándose `lib/scope`. Nunca importar desde un Client Component.
 *
 * Vive aparte de `lib/supabase/server.ts` porque no necesita `next/headers`:
 * así los lectores de `lib/scope` que lo usan se prueban fuera de Next.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
