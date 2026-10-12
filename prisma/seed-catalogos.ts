import { config } from "dotenv";
import { existsSync } from "node:fs";

/**
 * Siembra un ambiente nuevo: catálogos y los primeros administradores.
 *
 *   pnpm db:seed:catalogos --env .env.production.local \
 *     --admin "alguien@avattar.com|Nombre Apellido|ADMINISTRADOR|MX,CO,CL"
 *
 * `--admin` se repite una vez por persona. Sin ninguno siembra solo catálogos
 * y lo dice: un ambiente sin administradores no tiene por dónde entrar, porque
 * el alta de usuarios es administrativa (`F-01`, diseño §3.2) y nadie se da de
 * alta a sí mismo.
 *
 * ## Qué NO siembra, y no por olvido
 *
 * Cuentas, personas, oportunidades, actividades, cotizaciones y objetivos: eso
 * es el escenario del prototipo (§15) y vive en `prisma/seed.ts`. Productos
 * tampoco: el catálogo real lo entrega el negocio, y diez productos inventados
 * en producción son diez productos que alguien va a cotizar de verdad.
 *
 * ## Dos seguros
 *
 * El ambiente se declara con `--env`, no se hereda: el archivo por omisión es
 * el de desarrollo, y escribir catálogos en la base equivocada es rehacer la
 * matriz de permisos de alguien más. Y antes de escribir imprime a qué host va
 * y se detiene si la base ya tiene datos de negocio, porque volver a correr
 * esto sobre un ambiente vivo devolvería la matriz de permisos a la del código
 * y borraría lo que Administración haya ajustado en pantalla (§40).
 */

// ─────────────────────────────────────────────────────── Argumentos y ambiente

const args = process.argv.slice(2);
const forzar = args.includes("--force");

function valorDe(bandera: string): string | undefined {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : undefined;
}

function todosLos(bandera: string): string[] {
  const valores: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === bandera && args[i + 1]) valores.push(args[i + 1]);
  }
  return valores;
}

const archivo = valorDe("--env") ?? ".env.local";
if (!existsSync(archivo)) {
  console.error(`No existe ${archivo}. Ver .env.example para la forma de las variables.`);
  process.exit(1);
}
// override: las variables del archivo pedido mandan sobre lo que ya esté en el
// proceso. Sin esto, apuntar a producción no tendría efecto.
config({ path: archivo, quiet: true, override: true });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error(`Falta DIRECT_URL en ${archivo}. Ver .env.example.`);
  process.exit(1);
}
// La plantilla de producción viene con marcadores. Decirlo aquí evita que el
// error llegue como un fallo de red sin explicación.
const marcador = url.match(/\[[A-Z-]+\]/);
if (marcador) {
  console.error(
    `DIRECT_URL en ${archivo} todavía trae ${marcador[0]} sin llenar.\n` +
      "Los valores salen del panel de Supabase del proyecto: botón «Connect» → «ORMs» → «Prisma».",
  );
  process.exit(1);
}

function destinoDe(cadena: string) {
  try {
    const u = new URL(cadena);
    const proyecto = (u.username.split(".")[1] ?? "").trim();
    return `${u.hostname}:${u.port || "5432"}${u.pathname}${proyecto ? ` · proyecto ${proyecto}` : ""}`;
  } catch {
    return "(DIRECT_URL no tiene forma de URL)";
  }
}

// ──────────────────────────────────────────────────────── Los administradores

const ROLES = ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"] as const;
const PAISES_VALIDOS = ["MX", "CO", "CL"] as const;

type Admin = {
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  countryCodes: (typeof PAISES_VALIDOS)[number][];
  initials: string;
};

/** «correo|Nombre Apellido|ROL|MX,CO» · se valida aquí para no fallar a media siembra. */
function leerAdmin(crudo: string): Admin {
  const partes = crudo.split("|").map((p) => p.trim());
  if (partes.length !== 4) {
    throw new Error(`--admin "${crudo}": se esperaban cuatro campos separados por |, llegaron ${partes.length}.`);
  }
  const [email, name, role, paises] = partes;

  if (!email.includes("@")) throw new Error(`--admin "${crudo}": "${email}" no parece un correo.`);
  if (name.length < 3) throw new Error(`--admin "${crudo}": falta el nombre.`);
  if (!ROLES.includes(role as never)) {
    throw new Error(`--admin "${crudo}": el rol "${role}" no existe. Son ${ROLES.join(", ")}.`);
  }

  const countryCodes = paises.split(",").map((p) => p.trim().toUpperCase());
  if (countryCodes.length === 0 || countryCodes.some((p) => !PAISES_VALIDOS.includes(p as never))) {
    throw new Error(`--admin "${crudo}": los países son ${PAISES_VALIDOS.join(", ")}, separados por coma.`);
  }

  return {
    email: email.toLowerCase(),
    name,
    role: role as Admin["role"],
    countryCodes: countryCodes as Admin["countryCodes"],
    initials: inicialesDe(name),
  };
}

/** Primera letra del nombre y del apellido, como el avatar del prototipo. */
function inicialesDe(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  const letras = palabras.length === 1
    ? palabras[0].slice(0, 2)
    : palabras[0][0] + palabras[palabras.length - 1][0];
  return letras.toUpperCase().slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────── Siembra

async function main() {
  const admins = todosLos("--admin").map(leerAdmin);

  console.log(`Ambiente : ${archivo}`);
  console.log(`Destino  : ${destinoDe(url!)}`);
  console.log(`Siembra  : catálogos${admins.length > 0 ? ` + ${admins.length} usuario(s)` : " (sin usuarios)"}\n`);

  // La importación va aquí, después de cargar el ambiente: el cliente de
  // Prisma lee la URL al construirse, y arriba todavía no estaba la correcta.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const { sembrarCatalogos } = await import("./seed/catalogos");

  try {
    const [organizaciones, oportunidades, personas, actividades, usuarios] = await Promise.all([
      prisma.organization.count(),
      prisma.opportunity.count(),
      prisma.person.count(),
      prisma.activity.count(),
      prisma.user.count(),
    ]);
    const negocio = organizaciones + oportunidades + personas + actividades;

    if (negocio > 0 && !forzar) {
      console.error(
        `Esta base ya tiene datos de negocio (${organizaciones} cuentas, ${oportunidades} oportunidades, ` +
          `${personas} personas, ${actividades} actividades).\n` +
          "Volver a sembrar catálogos devolvería la matriz de permisos a la del código y perdería lo que\n" +
          "Administración haya ajustado en pantalla (§40). Si de verdad es lo que quieres, repite con --force.",
      );
      process.exit(1);
    }
    if (usuarios > 0) {
      console.log(`  aviso: la base ya tiene ${usuarios} usuario(s); los de --admin se actualizan, no se duplican\n`);
    }

    await sembrarCatalogos(prisma);

    for (const a of admins) {
      await prisma.user.upsert({
        where: { email: a.email },
        // entraObjectId se queda nulo a propósito: lo llena el primer ingreso
        // con Microsoft, que vincula por correo (F-01, CU-01.1). Copiarlo de
        // otro ambiente no serviría: cada proyecto de Supabase emite los suyos.
        update: { name: a.name, role: a.role, countryCodes: a.countryCodes, initials: a.initials, active: true },
        create: {
          email: a.email,
          name: a.name,
          initials: a.initials,
          role: a.role,
          countryCodes: a.countryCodes,
        },
      });
      console.log(`  ${a.email} · ${a.name} · ${a.role} · ${a.countryCodes.join("/")}`);
    }

    if (admins.length === 0) {
      console.log(
        "\n  Sin --admin no hay por dónde entrar: el alta de usuarios es administrativa.\n" +
          "  Vuelve a correrlo con --admin \"correo|Nombre|ADMINISTRADOR|MX,CO,CL\" cuando los tengas.",
      );
    }

    console.log("\nListo.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
