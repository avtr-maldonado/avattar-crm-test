import { redirect } from "next/navigation";
import { getSessionResult } from "@/lib/auth/session";
import { alcancesPedidos, etiquetaDeAlcance } from "@/lib/mcp/alcances";
import { ALCANCES } from "@/lib/mcp/auth";
import { createClient } from "@/lib/supabase/server";
import { decidirAccion } from "./acciones";

/**
 * Consentimiento OAuth · decisiones §61.
 *
 * Supabase Auth manda aquí al usuario cuando un cliente de IA pide acceso al
 * CRM. La identidad la da la sesión de siempre (Entra ID); si no hay sesión se
 * va a `/login` con esta misma URL como destino, porque el middleware solo
 * conserva la ruta y aquí la consulta (`authorization_id`) es lo que importa.
 * Sin perfil en el CRM no tiene sentido autorizar nada: a `/sin-acceso`.
 *
 * Con sesión, Supabase dice si ya consintió (redirige de vuelta al cliente) o
 * qué cliente pide qué alcances. Supabase solo emite alcances de identidad
 * (rechaza `crm:*`), así que lo que el cliente podrá hacer en el CRM se dice
 * aquí, fijo: es lo que la sesión del usuario permite, y nada más. Dos
 * decisiones, dos botones, una acción.
 */
type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function ConsentPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const authorizationId = typeof params.authorization_id === "string" ? params.authorization_id : null;
  const error = typeof params.error === "string" ? params.error : null;

  const sesion = await getSessionResult();
  if (!sesion.ok) {
    if (sesion.causa === "SIN_PERFIL") redirect("/sin-acceso");
    const destino = `/oauth/consent${authorizationId ? `?authorization_id=${encodeURIComponent(authorizationId)}` : ""}`;
    redirect(`/login?destino=${encodeURIComponent(destino)}`);
  }

  if (!authorizationId) {
    return (
      <Marco titulo="Falta la solicitud de autorización">
        <p className="mt-4 text-sm text-texto-cuerpo">
          Esta pantalla se abre desde el cliente de IA que pide acceso al CRM, no por su cuenta. Vuelve al cliente e
          intenta conectar de nuevo.
        </p>
      </Marco>
    );
  }

  const supabase = await createClient();
  const { data, error: errorDeSupabase } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (errorDeSupabase || !data) {
    return (
      <Marco titulo="No se pudo leer la solicitud">
        <p className="mt-4 text-sm text-texto-cuerpo">
          {errorDeSupabase?.message ?? "La solicitud ya no existe o venció."} Vuelve al cliente e intenta conectar de nuevo.
        </p>
      </Marco>
    );
  }
  if ("redirect_url" in data) redirect(data.redirect_url);

  const concedidos = ALCANCES.map(etiquetaDeAlcance);
  const alcances = alcancesPedidos(data.scope).flatMap((a) => (a.startsWith("crm:") ? [] : [etiquetaDeAlcance(a)]));
  const cliente = data.client.name || data.client.uri || "Un cliente";

  return (
    <Marco titulo={`${cliente} quiere acceder a tu CRM`}>
      <p className="mt-3 text-sm text-texto-tenue">
        Como <strong className="font-semibold text-texto-cuerpo">{sesion.session.email}</strong>. Solo verá lo que tú ves.
      </p>

      <ul className="mt-6 divide-y divide-borde rounded-sm border border-borde">
        {[...concedidos, ...alcances].map((a) => (
          <li key={a.alcance} className="p-3">
            <p className="text-sm font-semibold text-texto-titulo">{a.titulo}</p>
            <p className="mt-0.5 text-xs text-texto-cuerpo">{a.detalle}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-texto-tenue">Volverá a: {data.redirect_uri}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-sm border border-coral/40 bg-coral/10 p-3 text-xs text-texto-cuerpo">
          {error}
        </p>
      )}

      <form action={decidirAccion} className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button
          type="submit"
          name="decision"
          value="rechazar"
          className="flex-1 rounded-sm border border-borde px-4 py-3 text-sm font-semibold text-texto-cuerpo transition-colors duration-rapido ease-estandar hover:bg-superficie-tinte"
        >
          Rechazar
        </button>
        <button
          type="submit"
          name="decision"
          value="autorizar"
          className="flex-1 rounded-sm bg-acento px-4 py-3 text-sm font-semibold text-acento-texto transition-colors duration-rapido ease-estandar hover:bg-acento-hover"
        >
          Autorizar
        </button>
      </form>
    </Marco>
  );
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-superficie-sutil px-4">
      <div className="w-full max-w-md rounded-lg bg-superficie-tarjeta p-8 shadow-md">
        <p className="eyebrow">Avattar IT Solutions</p>
        <h1 className="mt-2 text-h4 font-semibold">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
