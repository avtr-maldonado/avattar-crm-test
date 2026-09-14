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
 *
 * ## Lo que cuesta por request
 *
 * `getClaims` verifica la firma del token **en local**: el proyecto firma con
 * ES256 y la clave pública se trae del JWKS una vez por proceso. Antes se usaba
 * `getUser`, que es un viaje al servidor de autenticación en cada request:
 * ~170 ms desde México, en cada página, cada prefetch y cada recurso de
 * desarrollo (docs/latencia-dev.md, 4a). Sigue sin confiar en la cookie a
 * ciegas: un token alterado no pasa la verificación de firma. Y si el token
 * expiró, `getClaims` lo renueva por dentro y las cookies nuevas salen por
 * `setAll`, así que la renovación que justificaba este middleware no se pierde.
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

  const { data } = await supabase.auth.getClaims();
  const autenticado = data?.claims != null;

  const ruta = request.nextUrl.pathname;
  const esPublica =
    ruta.startsWith("/login") ||
    ruta.startsWith("/auth") ||
    ruta.startsWith("/sin-acceso") ||
    // Diagnóstico del despliegue: se consulta justo cuando nadie puede entrar.
    ruta === "/salud";

  if (!autenticado && !esPublica) {
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
    // Todo salvo lo que Next sirve por su cuenta y los archivos estáticos.
    //
    // `_next/` completo, no solo `static` e `image`: en desarrollo también
    // pasan por aquí `_next/webpack-hmr`, `_next/data` y los prefetch, y bajo
    // `__nextjs` van las herramientas de desarrollo. Ninguno autoriza nada, y
    // cada uno pagaba un viaje al servidor de autenticación
    // (docs/latencia-dev.md, 4b).
    "/((?!_next/|__nextjs|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
