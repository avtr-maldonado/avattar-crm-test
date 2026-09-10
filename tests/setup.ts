import { config } from "dotenv";

/**
 * Arranque de las pruebas.
 *
 * Vitest no carga los archivos de entorno de Next, así que las pruebas de
 * integración no verían DATABASE_URL. Se cargan los dos, con .env.local
 * primero: dotenv no sobreescribe lo ya definido, así que el primero gana y el
 * segundo solo rellena lo que falte.
 *
 * Las pruebas puras (lib/money, lib/domain, lib/scope) no necesitan nada de
 * esto; las de integración fallan con un error críptico de Prisma sin ello.
 */
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
