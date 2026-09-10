import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getOrganization } from "@/lib/scope/organizations";
import { getPersona, listPersonas } from "@/lib/scope/people";
import { crearPersona, editarOrganizacion, editarPersona } from "@/lib/domain/contact";

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

describe("editarPersona · quién puede · Q-15", () => {
  it("quien alcanza la organización edita a su gente", async () => {
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

  it("una persona fuera del alcance no llega siquiera al dominio", async () => {
    // Paulina no es dueña de esta cuenta ni tiene oportunidades en ella.
    const organizacion = await prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null, NOT: { ownerId: paulina.userId } },
      select: { id: true },
    });
    const gente = await prisma.person.findFirst({
      where: { organizationId: organizacion.id, deletedAt: null },
      select: { id: true },
    });
    if (!gente) return;

    const alcanzadas = await listPersonas(paulina);
    const alcanza = alcanzadas.some((p) => p.id === gente.id);
    if (!alcanza) expect(await getPersona(paulina, gente.id)).toBeNull();
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
