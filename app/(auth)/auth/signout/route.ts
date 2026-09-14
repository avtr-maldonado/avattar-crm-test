import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cerrar sesión.
 *
 * Es un Route Handler y no una Server Action a propósito: el contrato de las
 * acciones (`ResultadoAccion`, `lib/acciones.ts`) es «nunca lanzan, devuelven
 * un resultado», y cerrar sesión no devuelve nada: termina en otra pantalla.
 * Como formulario `POST` además funciona sin JavaScript.
 *
 * Solo `POST`. Un `GET` que cerrara sesión se dispararía desde cualquier imagen
 * o enlace ajeno; no roba nada, pero saca a la gente del sistema a media
 * captura.
 *
 * Cierra la sesión del CRM, no la de Microsoft: Entra ID sigue abierto en el
 * navegador y «Entrar con Microsoft» vuelve a entrar sin pedir clave. El menú
 * de usuario lo advierte antes de que pase.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Si el token ya no vale, el servidor de autenticación responde error, pero
  // la librería retira la sesión local de todos modos: en ambos casos las
  // cookies salen vencidas en la respuesta.
  await supabase.auth.signOut();

  // 303: el navegador sigue la redirección con GET aunque llegó por POST.
  return NextResponse.redirect(new URL("/login?salida=1", request.url), { status: 303 });
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
