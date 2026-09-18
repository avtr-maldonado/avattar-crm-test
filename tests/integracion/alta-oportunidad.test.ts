import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad, etapaInicial } from "@/lib/domain/opportunity";
import { buscarOrganizacionesParaAlta } from "@/lib/scope/organizations";
import { listOpportunities } from "@/lib/scope/opportunities";

/**
 * P-01 · el alta, contra los datos reales.
 *
 * Lo que se prueba aquí y no es cosmético: que el folio no se repita, que la
 * compuerta se evalúe al nacer igual que al mover, que crear organización y
 * oportunidad sea **una sola operación** —o las dos o ninguna—, y que el
 * buscador no filtre más de lo que el negocio autorizó.
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

const creadas: string[] = [];
const organizacionesCreadas: string[] = [];

async function umbrales() {
  const p = await getCommercialPolicy("MX");
  return { meddicMinToClosing: Number(p.meddicMinToClosing) };
}

async function insumos() {
  const [organizacion, pipeline] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { name: "Aceros del Norte" },
      select: { id: true },
    }),
    prisma.pipeline.findFirstOrThrow({
      where: { name: "Ventas México" },
      select: {
        id: true,
        stages: {
          select: { id: true, name: true, position: true, gateMode: true, gateRequires: true },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);
  return { organizacion, pipeline };
}

const BASE = {
  estimatedAmount: "125000.0000",
  expectedCloseDate: new Date("2026-12-01"),
  businessType: "NUEVO" as const,
};

afterAll(async () => {
  // El seed es dato compartido: 238 pruebas afirman cifras exactas sobre él
  // —14 oportunidades, valor abierto 12 621 000—. Si esto no limpia, fallan
  // todas y el síntoma aparece lejos de la causa.
  if (creadas.length) {
    await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
  }
  if (organizacionesCreadas.length) {
    await prisma.person.deleteMany({ where: { organizationId: { in: organizacionesCreadas } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizacionesCreadas } } });
  }
});

describe("crearOportunidad · INV-12 y el folio", () => {
  it("asigna folio con el formato de INV-12 y arranca donde debe", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();

    const r = await crearOportunidad(
      jorge,
      { ...BASE, name: "Prueba de alta", organizationId: organizacion.id, pipelineId: pipeline.id },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    expect(r.datos.folio).toMatch(/^OPP-\d{4}-\d{5}$/);

    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: {
        stageId: true,
        amount: true,
        estimatedAmount: true,
        grossMargin: true,
        countryCode: true,
        ownerId: true,
        createdById: true,
        forecastCategory: true,
      },
    });

    expect(creada.stageId).toBe(etapaInicial(pipeline.stages).id);
    // Sin cotización, el estimado ES el valor vigente.
    expect(creada.amount.toString()).toBe(creada.estimatedAmount.toString());
    // Inventar un margen sería peor que no tenerlo: las banderas de riesgo lo leen.
    expect(creada.grossMargin).toBeNull();
    // El país sale de la organización, no del formulario (AC-05).
    expect(creada.countryCode).toBe("MX");
    expect(creada.ownerId).toBe(jorge.userId);
    expect(creada.forecastCategory).toBe("PIPELINE");
  });

  it("dos altas simultáneas no repiten folio · RN-20", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();
    const u = await umbrales();
    const comun = { ...BASE, organizationId: organizacion.id, pipelineId: pipeline.id };

    const [a, b] = await Promise.all([
      crearOportunidad(jorge, { ...comun, name: "Concurrente A" }, u),
      crearOportunidad(jorge, { ...comun, name: "Concurrente B" }, u),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    creadas.push(a.datos.id, b.datos.id);

    expect(a.datos.folio).not.toBe(b.datos.folio);
  });
});

describe("crearOportunidad · la compuerta se evalúa al nacer · RN-02", () => {
  it("una etapa con requisitos que la oportunidad nueva no puede cumplir la detiene", async () => {
    // Una oportunidad recién nacida no tiene propuesta ni cotización congelada.
    // Que la compuerta lo diga es correcto; lo importante es que lo diga ANTES
    // de crear nada.
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();
    const conRequisitos = pipeline.stages.find(
      (e) => e.gateRequires.length > 0 && !e.gateRequires.includes("PERSONA_CON_ROL_DECLARADO"),
    );
    expect(conRequisitos).toBeDefined();

    const antes = await prisma.opportunity.count();
    const r = await crearOportunidad(
      jorge,
      {
        ...BASE,
        name: "Nace en etapa avanzada",
        organizationId: organizacion.id,
        pipelineId: pipeline.id,
        stageId: conRequisitos!.id,
      },
      await umbrales(),
    );

    expect(r).toMatchObject({ motivo: "COMPUERTA" });
    if (!r.ok) expect(r.problemas.length).toBeGreaterThan(0);
    // Nada se creó: la compuerta corre antes de la transacción.
    expect(await prisma.opportunity.count()).toBe(antes);
  });

  it("nombrar una persona con rol en el comité satisface su requisito", async () => {
    // PERSONA_CON_ROL_DECLARADO es el único requisito que una oportunidad puede
    // cumplir el día que nace, porque se captura en el mismo formulario.
    const jorge = await sesionDe("jm@avattar.com");
    const { organizacion, pipeline } = await insumos();
    const descubrimiento = pipeline.stages.find((e) =>
      e.gateRequires.includes("PERSONA_CON_ROL_DECLARADO"),
    );
    if (!descubrimiento || descubrimiento.gateRequires.length !== 1) return;

    const conRol = await prisma.person.findFirstOrThrow({
      where: { organizationId: organizacion.id, committeeRoleId: { not: null } },
      select: { id: true },
    });

    const r = await crearOportunidad(
      jorge,
      {
        ...BASE,
        name: "Con campeón declarado",
        organizationId: organizacion.id,
        pipelineId: pipeline.id,
        stageId: descubrimiento.id,
        primaryPersonId: conRol.id,
      },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    // Nacer en etapa avanzada deja historial: sin esa fila, la oportunidad
    // aparecería ahí sin que nada explique cómo llegó.
    const transicion = await prisma.stageTransition.findFirstOrThrow({
      where: { opportunityId: r.datos.id },
      select: { fromStageId: true, toStageId: true, gateOverride: true },
    });
    expect(transicion.fromStageId).toBeNull();
    expect(transicion.toStageId).toBe(descubrimiento.id);
    expect(transicion.gateOverride).toBe(false);
  });
});

describe("crearOportunidad · organización y persona nuevas, una sola operación", () => {
  it("crea las tres cosas juntas y la oportunidad queda ligada a ellas", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const { pipeline } = await insumos();
    const nombreEmpresa = `Prueba Industrial ${Date.now()}`;

    const r = await crearOportunidad(
      jorge,
      {
        ...BASE,
        name: `${nombreEmpresa} · Servicios administrados`,
        organizacionNueva: { name: nombreEmpresa, type: "PROSPECTO" },
        personaNueva: { name: "María Fernanda Ochoa", jobTitle: "Directora de TI" },
        pipelineId: pipeline.id,
      },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: {
        organization: { select: { id: true, name: true, type: true, ownerId: true, countryCode: true } },
        primaryPerson: { select: { name: true, initials: true, jobTitle: true } },
      },
    });
    organizacionesCreadas.push(creada.organization.id);

    expect(creada.organization.name).toBe(nombreEmpresa);
    expect(creada.organization.type).toBe("PROSPECTO");
    // La empresa que un vendedor da de alta es suya: es quien la trabaja.
    expect(creada.organization.ownerId).toBe(jorge.userId);
    expect(creada.organization.countryCode).toBe("MX");
    expect(creada.primaryPerson?.name).toBe("María Fernanda Ochoa");
    // Las iniciales se derivan, no se piden: un campo más que llenar por un
    // dato que el nombre ya contiene. Son las dos primeras palabras, que es la
    // convención que fija §15 al llamar «AL» a Ana Lucía Ríos y no «AR».
    expect(creada.primaryPerson?.initials).toBe("MF");
  });

  it("si la oportunidad falla, la organización tampoco se crea", async () => {
    // Lo contrario dejaría una empresa huérfana en el catálogo cada vez que
    // alguien cancela a medias. Esa es la basura que nadie limpia nunca.
    const jorge = await sesionDe("jm@avattar.com");
    const nombreEmpresa = `Fantasma ${Date.now()}`;
    const colombiano = await prisma.pipeline.findFirstOrThrow({
      where: { name: "Ventas Colombia" },
      select: { id: true },
    });

    // Jorge no opera en Colombia: el país de la oportunidad es el del pipeline
    // (§18) y elegir uno donde no operas se niega (AC-05). Lo que importa aquí
    // es lo que pasa después de la negativa.
    const r = await crearOportunidad(
      jorge,
      {
        ...BASE,
        name: "No debe existir",
        organizacionNueva: { name: nombreEmpresa, type: "PROSPECTO" },
        pipelineId: colombiano.id,
      },
      await umbrales(),
    );
    expect(r).toMatchObject({ ok: false, motivo: "AUTORIZACION" });

    const huerfana = await prisma.organization.findFirst({ where: { name: nombreEmpresa } });
    expect(huerfana).toBeNull();
  });
});

describe("crearOportunidad · Q-13, el propietario", () => {
  it("un vendedor no puede dar de alta a nombre de otro", async () => {
    // Si pudiera, tendría reasignación disfrazada de creación.
    const [paulina, gabriel] = await Promise.all([
      sesionDe("pe@avattar.com"),
      sesionDe("gd@avattar.com"),
    ]);
    const { organizacion, pipeline } = await insumos();

    const r = await crearOportunidad(
      paulina,
      {
        ...BASE,
        name: "Alta a nombre de otro",
        organizationId: organizacion.id,
        pipelineId: pipeline.id,
        ownerId: gabriel.userId,
      },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { ownerId: true },
    });
    // El campo se ignora y la oportunidad es suya. Pedirla a nombre de otro no
    // es un error de captura: es una petición que no aplica a su rol.
    expect(creada.ownerId).toBe(paulina.userId);

    // Y la ve en su pipeline, que es lo que importa (§2.3).
    const suyas = await listOpportunities(paulina);
    expect(suyas.map((o) => o.id)).toContain(r.datos.id);
  });

  it("un gerente sí puede asignarla a un vendedor de su país", async () => {
    const [jorge, gabriel] = await Promise.all([
      sesionDe("jm@avattar.com"),
      sesionDe("gd@avattar.com"),
    ]);
    const { organizacion, pipeline } = await insumos();

    const r = await crearOportunidad(
      jorge,
      {
        ...BASE,
        name: "Asignada por gerencia",
        organizationId: organizacion.id,
        pipelineId: pipeline.id,
        ownerId: gabriel.userId,
      },
      await umbrales(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    creadas.push(r.datos.id);

    const creada = await prisma.opportunity.findUniqueOrThrow({
      where: { id: r.datos.id },
      select: { ownerId: true, createdById: true },
    });
    expect(creada.ownerId).toBe(gabriel.userId);
    // Quién la creó no se pierde: la visibilidad sigue a ownerId (RN-31), pero
    // el rastro de quién la capturó queda.
    expect(creada.createdById).toBe(jorge.userId);
  });
});

describe("buscarOrganizacionesParaAlta · la excepción al alcance", () => {
  it("un vendedor ve organizaciones que no son suyas · evita el duplicado", async () => {
    // Decisión del negocio del 2-sep-2026. Si no las viera, crearía
    // «Hidrosistemas del Valle SA» y el histórico quedaría partido en dos.
    const paulina = await sesionDe("pe@avattar.com");
    const encontradas = await buscarOrganizacionesParaAlta(paulina, "Hidro");

    expect(encontradas.length).toBeGreaterThan(0);
    expect(encontradas.map((o) => o.name)).toContain("Hidrosistemas del Valle");
  });

  it("no expone propietario ni cifras: la fuga queda acotada a lo autorizado", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const serializado = JSON.stringify(await buscarOrganizacionesParaAlta(paulina, "an"));

    expect(serializado).not.toContain("ownerId");
    expect(serializado).not.toContain("owner");
    expect(serializado).not.toContain("_count");
  });

  it("no filtra por país: una cuenta con sede en Chile se le ofrece a un vendedor de México (§18)", async () => {
    // Las cuentas no son de un país. Si la búsqueda las escondiera por sede,
    // el vendedor crearía un duplicado justo del caso que más importa evitar.
    const paulina = await sesionDe("pe@avattar.com");
    const direccion = await sesionDe("dc@avattar.com");
    const nombre = `Zeta Global Prueba ${Date.now()}`;
    const creada = await prisma.organization.create({
      data: { name: nombre, type: "PROSPECTO", countryCode: "CL", ownerId: direccion.userId },
      select: { id: true },
    });
    try {
      const encontradas = await buscarOrganizacionesParaAlta(paulina, "Zeta Global Prueba");
      expect(encontradas.map((o) => o.id)).toContain(creada.id);
    } finally {
      await prisma.organization.delete({ where: { id: creada.id } });
    }
  });

  it("no busca con menos de dos caracteres", async () => {
    // Una sola letra devolvería el catálogo entero en cada tecla.
    const paulina = await sesionDe("pe@avattar.com");
    expect(await buscarOrganizacionesParaAlta(paulina, "an")).toBeInstanceOf(Array);
    expect(await buscarOrganizacionesParaAlta(paulina, "")).toEqual([]);
  });
});
