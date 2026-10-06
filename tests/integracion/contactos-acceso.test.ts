import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { getOrganization } from "@/lib/scope/organizations";
import { getPersona, listPersonas } from "@/lib/scope/people";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { crearPersona, editarPersona, guardarAccesoDePersona } from "@/lib/domain/contact";
import { editarOportunidad } from "@/lib/domain/opportunity";
import { administraPersona } from "@/lib/domain/personAccess";

/**
 * Personas con propietario, compartidas y transferibles · decisiones §29.
 *
 * Contra la base real. Lo que se prueba es quién ve y quién administra: la
 * persona nace de quien la captura; compartir da lectura y nada más; transferir
 * cambia quién administra; el gerente puede hacerlo en nombre del vendedor; y
 * reasignar una oportunidad comparte la gente de la cuenta con quien la
 * recibe. Todo lo creado se borra al final.
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
    limits: Object.fromEntries(permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null])),
  };
}

let paulina: Session; // VENDEDOR MX
let otro: Session; // otro VENDEDOR MX
let jorge: Session; // GERENTE_PAIS MX
let direccion: Session;
let acerosId: string;
const creadas: string[] = [];
const inicio = new Date();

beforeAll(async () => {
  [paulina, otro, jorge, direccion] = await Promise.all([
    sesionDe("pe@avattar.com"),
    sesionDe("gd@avattar.com"),
    sesionDe("jm@avattar.com"),
    sesionDe("dc@avattar.com"),
  ]);
  acerosId = (
    await prisma.organization.findFirstOrThrow({ where: { name: "Aceros del Norte" }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  if (creadas.length) {
    await prisma.auditLog.deleteMany({ where: { entity: "Person", entityId: { in: creadas } } });
    // Las compartidas se van en cascada con la persona.
    await prisma.person.deleteMany({ where: { id: { in: creadas } } });
  }
});

async function personaDePaulinaEnAceros(nombre: string) {
  const cuenta = await getOrganization(paulina, acerosId);
  const r = await crearPersona(paulina, cuenta!, { name: nombre });
  if (!r.ok) throw new Error("no se pudo preparar la persona");
  creadas.push(r.datos.id);
  return r.datos.id;
}

describe("la persona nace de quien la captura", () => {
  it("la ve su propietario, el gerente de su país y Dirección; otro vendedor, no", async () => {
    const id = await personaDePaulinaEnAceros("Prueba Acceso Uno");

    const mia = await getPersona(paulina, id);
    expect(mia?.ownerId).toBe(paulina.userId);
    expect(administraPersona(paulina, mia!)).toBe(true);

    expect(await getPersona(otro, id)).toBeNull();
    expect((await listPersonas(otro)).some((p) => p.id === id)).toBe(false);

    const vistaPorJorge = await getPersona(jorge, id);
    expect(vistaPorJorge).not.toBeNull();
    expect(administraPersona(jorge, vistaPorJorge!)).toBe(true);

    expect(await getPersona(direccion, id)).not.toBeNull();
  });
});

describe("compartir da lectura, y se puede retirar", () => {
  it("quien la recibe la ve, pero no la edita ni la vuelve a compartir", async () => {
    const id = await personaDePaulinaEnAceros("Prueba Acceso Dos");
    const mia = (await getPersona(paulina, id))!;

    const r = await guardarAccesoDePersona(paulina, mia, { ownerId: paulina.userId, compartirCon: [otro.userId] });
    expect(r.ok).toBe(true);

    const vistaPorOtro = await getPersona(otro, id);
    expect(vistaPorOtro).not.toBeNull();
    expect(administraPersona(otro, vistaPorOtro!)).toBe(false);
    expect(await editarPersona(otro, vistaPorOtro!, { jobTitle: "Intruso" })).toMatchObject({ motivo: "AUTORIZACION" });
    expect(
      await guardarAccesoDePersona(otro, vistaPorOtro!, { ownerId: otro.userId, compartirCon: [] }),
    ).toMatchObject({ motivo: "AUTORIZACION" });

    // INV-09 · quedó en la bitácora, con quién estaba y con quién queda.
    const rastro = await prisma.auditLog.findFirst({
      where: { entity: "Person", entityId: id, action: "COMPARTIR_CONTACTO" },
      select: { after: true },
    });
    expect(rastro?.after).toEqual({ compartidaCon: [otro.userId] });
  });

  it("dejar de compartir la esconde otra vez", async () => {
    const id = await personaDePaulinaEnAceros("Prueba Acceso Tres");
    let mia = (await getPersona(paulina, id))!;
    await guardarAccesoDePersona(paulina, mia, { ownerId: paulina.userId, compartirCon: [otro.userId] });
    expect(await getPersona(otro, id)).not.toBeNull();

    mia = (await getPersona(paulina, id))!;
    const r = await guardarAccesoDePersona(paulina, mia, { ownerId: paulina.userId, compartirCon: [] });
    expect(r.ok).toBe(true);
    expect(await getPersona(otro, id)).toBeNull();
  });

  it("sin cambios no escribe nada", async () => {
    const id = await personaDePaulinaEnAceros("Prueba Acceso Cuatro");
    const mia = (await getPersona(paulina, id))!;
    const r = await guardarAccesoDePersona(paulina, mia, { ownerId: paulina.userId, compartirCon: [] });
    expect(r.ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: "Person", entityId: id } })).toBe(0);
  });
});

describe("transferir cambia quién administra", () => {
  it("el propietario la entrega y deja de verla; el gerente la devuelve en nombre del vendedor", async () => {
    const id = await personaDePaulinaEnAceros("Prueba Acceso Cinco");
    const mia = (await getPersona(paulina, id))!;

    const r = await guardarAccesoDePersona(paulina, mia, { ownerId: otro.userId, compartirCon: [] });
    expect(r.ok).toBe(true);

    const deOtro = await getPersona(otro, id);
    expect(deOtro?.ownerId).toBe(otro.userId);
    expect(administraPersona(otro, deOtro!)).toBe(true);
    // Paulina no tiene oportunidades en Aceros: sin ser dueña ni compartida, no la ve.
    expect(await getPersona(paulina, id)).toBeNull();

    const rastro = await prisma.auditLog.findFirst({
      where: { entity: "Person", entityId: id, action: "CAMBIAR_PROPIETARIO" },
      select: { before: true, after: true },
    });
    expect(rastro).toMatchObject({ before: { ownerId: paulina.userId }, after: { ownerId: otro.userId } });

    // Gerencia también comparte y transfiere (respuesta 9 del negocio).
    const vistaPorJorge = (await getPersona(jorge, id))!;
    const devuelta = await guardarAccesoDePersona(jorge, vistaPorJorge, {
      ownerId: paulina.userId,
      compartirCon: [otro.userId],
    });
    expect(devuelta.ok).toBe(true);
    expect((await getPersona(paulina, id))?.ownerId).toBe(paulina.userId);
    expect(await getPersona(otro, id)).not.toBeNull();
  });
});

describe("reasignar una oportunidad comparte la gente de la cuenta", () => {
  it("quien recibe la oportunidad recibe lectura sobre las personas de la cuenta", async () => {
    const oportunidad = await prisma.opportunity.findFirst({
      where: { ownerId: paulina.userId, status: "ABIERTA", deletedAt: null },
      select: { id: true, organizationId: true, countryCode: true },
    });
    if (!oportunidad) return;
    // Si el otro vendedor ya tiene algo en esa cuenta, la vería de todos modos.
    const yaVe = await prisma.opportunity.count({
      where: { organizationId: oportunidad.organizationId, ownerId: otro.userId, deletedAt: null },
    });
    if (yaVe > 0) return;

    const cuenta = await getOrganization(paulina, oportunidad.organizationId);
    const creada = await crearPersona(paulina, cuenta!, { name: "Prueba Acceso Seis" });
    if (!creada.ok) throw new Error("no se pudo preparar la persona");
    creadas.push(creada.datos.id);
    expect(await getPersona(otro, creada.datos.id)).toBeNull();

    const politica = await getCommercialPolicy(oportunidad.countryCode);
    const umbrales = { meddicMinToCommit: politica.meddicMinToCommit };
    try {
      const detalle = await getOpportunityDetail(jorge, oportunidad.id);
      const r = await editarOportunidad(jorge, detalle!, { ownerId: otro.userId }, umbrales);
      expect(r.ok).toBe(true);

      const compartida = await prisma.personShare.findFirst({
        where: { personId: creada.datos.id, userId: otro.userId },
        select: { sharedById: true },
      });
      expect(compartida?.sharedById).toBe(jorge.userId);
      expect(await getPersona(otro, creada.datos.id)).not.toBeNull();
    } finally {
      // Se devuelve la oportunidad y se retira lo que la prueba compartió.
      const detalle = await getOpportunityDetail(jorge, oportunidad.id);
      await editarOportunidad(jorge, detalle!, { ownerId: paulina.userId }, umbrales);
      await prisma.personShare.deleteMany({ where: { sharedById: jorge.userId, createdAt: { gte: inicio } } });
    }
  });
});

describe("el comité en el detalle de oportunidad dice de quién es cada persona (decisiones §47)", () => {
  it("cada persona trae propietario y países del propietario: lo que `administraPersona` necesita para decidir el botón «Editar»", async () => {
    // Cualquier oportunidad de la base; en su cuenta, Paulina da de alta a una
    // persona (las cuentas se ven todas, §18). Dirección la ve en el detalle y
    // el detalle debe decir de quién es: con eso la pantalla decide el botón.
    const cualquiera = await prisma.opportunity.findFirstOrThrow({
      where: { deletedAt: null },
      select: { id: true, organizationId: true },
    });
    const cuenta = await getOrganization(paulina, cualquiera.organizationId);
    const creada = await crearPersona(paulina, cuenta!, { name: "Prueba Acceso Siete" });
    if (!creada.ok) throw new Error("no se pudo preparar la persona");
    creadas.push(creada.datos.id);

    const detalle = await getOpportunityDetail(direccion, cualquiera.id);
    const persona = detalle!.organization.people.find((p) => p.id === creada.datos.id);
    expect(persona).toBeDefined();
    // Lo que el detalle debe traer para que la pantalla decida sin adivinar.
    expect(persona!.ownerId).toBe(paulina.userId);
    expect(persona!.owner.name).toBe(paulina.name);
    expect(persona!.owner.countryCodes).toContain("MX");
    // Con esos campos, la regla de §29 decide: su propietaria y Dirección la
    // administran; Preventa, que puede ver la oportunidad sin que la persona
    // sea suya, no: sin botón «Editar» (§47).
    const ivan = await sesionDe("ic@avattar.com");
    expect(administraPersona(paulina, persona!)).toBe(true);
    expect(administraPersona(direccion, persona!)).toBe(true);
    expect(administraPersona(ivan, persona!)).toBe(false);
  });
});
