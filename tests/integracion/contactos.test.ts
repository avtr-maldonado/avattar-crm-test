import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { ORGANIZACIONES } from "@/prisma/seed/datos";
import { toClient } from "@/lib/money";
import {
  getOrganizationDetail,
  indicadoresDeCuenta,
  listOrganizationsConIndicadores,
  oportunidadesDeCuenta,
} from "@/lib/scope/organizationIndicators";

/**
 * P-03 y P-04 contra los datos reales.
 *
 * El foco está en la fuga que §5.3 existe para evitar: **los agregados de una
 * cuenta son un canal**. Una lista de cuentas puede estar perfectamente acotada
 * y aun así revelar el pipeline del compañero si el total de la cuenta se
 * calcula sobre todo lo que hay ahí.
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

const cuentaPorNombre = async (nombre: string) =>
  prisma.organization.findFirstOrThrow({ where: { name: nombre }, select: { id: true } });

describe("P-03 · qué cuentas se ven · §5.3", () => {
  it("el gerente ve las catorce de su oficina", async () => {
    // Lo que este criterio prueba es el **alcance**: un gerente ve todas las
    // cuentas de su país, no solo las suyas. Se verifica que las catorce
    // sembradas estén, no que sean las únicas —dar de alta una oportunidad
    // puede crear una cuenta nueva, y eso es el sistema funcionando.
    const jorge = await sesionDe("jm@avattar.com");
    const { organizaciones } = await listOrganizationsConIndicadores(jorge);
    const vistas = new Set(organizaciones.map((o) => o.name));

    for (const sembrada of ORGANIZACIONES) {
      expect(vistas.has(sembrada.name), `no ve ${sembrada.name}`).toBe(true);
    }
    expect(organizaciones.length).toBeGreaterThanOrEqual(ORGANIZACIONES.length);
  });

  it("el vendedor ve las suyas Y aquellas donde tiene una oportunidad", async () => {
    // Paulina es propietaria de Farmacéutica Anáhuac, Cimarrón y Seguros
    // Altamira, y tiene oportunidades en esas mismas tres.
    const paulina = await sesionDe("pe@avattar.com");
    const { organizaciones } = await listOrganizationsConIndicadores(paulina);
    const nombres = organizaciones.map((o) => o.name).sort();

    expect(nombres).toEqual([
      "Cimarrón Manufactura",
      "Farmacéutica Anáhuac",
      "Seguros Altamira",
    ]);
  });

  it("un vendedor no ve una cuenta ajena donde no tiene nada", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const { organizaciones } = await listOrganizationsConIndicadores(paulina);
    expect(organizaciones.map((o) => o.name)).not.toContain("Aceros del Norte");
  });
});

describe("P-03 · los agregados NO filtran por resta · §5.3", () => {
  it("el pipeline de una cuenta es el del usuario, no el total de la cuenta", async () => {
    // Esta es la prueba que justifica todo el módulo. Se construye el caso:
    // una cuenta compartida entre dos vendedores.
    const cimarron = await cuentaPorNombre("Cimarrón Manufactura");

    const [paulina, gabriel, jorge] = await Promise.all([
      sesionDe("pe@avattar.com"),
      sesionDe("gd@avattar.com"),
      sesionDe("jm@avattar.com"),
    ]);

    // Se le presta a Gabriel una oportunidad en la cuenta de Paulina.
    const prestada = await prisma.opportunity.findFirstOrThrow({
      where: { organizationId: cimarron.id },
      select: { id: true, ownerId: true, amount: true },
    });

    const nueva = await prisma.opportunity.create({
      data: {
        folio: "OPP-2099-90001",
        name: "Caso de prueba · cuenta compartida",
        organizationId: cimarron.id,
        pipelineId: (
          await prisma.pipeline.findFirstOrThrow({
            where: { name: "Ventas México" },
            select: { id: true },
          })
        ).id,
        stageId: (
          await prisma.stage.findFirstOrThrow({
            where: { pipeline: { name: "Ventas México" }, position: 1 },
            select: { id: true },
          })
        ).id,
        countryCode: "MX",
        estimatedAmount: "777000",
        amount: "777000",
        businessType: "NUEVO",
        expectedCloseDate: new Date("2026-11-30T00:00:00Z"),
        ownerId: gabriel.userId,
        createdById: gabriel.userId,
        stageEnteredAt: new Date("2026-08-25T00:00:00Z"),
      },
      select: { id: true },
    });

    try {
      const [dePaulina, deGabriel, deJorge] = await Promise.all([
        indicadoresDeCuenta(paulina, cimarron.id),
        indicadoresDeCuenta(gabriel, cimarron.id),
        indicadoresDeCuenta(jorge, cimarron.id),
      ]);

      // Gabriel ve solo la suya.
      expect(toClient(deGabriel.pipelineAbierto)).toBe("777000");
      expect(deGabriel.abiertas).toBe(1);

      // Paulina ve solo la suya: NO incluye los 777 000 de Gabriel.
      expect(toClient(dePaulina.pipelineAbierto)).toBe(toClient(prestada.amount));
      expect(dePaulina.abiertas).toBe(1);

      // El gerente ve las dos, porque su alcance es la oficina.
      expect(deJorge.abiertas).toBe(2);
      expect(toClient(deJorge.pipelineAbierto)).toBe(
        prestada.amount.plus("777000").toString(),
      );

      // Y lo que esta prueba existe para impedir: que Paulina pudiera restar.
      expect(toClient(dePaulina.pipelineAbierto)).not.toBe(
        toClient(deJorge.pipelineAbierto),
      );
    } finally {
      await prisma.opportunity.delete({ where: { id: nueva.id } });
    }
  });

  it("la ficha de una cuenta compartida solo lista las oportunidades propias", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const jorge = await sesionDe("jm@avattar.com");
    const bajio = await cuentaPorNombre("Grupo Industrial Bajío");

    // Bajío es de Ana Lucía; Paulina no tiene nada ahí.
    expect(await oportunidadesDeCuenta(paulina, bajio.id)).toHaveLength(0);
    expect((await oportunidadesDeCuenta(jorge, bajio.id)).length).toBeGreaterThan(0);
  });
});

describe("P-03 · «sin histórico» no es «cero» · C-02", () => {
  it("mientras no haya cierres, la bandera lo dice en vez de mostrar cero", async () => {
    // El sistema arrancó en limpio, sin migrar Pipedrive. Un cero afirmaría que
    // la cuenta no compró; la verdad es que no hay historia.
    const jorge = await sesionDe("jm@avattar.com");
    const { hayHistoricoDeCierres, organizaciones } =
      await listOrganizationsConIndicadores(jorge);

    const cerradas = await prisma.opportunity.count({
      where: { status: { in: ["GANADA", "PERDIDA"] } },
    });

    expect(hayHistoricoDeCierres).toBe(cerradas > 0);
    // Y el agregado sigue siendo cero, que es correcto: la bandera decide cómo
    // se lee, no cambia el número.
    for (const o of organizaciones) {
      expect(toClient(o.indicadores.ganado12Meses)).toBe("0");
    }
  });
});

describe("P-04 · ficha de organización", () => {
  it("un vendedor no alcanza una cuenta ajena: devuelve null, no lanza", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const aceros = await cuentaPorNombre("Aceros del Norte");
    expect(await getOrganizationDetail(paulina, aceros.id)).toBeNull();
  });

  it("Aceros del Norte trae su jerarquía y su comité", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const aceros = await cuentaPorNombre("Aceros del Norte");
    const ficha = (await getOrganizationDetail(jorge, aceros.id))!;

    expect(ficha.parent?.name).toBe("Grupo Industrial Bajío");
    expect(ficha.isStrategic).toBe(true);
    expect(ficha.people).toHaveLength(4);
    expect(ficha.people.every((p) => p.committeeRole !== null)).toBe(true);
  });

  it("Grupo Industrial Bajío ve a Aceros como filial", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const bajio = await cuentaPorNombre("Grupo Industrial Bajío");
    const ficha = (await getOrganizationDetail(jorge, bajio.id))!;

    expect(ficha.children.map((h) => h.name)).toContain("Aceros del Norte");
  });
});
