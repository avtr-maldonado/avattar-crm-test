import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

// El cliente con `service_role` vive en `./admin`, sin `next/headers`, para
// que los lectores que lo usan se prueben fuera de Next. Se reexporta aquí
// para no mover a quienes ya lo importaban de este módulo.
export { createServiceRoleClient } from "./admin";

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
