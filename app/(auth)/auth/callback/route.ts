import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { vincularEntraObjectId } from "@/lib/auth/session";
import { resumenDeError } from "@/lib/domain/salud";

/**
 * Callback de Entra ID.
 *
 * Cambia el código por una sesión y, si es el primer inicio de sesión de ese
 * usuario, sella el vínculo entre su perfil de `public.users` y su object id de
 * Entra. A partir de ahí el vínculo es por object id, no por correo: un correo
 * puede reasignarse a otra persona, el object id no.
 *
 * ## Si la base no responde, no se responde 500
 *
 * Pasó en Vercel: el intercambio del código con Supabase salía bien, Prisma
 * fallaba al sellar el vínculo, la ruta lanzaba, y el navegador mostraba un 500
 * en blanco que no decía nada. Peor: las cookies de sesión ya fijadas se
 * perdían con la respuesta de error, y al recargar el código ya estaba
 * consumido. Aquí ese fallo se atrapa, se escribe en el registro del servidor y
 * se manda a `/login` con la causa concreta, que la pantalla de login muestra.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const destino = searchParams.get("destino") ?? "/oportunidades";
  const errorDelProveedor = searchParams.get("error_description");

  if (errorDelProveedor) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDelProveedor)}`,
    );
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "No se pudo iniciar sesión.")}`,
    );
  }

  // Primer inicio de sesión: el perfil se dio de alta con el correo y aquí se
  // le sella el object id. Si no hay perfil, `vincular` devuelve false y el
  // usuario cae en /sin-acceso, que le explica que el alta es administrativa.
  if (data.user.email) {
    try {
      await vincularEntraObjectId(data.user.email, data.user.id);
    } catch (e) {
      console.error("[auth/callback] la base no respondió al vincular el perfil:", e);
      const mensaje = `Entraste con Microsoft, pero el CRM no pudo consultar su base de datos. ${resumenDeError(e)}`;
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(mensaje)}`);
    }
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
