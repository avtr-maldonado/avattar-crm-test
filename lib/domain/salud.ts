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
