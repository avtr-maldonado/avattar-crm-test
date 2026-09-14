import { prisma } from "@/lib/db";

/**
 * Salud de la base de datos, para diagnóstico de despliegues.
 *
 * Existe porque un despliegue en Vercel respondía 500 en el callback de inicio
 * de sesión y nada decía por qué: Prisma fallaba antes de abrir el socket, así
 * que ni el pooler ni Postgres registraban intento alguno, y el registro de la
 * función solo lo ve quien tiene acceso a Vercel. Esto lo cuenta la propia
 * aplicación, en `/salud`.
 *
 * Vive en `lib/domain` porque `lib/db` solo puede importarse desde aquí y desde
 * `lib/scope` (INV-01). No lee datos de negocio: un `select 1`.
 */
export type EstadoDeLaBase =
  | { alcanzable: true; ms: number }
  | { alcanzable: false; error: string };

export async function estadoDeLaBase(): Promise<EstadoDeLaBase> {
  const inicio = performance.now();
  try {
    await prisma.$queryRaw`select 1`;
    return { alcanzable: true, ms: Math.round(performance.now() - inicio) };
  } catch (e) {
    return { alcanzable: false, error: resumenDeError(e) };
  }
}

/**
 * La forma de `DATABASE_URL`, sin sus credenciales.
 *
 * Para distinguir en `/salud` los errores de configuración que Prisma reporta
 * de manera opaca. El más común en un panel de variables: pegar el valor con
 * las comillas del `.env.example`. En un archivo `.env` las quita el cargador;
 * en Vercel se guardan literalmente y la URL empieza con `"`, así que Prisma
 * dice «the URL must start with the protocol postgresql://». Host y puerto se
 * muestran porque no son secreto: el proyecto ya es público en la URL de
 * Supabase. Usuario y contraseña, nunca.
 */
export type FormaDeUrl =
  | { definida: false }
  | {
      definida: true;
      empiezaConComillas: boolean;
      protocolo: string | null;
      host: string | null;
      puerto: string | null;
      pgbouncer: boolean;
      pista: string | null;
    };

export function formaDeDatabaseUrl(crudo = process.env.DATABASE_URL): FormaDeUrl {
  if (!crudo) return { definida: false };

  const empiezaConComillas = /^["']/.test(crudo);
  const limpia = crudo.trim().replace(/^["']|["']$/g, "");

  let url: URL | null = null;
  try {
    url = new URL(limpia);
  } catch {
    url = null;
  }

  const protocolo = url?.protocol.replace(/:$/, "") ?? null;
  const host = url?.hostname ?? null;
  const puerto = url?.port || null;
  const pgbouncer = url?.searchParams.get("pgbouncer") === "true";

  let pista: string | null = null;
  if (empiezaConComillas) {
    pista = "El valor empieza con comillas. En el panel de Vercel se pega sin ellas.";
  } else if (protocolo !== "postgresql" && protocolo !== "postgres") {
    pista = "El valor no empieza con postgresql://. Revisa que no lleve el nombre de la variable ni espacios.";
  } else if (host?.startsWith("db.") && host.endsWith(".supabase.co")) {
    pista = "Es la conexión directa, que es solo IPv6. Desde Vercel usa el pooler aws-0-<región>.pooler.supabase.com.";
  } else if (puerto === "6543" && !pgbouncer) {
    pista = "Al pooler en 6543 le falta ?pgbouncer=true; Prisma falla por sentencias preparadas.";
  }

  return { definida: true, empiezaConComillas, protocolo, host, puerto, pgbouncer, pista };
}

/**
 * La línea del error que dice qué pasó, sin el envoltorio de Prisma.
 *
 * Prisma antepone «Invalid `prisma.x()` invocation:» y una línea vacía; lo que
 * importa viene después: «Environment variable not found: DATABASE_URL» o
 * «Can't reach database server at `host:puerto`». Nunca incluye la contraseña.
 */
export function resumenDeError(e: unknown): string {
  const mensaje = e instanceof Error ? e.message : String(e);
  const lineas = mensaje
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("Invalid `prisma"));
  const nombre = e instanceof Error && e.constructor.name !== "Error" ? `${e.constructor.name}: ` : "";
  return `${nombre}${lineas[0] ?? "error sin mensaje"}`.slice(0, 240);
}
