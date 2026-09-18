import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getOrganization } from "@/lib/scope/organizations";
import { crearOrganizacion } from "@/lib/domain/contact";

/**
 * Alta de cuentas desde P-03 · `crearOrganizacion`.
 *
 * Lo que estas pruebas afirman, y por qué:
 *
 * - La cuenta nace con la sede indicada —o sin ella— **y** a nombre de quien la crea. Igual
 *   que en el alta en línea de oportunidad: «la empresa que un vendedor da de
 *   alta es suya».
 * - La sede es libre: las cuentas no son de un país (§18).
 * - Un nombre repetido se rechaza en cualquier país, sin distinguir mayúsculas y
 *   **aunque la sesión no alcance a la existente**: el duplicado es daño
 *   permanente y la fuga del nombre no (decisiones-pendientes §11.1).
 *
 * Solo dependen de los usuarios del seed, no de sus oportunidades: siguen
 * pasando aunque alguien haya vaciado el pipeline para probar el alta.
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

let jorge: Session; // GERENTE_PAIS · MX
let paulina: Session; // VENDEDOR · MX
let direccion: Session; // DIRECCION · MX, CO, CL
const creadas: string[] = [];

// Un sufijo por corrida: la base es compartida y otra corrida a medias no debe
// convertir estas pruebas en falsos duplicados.
const sufijo = Date.now().toString(36);
const nombre = (base: string) => `${base} ${sufijo}`;

beforeAll(async () => {
  [jorge, paulina, direccion] = await Promise.all([
    sesionDe("jm@avattar.com"),
    sesionDe("pe@avattar.com"),
    sesionDe("dc@avattar.com"),
  ]);
});

afterAll(async () => {
  if (creadas.length) {
    await prisma.organization.deleteMany({ where: { id: { in: creadas } } });
  }
});

describe("crearOrganizacion · la cuenta nace bien formada", () => {
  it("nace con la sede indicada, a nombre de quien la crea, con los campos recortados", async () => {
    const r = await crearOrganizacion(paulina, {
      name: nombre("Prueba de alta"),
      type: "PROSPECTO",
      countryCode: "MX",
      legalName: "   ",
      industry: "  Retail  ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const fila = await prisma.organization.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { ownerId: true, countryCode: true, legalName: true, industry: true, isStrategic: true },
    });
    expect(fila.ownerId).toBe(paulina.userId);
    expect(fila.countryCode).toBe("MX");
    // Vacío es «sin dato», no una cadena de espacios.
    expect(fila.legalName).toBeNull();
    expect(fila.industry).toBe("Retail");
    expect(fila.isStrategic).toBe(false);

    // Y quien la creó la alcanza de inmediato: es suya (§5.3).
    expect(await getOrganization(paulina, r.datos.id)).not.toBeNull();
  });

  it("la sede es libre: un vendedor de México da de alta una cuenta con sede en Colombia (§18)", async () => {
    // Las cuentas no son de un país. La sede es un dato informativo, no una
    // llave: no limita quién la ve ni dónde se le venden oportunidades.
    const r = await crearOrganizacion(paulina, {
      name: nombre("Cuenta con sede en Colombia"),
      type: "CLIENTE",
      countryCode: "CO",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const fila = await prisma.organization.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { countryCode: true, ownerId: true },
    });
    expect(fila.countryCode).toBe("CO");
    expect(fila.ownerId).toBe(paulina.userId);
  });

  it("también nace sin sede", async () => {
    const r = await crearOrganizacion(direccion, {
      name: nombre("Cuenta sin sede"),
      type: "PROSPECTO",
      countryCode: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const fila = await prisma.organization.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { countryCode: true },
    });
    expect(fila.countryCode).toBeNull();
  });
});

describe("crearOrganizacion · lo que rechaza", () => {
  it("un nombre que ya existe, en cualquier país, sin distinguir mayúsculas y sin importar de quién sea", async () => {
    const base = nombre("Hidrosistemas del Valle");
    const primera = await crearOrganizacion(jorge, { name: base, type: "PROSPECTO", countryCode: "MX" });
    expect(primera.ok).toBe(true);
    if (primera.ok) creadas.push(primera.datos.id);

    // Paulina no alcanza la cuenta de Jorge, la sede es otra, y aun así el
    // duplicado se detecta: la cuenta es una sola para toda la operación.
    const segunda = await crearOrganizacion(paulina, {
      name: base.toUpperCase(),
      type: "CLIENTE",
      countryCode: "CL",
    });
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.motivo).toBe("VALIDACION");
    expect(segunda.problemas[0]?.campo).toBe("name");
    expect(segunda.problemas[0]?.mensaje).toContain("Ya existe");
  });

  it("lo mismo que la edición: nombre de una letra y números negativos", async () => {
    const corto = await crearOrganizacion(jorge, { name: "A", type: "PROSPECTO", countryCode: "MX" });
    expect(corto.ok).toBe(false);
    if (!corto.ok) {
      expect(corto.motivo).toBe("VALIDACION");
      expect(corto.problemas[0]?.campo).toBe("name");
    }

    const negativo = await crearOrganizacion(jorge, {
      name: nombre("Negativa"),
      type: "PROSPECTO",
      countryCode: "MX",
      employees: -1,
    });
    expect(negativo.ok).toBe(false);
    if (!negativo.ok) expect(negativo.problemas[0]?.campo).toBe("employees");
  });
});
