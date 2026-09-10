import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pruebas de arquitectura · AC-31 y AC-32.
 *
 * No prueban comportamiento: prueban que el código respeta dos invariantes que
 * son fáciles de romper sin darse cuenta y caros de descubrir tarde.
 */

function archivosTs(dir: string, incluirPruebas = false): string[] {
  let salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida = salida.concat(archivosTs(ruta, incluirPruebas));
    } else if (/\.tsx?$/.test(entrada)) {
      const esPrueba = /\.test\.tsx?$/.test(entrada);
      if (incluirPruebas || !esPrueba) salida.push(ruta);
    }
  }
  return salida;
}

/** Quita comentarios de bloque y de línea, para no marcar un umbral citado en prosa. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("AC-31 · ningún umbral está escrito en el código (INV-05)", () => {
  it("lib/domain no contiene 0.20, 0.15, 0.16 ni 0.30", () => {
    // Piso de margen, umbrales de descuento y tasa de impuesto. Si aparecen
    // aquí, confirmarlos con Dirección exigiría un despliegue en vez de editar
    // una fila desde Administración.
    const umbral = /(?<![\d.])0\.(20|15|16|30)(?![\d])/;
    const ofensores: string[] = [];

    for (const archivo of archivosTs("lib/domain")) {
      const codigo = sinComentarios(readFileSync(archivo, "utf8"));
      if (umbral.test(codigo)) ofensores.push(archivo);
    }

    expect(ofensores).toEqual([]);
  });

  it("lib/domain tampoco esconde los umbrales como porcentaje entero", () => {
    // Un `20` suelto es ambiguo, pero `marginFloor = 20` o `>= 15` en una
    // comparación de política sí es el mismo defecto con otra ropa.
    const sospechoso =
      /\b(marginFloor|lineMarginFloor|discountThreshold\w*|meddicMin\w*|staleAfterDays|taxRate|healthyCoverageMin)\s*=\s*\d/;
    const ofensores: string[] = [];

    for (const archivo of archivosTs("lib/domain")) {
      const codigo = sinComentarios(readFileSync(archivo, "utf8"));
      if (sospechoso.test(codigo)) ofensores.push(archivo);
    }

    expect(ofensores).toEqual([]);
  });

  it("los umbrales entran por parámetro, no por importación", () => {
    // lib/domain no debe leer la política por su cuenta: la recibe. Así las
    // funciones siguen siendo puras y probables sin base.
    const ofensores: string[] = [];
    for (const archivo of archivosTs("lib/domain")) {
      const codigo = readFileSync(archivo, "utf8");
      if (/from ["']@\/lib\/policy["']/.test(codigo)) ofensores.push(archivo);
    }
    expect(ofensores).toEqual([]);
  });
});

describe("AC-32 · toda consulta pasa por lib/scope (INV-01)", () => {
  it("app y components no importan el cliente de Prisma", () => {
    const ofensores: string[] = [];

    for (const dir of ["app", "components"]) {
      let archivos: string[];
      try {
        archivos = archivosTs(dir, true);
      } catch {
        continue; // La carpeta todavía no existe en este incremento.
      }

      for (const archivo of archivos) {
        const codigo = readFileSync(archivo, "utf8");
        if (/from\s+["'](@\/lib\/db|@prisma\/client)["']/.test(codigo)) {
          ofensores.push(`${archivo} · importa el cliente`);
        }
      }
    }

    expect(ofensores).toEqual([]);
  });

  it("app y components no llaman a prisma.<modelo>.<operación>", () => {
    // Atrapa el caso que el import no cubre: una ruta relativa, o un cliente
    // recibido por parámetro.
    const operacion =
      /\bprisma\s*\.\s*\w+\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|aggregate|groupBy|count)\b/;
    const ofensores: string[] = [];

    for (const dir of ["app", "components"]) {
      let archivos: string[];
      try {
        archivos = archivosTs(dir, true);
      } catch {
        continue;
      }
      for (const archivo of archivos) {
        if (operacion.test(readFileSync(archivo, "utf8"))) ofensores.push(archivo);
      }
    }

    expect(ofensores).toEqual([]);
  });

  it("solo la capa de datos importa lib/db", () => {
    /**
     * Quién puede sostener el cliente de Prisma, y por qué:
     *
     *   lib/scope    aplica el alcance por rol. Es su razón de existir.
     *   lib/domain   ejecuta las mutaciones y sus transacciones.
     *   lib/policy   lee los umbrales de configuración.
     *   lib/audit    `auditedTransaction` abre la transacción que envuelve el
     *                cambio y su bitácora (INV-09).
     *   lib/auth     carga el perfil del usuario, que no es un dato de negocio
     *                con alcance sino la identidad misma.
     *
     * La lista está aquí, a la vista y con su justificación, en vez de
     * repartida en comentarios. Agregar una entrada debe costar defenderla.
     */
    const permitidos = [
      join("lib", "scope"),
      join("lib", "domain"),
      join("lib", "policy"),
      join("lib", "audit"),
      join("lib", "auth"),
    ];

    const ofensores: string[] = [];
    for (const archivo of archivosTs("lib", true)) {
      if (archivo.endsWith(join("lib", "db.ts"))) continue;
      // Las pruebas de integración sí necesitan el cliente para preparar y
      // limpiar datos. La frontera es sobre el código que se despliega.
      if (/\.test\.tsx?$/.test(archivo)) continue;
      const codigo = readFileSync(archivo, "utf8");
      if (!/from ["']@\/lib\/db["']/.test(codigo)) continue;
      if (!permitidos.some((p) => archivo.includes(p))) ofensores.push(archivo);
    }

    expect(ofensores).toEqual([]);
  });
});
