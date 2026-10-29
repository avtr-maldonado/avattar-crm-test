import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getOrganization } from "@/lib/scope/organizations";
import { getPersona, listPersonas } from "@/lib/scope/people";
import {
  crearOrganizacion,
  crearPersona,
  editarOrganizacion,
  editarPersona,
} from "@/lib/domain/contact";

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

let jorge: Session;
let paulina: Session;
let organizacionId: string;
const personasCreadas: string[] = [];
const cuentasCreadas: string[] = [];
let nombreOriginal: string;

beforeAll(async () => {
  [jorge, paulina] = await Promise.all([
    sesionDe("jm@avattar.com"),
    sesionDe("pe@avattar.com"),
  ]);
  const o = await prisma.organization.findFirstOrThrow({
    where: { countryCode: "MX", deletedAt: null },
    select: { id: true, name: true },
  });
  organizacionId = o.id;
  nombreOriginal = o.name;
});

afterAll(async () => {
  if (cuentasCreadas.length) {
    await prisma.organization.deleteMany({ where: { id: { in: cuentasCreadas } } });
  }
  if (personasCreadas.length) {
    await prisma.person.deleteMany({ where: { id: { in: personasCreadas } } });
  }
  // La organización es dato compartido: se devuelve como estaba.
  await prisma.organization.update({
    where: { id: organizacionId },
    data: { name: nombreOriginal },
  });
});

describe("crearPersona · las iniciales se derivan", () => {
  it("crea el contacto sin pedir iniciales", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const r = await crearPersona(jorge, organizacion!, {
      name: "Renata Sandoval Ibarra",
      jobTitle: "Directora de Operaciones",
      email: "renata@ejemplo.com",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    personasCreadas.push(r.datos.id);

    const p = await prisma.person.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { initials: true, name: true, organizationId: true },
    });
    // Dos primeras palabras, la convención que fija §15 al llamar «AL» a Ana
    // Lucía Ríos y no «AR».
    expect(p.initials).toBe("RS");
    expect(p.organizationId).toBe(organizacionId);
  });

  it("un nombre en blanco no pasa", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const r = await crearPersona(jorge, organizacion!, { name: "  " });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});

describe("editarPersona · quién puede · Q-15 y §29", () => {
  it("el propietario edita a su gente", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const creada = await crearPersona(jorge, organizacion!, { name: "Tomás Bravo" });
    if (!creada.ok) throw new Error("no se pudo preparar");
    personasCreadas.push(creada.datos.id);

    const persona = await getPersona(jorge, creada.datos.id);
    const r = await editarPersona(jorge, persona!, {
      jobTitle: "Gerente de Compras",
      phone: "+52 81 1234 5678",
    });
    expect(r.ok).toBe(true);

    const p = await prisma.person.findUniqueOrThrow({
      where: { id: creada.datos.id },
      select: { jobTitle: true, phone: true },
    });
    expect(p.jobTitle).toBe("Gerente de Compras");
  });

  it("cambiar el nombre recalcula las iniciales", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const creada = await crearPersona(jorge, organizacion!, { name: "Ana Perez" });
    if (!creada.ok) throw new Error("no se pudo preparar");
    personasCreadas.push(creada.datos.id);

    const persona = await getPersona(jorge, creada.datos.id);
    await editarPersona(jorge, persona!, { name: "Ana Lucía Ríos" });

    const p = await prisma.person.findUniqueOrThrow({
      where: { id: creada.datos.id },
      select: { initials: true },
    });
    // Si no se recalcularan, el avatar seguiría diciendo «AP» para siempre.
    expect(p.initials).toBe("AL");
  });

  it("una persona ajena, no compartida y sin oportunidad de por medio no llega siquiera al dominio (§29)", async () => {
    const gente = await prisma.person.findFirst({
      where: {
        deletedAt: null,
        NOT: { ownerId: paulina.userId },
        shares: { none: { userId: paulina.userId } },
        organization: { opportunities: { none: { ownerId: paulina.userId, deletedAt: null } } },
      },
      select: { id: true },
    });
    if (!gente) return;

    expect((await listPersonas(paulina)).some((p) => p.id === gente.id)).toBe(false);
    expect(await getPersona(paulina, gente.id)).toBeNull();
  });
});

describe("editarOrganizacion · la ficha es del dueño · Q-15", () => {
  it("el propietario edita la ficha", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const r = await editarOrganizacion(jorge, organizacion!, {
      name: `${nombreOriginal} · editada`,
      industry: "Manufactura avanzada",
      creditDays: 45,
      isStrategic: true,
    });
    expect(r.ok).toBe(true);

    const o = await prisma.organization.findUniqueOrThrow({
      where: { id: organizacionId },
      select: { name: true, industry: true, creditDays: true, isStrategic: true },
    });
    expect(o.industry).toBe("Manufactura avanzada");
    expect(o.creditDays).toBe(45);
    expect(o.isStrategic).toBe(true);
  });

  it("un vendedor que solo la ve por su oportunidad NO edita la ficha", async () => {
    // Puede capturar contactos —eso es trabajar la oportunidad— pero la ficha
    // de la cuenta es de su dueño.
    const conOportunidadAjena = await prisma.organization.findFirst({
      where: {
        deletedAt: null,
        NOT: { ownerId: paulina.userId },
        opportunities: { some: { ownerId: paulina.userId, deletedAt: null } },
      },
      select: { id: true },
    });
    if (!conOportunidadAjena) return;

    const organizacion = await getOrganization(paulina, conOportunidadAjena.id);
    expect(organizacion).not.toBeNull();

    const r = await editarOrganizacion(paulina, organizacion!, { name: "No debería" });
    expect(r).toMatchObject({ motivo: "AUTORIZACION" });
  });

  it("el nombre no puede quedar vacío", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const r = await editarOrganizacion(jorge, organizacion!, { name: " " });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("los días de crédito no pueden ser negativos", async () => {
    const organizacion = await getOrganization(jorge, organizacionId);
    const r = await editarOrganizacion(jorge, organizacion!, { creditDays: -10 });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });
});

describe("editarOrganizacion · lo que §52 corrige", () => {
  /** Una cuenta propia y desechable: estas pruebas escriben. */
  async function unaCuenta(nombre: string) {
    const r = await crearOrganizacion(jorge, { name: nombre, type: "PROSPECTO", countryCode: "MX" });
    if (!r.ok) throw new Error(`no se pudo crear la cuenta de prueba: ${JSON.stringify(r.problemas)}`);
    cuentasCreadas.push(r.datos.id);
    return r.datos.id;
  }

  it("rechaza ponerle el nombre de otra cuenta que ya existe", async () => {
    // Al crear ya se rechazaba el homónimo; al editar no se miraba, así que el
    // duplicado entraba por la puerta de atrás y partía el histórico igual.
    const id = await unaCuenta(`QA-homonima-${Date.now()}`);
    const otra = await prisma.organization.findFirstOrThrow({
      where: { deletedAt: null, id: { not: id } },
      select: { name: true },
    });

    const r = await editarOrganizacion(jorge, (await getOrganization(jorge, id))!, { name: otra.name });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("VALIDACION");
      expect(r.problemas[0]?.campo).toBe("name");
    }
  });

  it("no se estorba a sí misma: guardar sin cambiar el nombre pasa", async () => {
    const nombre = `QA-misma-${Date.now()}`;
    const id = await unaCuenta(nombre);
    const r = await editarOrganizacion(jorge, (await getOrganization(jorge, id))!, {
      name: nombre,
      city: "Monterrey",
    });
    expect(r.ok).toBe(true);
  });

  it("cambia el propietario de una cuenta CON sede, como lo manda la pantalla", async () => {
    // La pantalla envía todos los campos, sede incluida. Mezclar la relación
    // del propietario con la llave de país hacía que Prisma rechazara la
    // escritura entera y la pantalla reventara.
    const id = await unaCuenta(`QA-propietario-${Date.now()}`);
    const otro = await prisma.user.findFirstOrThrow({
      where: { active: true, deletedAt: null, id: { not: jorge.userId } },
      select: { id: true },
    });

    const r = await editarOrganizacion(jorge, (await getOrganization(jorge, id))!, {
      name: `QA-propietario-renombrada-${Date.now()}`,
      legalName: "QA SA de CV",
      type: "CLIENTE",
      city: "Monterrey",
      employees: 120,
      creditDays: 30,
      isStrategic: true,
      countryCode: "MX",
      ownerId: otro.id,
    });

    expect(r.ok).toBe(true);
    const tras = await prisma.organization.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true, countryCode: true },
    });
    expect(tras.ownerId).toBe(otro.id);
    expect(tras.countryCode).toBe("MX");
  });
});

describe("crearPersona · sin rol en el comité · §52", () => {
  it("se crea sin rol declarado, que es opcional (CU-23.1)", async () => {
    // Antes la escritura pedía desconectar una relación que al crear no existe,
    // y la pantalla reventaba en vez de guardar.
    const organizacion = await getOrganization(paulina, organizacionId);
    const r = await crearPersona(paulina, organizacion!, {
      name: "QA Sin Rol De Comite",
      committeeRoleId: null,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      personasCreadas.push(r.datos.id);
      const p = await prisma.person.findUniqueOrThrow({
        where: { id: r.datos.id },
        select: { committeeRoleId: true },
      });
      expect(p.committeeRoleId).toBeNull();
    }
  });
});
