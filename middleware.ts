import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request.
 *
 * Sin esto, el token expira y el usuario cae a la pantalla de inicio de sesión
 * a media captura. El patrón es el de @supabase/ssr: leer las cookies del
 * request, dejar que la librería las renueve, y devolverlas en la respuesta.
 *
 * NO decide permisos. La autorización vive en `lib/scope` (INV-01); esto solo
 * mantiene viva la identidad y manda a `/login` a quien no la tiene.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser valida contra el servidor de autenticación. No quitar: sin esta
  // llamada las cookies no se renuevan.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica =
    ruta.startsWith("/login") ||
    ruta.startsWith("/auth") ||
    ruta.startsWith("/sin-acceso");

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Para devolverlo a donde iba una vez que entre.
    url.searchParams.set("destino", ruta);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo salvo archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
