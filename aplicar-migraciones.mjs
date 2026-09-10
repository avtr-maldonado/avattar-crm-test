/**
 * Aplica las migraciones de supabase/migrations/ al proyecto de la nube.
 *
 * Usa la CLI global (`supabase`), NO `npx supabase`: npx resuelve a una copia
 * obsoleta en caché (2.20.12) que rechaza `major_version = 17` en config.toml.
 *
 * Alternativa equivalente, y la que usa el agente: el MCP de Supabase con
 * `apply_migration`, que además permite verificar en el acto con
 * `list_tables` y `get_advisors`.
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.local", quiet: true });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("Falta DIRECT_URL en .env.local. Ver .env.example.");
  process.exit(1);
}

const r = spawnSync("supabase", ["db", "push", "--db-url", url, "--include-all"], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
