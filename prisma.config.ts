import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Al detectar este archivo, Prisma deja de cargar .env por su cuenta.
//
// Next.js lee .env.local; dotenv, por omisión, lee .env. Cargamos ambos, con
// .env.local primero, para que las variables funcionen sin importar en cuál de
// los dos archivo las hayan puesto. dotenv no sobreescribe lo ya definido, así
// que el primero gana y el segundo solo rellena lo que falte.
// quiet: sin esto dotenv escribe sus avisos a stdout, y `pnpm db:diff > archivo.sql`
// los mete dentro del SQL generado, que deja de ser aplicable.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
