/**
 * Token de aplicación para Microsoft Graph (client credentials).
 *
 * ## Por qué de aplicación y no delegado
 *
 * El inicio de sesión pasa por Supabase Auth, que entrega el token de Entra
 * una sola vez y no lo renueva; y un token delegado solo escribe en el
 * calendario de quien lo obtuvo. El negocio pidió agendar **en el calendario
 * del responsable**, que puede ser otra persona: eso solo lo permite un
 * permiso de aplicación (`Calendars.ReadWrite` como *Application permission*,
 * con consentimiento de administrador) y el flujo de credenciales de cliente.
 *
 * ## Variables
 *
 *   AZURE_TENANT_ID      el tenant de Avattar
 *   AZURE_CLIENT_ID      el registro de aplicación (el mismo del SSO sirve)
 *   AZURE_CLIENT_SECRET  un secreto de cliente de ese registro
 *
 * Sin las tres, `configurado()` es falso y el CRM no toca el calendario: todo
 * lo demás sigue funcionando igual.
 *
 * El token se guarda en memoria del proceso hasta un minuto antes de vencer.
 * No es estado de request —es el mismo para todos— así que compartirlo entre
 * requests es correcto y ahorra un viaje a `login.microsoftonline.com` por
 * actividad.
 */

type TokenEnCache = { valor: string; venceEn: number };

let cache: TokenEnCache | null = null;

export function configurado(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET,
  );
}

export async function tokenDeGraph(): Promise<string> {
  if (cache && cache.venceEn > Date.now()) return cache.valor;

  const tenant = process.env.AZURE_TENANT_ID;
  const cuerpo = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID ?? "",
    client_secret: process.env.AZURE_CLIENT_SECRET ?? "",
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const respuesta = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo,
    signal: AbortSignal.timeout(8_000),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => "");
    throw new Error(`Entra no entregó token (${respuesta.status}): ${texto.slice(0, 200)}`);
  }

  const datos = (await respuesta.json()) as { access_token: string; expires_in: number };
  cache = { valor: datos.access_token, venceEn: Date.now() + (datos.expires_in - 60) * 1000 };
  return datos.access_token;
}
