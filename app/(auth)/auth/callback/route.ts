import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { vincularEntraObjectId } from "@/lib/auth/session";

/**
 * Callback de Entra ID.
 *
 * Cambia el código por una sesión y, si es el primer inicio de sesión de ese
 * usuario, sella el vínculo entre su perfil de `public.users` y su object id de
 * Entra. A partir de ahí el vínculo es por object id, no por correo: un correo
 * puede reasignarse a otra persona, el object id no.
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
    await vincularEntraObjectId(data.user.email, data.user.id);
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
