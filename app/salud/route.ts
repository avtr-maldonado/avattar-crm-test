import { NextResponse } from "next/server";
import { estadoDeLaBase } from "@/lib/domain/salud";

/**
 * `GET /salud` · diagnóstico del despliegue.
 *
 * Responde si la base es alcanzable desde donde corre la aplicación y qué
 * variables de entorno existen en ESTE despliegue: solo si están definidas,
 * nunca su valor. Con eso se distingue en un vistazo «la variable no llegó al
 * despliegue» de «llegó pero el host no responde» de «el motor de Prisma no
 * viajó al paquete», que desde fuera se ven idénticos: un 500 sin conexión.
 *
 * Es pública a propósito: se consulta precisamente cuando nadie puede iniciar
 * sesión. Lo que expone es de bajo riesgo —el host del pooler se deduce del
 * proyecto, que ya es público en la URL de Supabase— pero cuando el despliegue
 * quede estable conviene quitarla o dejarla solo con `ok`.
 *
 * 503 cuando la base no responde, para que un monitor externo lo lea sin
 * interpretar el cuerpo.
 */
export const dynamic = "force-dynamic";

const VARIABLES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export async function GET() {
  const base = await estadoDeLaBase();

  return NextResponse.json(
    {
      ok: base.alcanzable,
      base,
      variablesDefinidas: Object.fromEntries(VARIABLES.map((n) => [n, Boolean(process.env[n])])),
      entorno: {
        node: process.version,
        vercel: process.env.VERCEL_ENV ?? null,
        region: process.env.VERCEL_REGION ?? null,
      },
      hora: new Date().toISOString(),
    },
    { status: base.alcanzable ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
