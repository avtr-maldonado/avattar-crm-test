import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components y Route Handlers.
 *
 * Aquí Supabase es **solo identidad y almacenamiento**: la sesión de Entra ID y
 * los documentos. Los datos de negocio no pasan por este cliente — pasan por
 * Prisma a través de `lib/scope`, que es donde vive la autorización (INV-01).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll: ((cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: el middleware ya refrescó la
            // sesión, así que no hay nada que reponer aquí.
          }
        }) satisfies SetAllCookies,
      },
    },
  );
}

/**
 * Cliente con `service_role`. Bypassa RLS por completo.
 *
 * Solo para operaciones administrativas de Supabase que la clave `anon` no
 * puede hacer — por ejemplo firmar URLs de Storage o dar de alta un usuario.
 * NUNCA para leer datos de negocio: eso rompería INV-01 saltándose `lib/scope`.
 * Nunca importar desde un Client Component.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
