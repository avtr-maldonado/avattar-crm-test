"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * La decisión de consentimiento · decisiones §61.
 *
 * Aprobar o denegar la autorización en Supabase Auth con la sesión del
 * usuario, y volver al cliente de IA por la URL que Supabase devuelve (con el
 * código, o con el error si se rechazó). No devuelve `ResultadoAccion`: el
 * resultado de esta acción es siempre una redirección, y si algo falla se
 * vuelve a la misma pantalla con el motivo.
 */
const Decision = z.object({
  authorization_id: z.string().trim().min(1),
  decision: z.enum(["autorizar", "rechazar"]),
});

export async function decidirAccion(formData: FormData): Promise<void> {
  const parsed = Decision.safeParse({
    authorization_id: formData.get("authorization_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) redirect("/oauth/consent");

  const { authorization_id, decision } = parsed.data;
  const supabase = await createClient();
  const { data, error } =
    decision === "autorizar"
      ? await supabase.auth.oauth.approveAuthorization(authorization_id)
      : await supabase.auth.oauth.denyAuthorization(authorization_id);

  if (error || !data) {
    const motivo = error?.message ?? "Supabase no devolvió a dónde volver.";
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}&error=${encodeURIComponent(motivo)}`);
  }
  redirect(data.redirect_url);
}
