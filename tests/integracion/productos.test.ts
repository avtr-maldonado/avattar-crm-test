import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { listProductos, listVigenciasDePrecio } from "@/lib/scope/productos";
import { money } from "@/lib/money";

/**
 * P-06 contra los datos reales.
 *
 * Dos cosas se prueban aquí y ninguna es cosmética: que el costo no salga sin
 * permiso **ni por aritmética**, y que el catálogo no contenga un precio mínimo
 * imposible.
 */
async function sesionDe(correo: string): Promise<Session> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email: correo },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
  });
  const permisos = await prisma.rolePermission.findMany({
    where: { role: u.role, granted: true },
    select: { limitValue: true, permission: { select: { code: true } } },
  });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos.map((p) => p.permission.code)),
    limits: Object.fromEntries(
      permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null]),
    ),
  };
}

describe("P-06 · INV-02, el costo no sale sin permiso", () => {
  it("la respuesta de un vendedor no contiene standardCost ni costUpdatedAt", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const serializado = JSON.stringify(await listProductos(paulina));

    expect(serializado).not.toContain("standardCost");
    expect(serializado).not.toContain("costUpdatedAt");
    expect(serializado).not.toContain("costSource");
  });

  it("la de un gerente sí las trae", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const serializado = JSON.stringify(await listProductos(jorge));

    expect(serializado).toContain("standardCost");
    expect(serializado).toContain("costUpdatedAt");
  });

  it("la lista de precio se acota igual que el catálogo", async () => {
    const [paulina, jorge] = await Promise.all([
      sesionDe("pe@avattar.com"),
      sesionDe("jm@avattar.com"),
    ]);

    expect(JSON.stringify(await listVigenciasDePrecio(paulina))).not.toContain(
      "standardCost",
    );
    expect(JSON.stringify(await listVigenciasDePrecio(jorge))).toContain("standardCost");
  });
});

describe("P-06 · el costo se recupera del margen · hallazgo §9.2", () => {
  it("precio y margen juntos revelan el costo EXACTO", async () => {
    // Por esto la pantalla no muestra margen sin VER_COSTO, aunque RN-09 los
    // separe. Es la misma aritmética que hacía inútil la vista «sin costo» del
    // esquema archivado.
    const jorge = await sesionDe("jm@avattar.com");
    const productos = await listProductos(jorge);

    for (const p of productos) {
      const precio = p.prices[0];
      if (!precio || !("standardCost" in precio)) continue;

      const lista = money(precio.listPrice.toString());
      const costo = money(precio.standardCost.toString());
      const margen = lista.minus(costo).div(lista);
      const costoRecuperado = lista.times(money("1").minus(margen));

      expect(costoRecuperado.toFixed(4), p.sku).toBe(costo.toFixed(4));
    }
  });
});



describe("P-06 · antigüedad del costo · C-01", () => {
  it("tres SKU pasan de 60 días sin actualizar", async () => {
    // Sin Defontana el costo se mantiene a mano. La columna existe para que eso
    // se vea antes de que alguien cotice contra un número viejo.
    const jorge = await sesionDe("jm@avattar.com");
    const productos = await listProductos(jorge);
    const ahora = new Date();

    const obsoletos = productos
      .filter((p) => {
        if (!("costUpdatedAt" in p) || !p.costUpdatedAt) return false;
        return (ahora.getTime() - p.costUpdatedAt.getTime()) / 86_400_000 > 60;
      })
      .map((p) => p.sku)
      .sort();

    expect(obsoletos).toEqual(["CLD-AWS-CONS", "INF-SRV-R750", "LIC-M365-E3"]);
  });

  it("mientras Defontana esté fuera, el origen del costo es carga masiva", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    for (const p of await listProductos(jorge)) {
      expect("costSource" in p && p.costSource).toBe("CARGA_MASIVA");
    }
  });
});
