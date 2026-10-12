/**
 * Aplica las migraciones de supabase/migrations/ a un proyecto de la nube.
 *
 *   node aplicar-migraciones.mjs                                  → DEV (.env.local)
 *   node aplicar-migraciones.mjs --env .env.production.local      → PROD
 *   node aplicar-migraciones.mjs --env <archivo> --dry-run        → solo dice qué aplicaría
 *
 * Usa la CLI global (`supabase`), NO `npx supabase`: npx resuelve a una copia
 * obsoleta en caché (2.20.12) que rechaza `major_version = 17` en config.toml.
 *
 * ## Por qué el ambiente es explícito y por qué imprime el host
 *
 * El mismo comando sirve para desarrollo y para producción; lo único que los
 * distingue es de qué archivo salió `DIRECT_URL`. Equivocarse de archivo es
 * escribir en la base equivocada, y en producción eso no se deshace. Así que
 * antes de tocar nada imprime a qué host y a qué base va, sin credenciales, y
 * con `--dry-run` se puede ver la lista de migraciones sin aplicar ninguna
 * (plan de ambiente productivo del 12-oct-2026).
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const ensayo = args.includes("--dry-run");
const i = args.indexOf("--env");
const archivo = i >= 0 ? args[i + 1] : ".env.local";

if (i >= 0 && !archivo) {
  console.error("--env necesita un archivo: --env .env.production.local");
  process.exit(1);
}
if (!existsSync(archivo)) {
  console.error(`No existe ${archivo}. Ver .env.example para la forma de las variables.`);
  process.exit(1);
}

// override: si ya hay variables en el proceso (o en .env.local cargado antes),
// las del archivo pedido mandan. Sin esto, apuntar a producción no tendría efecto.
config({ path: archivo, quiet: true, override: true });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error(`Falta DIRECT_URL en ${archivo}. Ver .env.example.`);
  process.exit(1);
}
// La plantilla de producción viene con marcadores. Decirlo aquí evita que el
// error llegue como «invalid IP-literal» desde las entrañas de la CLI.
const marcador = url.match(/\[[A-Z-]+\]/);
if (marcador) {
  console.error(
    `DIRECT_URL en ${archivo} todavía trae ${marcador[0]} sin llenar.\n` +
      "Los valores salen del panel de Supabase del proyecto: botón «Connect» → «ORMs» → «Prisma».",
  );
  process.exit(1);
}

/** El destino en claro, sin usuario ni contraseña: es lo que hay que leer antes de aceptar. */
function destinoDe(cadena) {
  try {
    const u = new URL(cadena);
    const proyecto = (u.username.split(".")[1] ?? "").trim();
    return `${u.hostname}:${u.port || "5432"}${u.pathname}${proyecto ? ` · proyecto ${proyecto}` : ""}`;
  } catch {
    return "(DIRECT_URL no tiene forma de URL)";
  }
}

console.log(`Ambiente : ${archivo}`);
console.log(`Destino  : ${destinoDe(url)}`);
console.log(`Modo     : ${ensayo ? "ENSAYO (no escribe nada)" : "APLICAR"}\n`);

const flags = ["db", "push", "--db-url", url, "--include-all"];
if (ensayo) flags.push("--dry-run");

const r = spawnSync("supabase", flags, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
