import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { getCotizacion } from "@/lib/scope/cotizaciones";
import { abrirCotizacion, guardarLinea } from "@/lib/domain/quoteService";
import { money } from "@/lib/money";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { guardarComponenteMeddic } from "@/lib/domain/meddicService";
import { guardarHito, marcarHito, quitarHito } from "@/lib/domain/milestoneService";
import { cuadreDeHitos } from "@/lib/domain/milestone";
import { PESOS_POR_OMISION } from "@/lib/domain/meddic";

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
const creadas: string[] = [];

beforeAll(async () => {
  jorge = await sesionDe("jm@avattar.com");
});

afterAll(async () => {
  if (!creadas.length) return;
  const quotes = await prisma.quote.findMany({
    where: { opportunityId: { in: creadas } },
    select: { id: true },
  });
  await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quotes.map((q) => q.id) } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: quotes.map((q) => q.id) } } });
  await prisma.quote.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.meddicComponentAssessment.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.person.deleteMany({ where: { name: { startsWith: "Laura Prueba MEDDIC" } } });
  await prisma.milestone.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

async function unaOportunidad() {
  const [organizacion, pipeline, politica] = await Promise.all([
    prisma.organization.findFirstOrThrow({
      where: { countryCode: "MX", deletedAt: null, people: { some: {} } },
      select: { id: true },
    }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
    getCommercialPolicy("MX"),
  ]);

  const r = await crearOportunidad(
    jorge,
    {
      name: `MEDDIC · ${Math.random().toString(36).slice(2, 8)}`,
      organizationId: organizacion.id,
      pipelineId: pipeline.id,
      estimatedAmount: "1000000.0000",
      expectedCloseDate: new Date("2026-12-31"),
      businessType: "NUEVO",
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad");
  creadas.push(r.datos.id);
  return r.datos.id;
}

describe("guardarComponenteMeddic · AC-16, el puntaje en la misma transacción", () => {
  it("guardar un componente actualiza meddicScore", async () => {
    // «Se recalcula en la misma transacción en que cambia un componente. Nunca
    // se edita a mano.» Si divergen, la tarjeta del kanban miente.
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);

    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "METRICAS", status: "CONFIRMADO", evidence: "Ahorro de 1.2 M anuales." },
      PESOS_POR_OMISION,
    );
    expect(r.ok).toBe(true);

    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { id },
      select: { meddicScore: true },
    });
    expect(o.meddicScore).toBe(r.ok ? r.datos.puntaje : -1);
    // Un componente de peso 17 en CONFIRMADO: 2 × 17 ÷ 2 = 17.
    expect(o.meddicScore).toBe(17);
  });

  it("RN-30 enmendada (§24) · marcar PARCIAL con evidencia vacía pasa y guarda la evidencia en blanco", async () => {
    // AC-13 decía que fallaba. El negocio quitó el candado el 23-sep-2026: se
    // guarda, y la tarjeta señala que falta la evidencia.
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "DOLOR_IDENTIFICADO", status: "PARCIAL", evidence: "   " },
      PESOS_POR_OMISION,
    );
    expect(r.ok).toBe(true);
    const guardado = await prisma.meddicComponentAssessment.findFirstOrThrow({
      where: { opportunityId: id, component: "DOLOR_IDENTIFICADO" },
      select: { status: true, evidence: true },
    });
    expect(guardado.status).toBe("PARCIAL");
    expect(guardado.evidence).toBeNull();
  });

  it("§27 · confirmar sin evidencia falla y no escribe", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "METRICAS", status: "CONFIRMADO", evidence: "  " },
      PESOS_POR_OMISION,
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
    expect(await prisma.meddicComponentAssessment.count({ where: { opportunityId: id } })).toBe(0);
  });

  it("§27 · confirmar al decisor creando a la persona en el mismo paso la liga y la deja en la cuenta", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const nombre = `Laura Prueba MEDDIC ${Date.now()}`;
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      {
        component: "DECISOR_ECONOMICO",
        status: "CONFIRMADO",
        evidence: "Firmó la orden anterior; lo confirmó el 5 de septiembre.",
        nuevaPersona: { name: nombre, jobTitle: "CFO" },
      },
      PESOS_POR_OMISION,
    );
    expect(r.ok).toBe(true);

    const guardado = await prisma.meddicComponentAssessment.findFirstOrThrow({
      where: { opportunityId: id, component: "DECISOR_ECONOMICO" },
      select: { personId: true, person: { select: { name: true, jobTitle: true, organizationId: true } } },
    });
    expect(guardado.personId).not.toBeNull();
    expect(guardado.person?.name).toBe(nombre);
    expect(guardado.person?.jobTitle).toBe("CFO");
    expect(guardado.person?.organizationId).toBe(detalle!.organization.id);
  });

  it("§27 · una persona nueva sin nombre no se crea ni se liga", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "CAMPEON", status: "CONFIRMADO", evidence: "Aliado.", nuevaPersona: { name: " " } },
      PESOS_POR_OMISION,
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("personaNombre");
  });

  it("AC-12 · confirmar CAMPEON sin ligar persona falla", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "CAMPEON", status: "CONFIRMADO", evidence: "Nos abre puertas internas." },
      PESOS_POR_OMISION,
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("la persona tiene que ser del comité de ESTA cuenta", async () => {
    // §2.1 · «apunta a una persona real del comité de compra, no a texto libre».
    // Una persona de otra empresa satisfaría la validación de forma y mentiría.
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const ajena = await prisma.person.findFirst({
      where: { organizationId: { not: detalle!.organization.id }, deletedAt: null },
      select: { id: true },
    });
    if (!ajena) return;

    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      {
        component: "CAMPEON",
        status: "CONFIRMADO",
        evidence: "Aliado interno.",
        personId: ajena.id,
      },
      PESOS_POR_OMISION,
    );
    expect(r).toMatchObject({ motivo: "VALIDACION" });
    if (!r.ok) expect(r.problemas[0]?.campo).toBe("personId");
  });

  it("confirmar con una persona del comité sí pasa y sube el puntaje", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const delComite = detalle!.organization.people[0];
    if (!delComite) return;

    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      {
        component: "DECISOR_ECONOMICO",
        status: "CONFIRMADO",
        evidence: "Firma el contrato.",
        personId: delComite.id,
      },
      PESOS_POR_OMISION,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.puntaje).toBeGreaterThan(0);
  });

  it("cambiar un componente vuelve a recalcular, no acumula", async () => {
    const id = await unaOportunidad();
    let detalle = await getOpportunityDetail(jorge, id);
    await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "METRICAS", status: "CONFIRMADO", evidence: "Ahorro medido." },
      PESOS_POR_OMISION,
    );

    detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarComponenteMeddic(
      jorge,
      detalle!,
      { component: "METRICAS", status: "PARCIAL", evidence: "Solo estimado." },
      PESOS_POR_OMISION,
    );
    // De CONFIRMADO (2 puntos) a PARCIAL (1): 17 → 9 al redondear.
    expect(r.ok && r.datos.puntaje).toBe(9);
    expect(await prisma.meddicComponentAssessment.count({ where: { opportunityId: id } })).toBe(1);
  });
});

describe("hitos · HF-01 y AC-18", () => {
  it("se guardan como monto y en orden", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);

    // Fechas escritas enteras: `2026-1${i+1}` daba «2026-13-15» en la tercera
    // vuelta, que no es una fecha y Prisma rechaza con razón.
    const calendario = [
      { monto: "300000", vence: "2026-10-15" },
      { monto: "200000", vence: "2026-11-15" },
      { monto: "300000", vence: "2026-12-15" },
    ];
    for (const [i, h] of calendario.entries()) {
      await guardarHito(jorge, detalle!, {
        description: `Hito ${i + 1}`,
        dueDate: new Date(h.vence),
        amount: h.monto,
      });
    }

    const hitos = await prisma.milestone.findMany({
      where: { opportunityId: id },
      orderBy: { position: "asc" },
      select: { position: true, amount: true, status: true },
    });
    expect(hitos).toHaveLength(3);
    expect(hitos.map((h) => h.position)).toEqual([1, 2, 3]);
    expect(hitos[0]!.status).toBe("PENDIENTE");
  });

  it("AC-18 · el cuadre dice cuánto falta con la cifra", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    for (const monto of ["300000", "200000", "300000"]) {
      await guardarHito(jorge, detalle!, {
        description: "Parcialidad",
        dueDate: new Date("2026-11-15"),
        amount: monto,
      });
    }

    const hitos = await prisma.milestone.findMany({
      where: { opportunityId: id },
      select: { amount: true },
    });
    const r = cuadreDeHitos(
      hitos.map((h) => h.amount),
      money("1000000"),
    );
    expect(r.cuadra).toBe(false);
    expect(r.mensaje).toContain("200,000");
  });

  it("un monto en cero o negativo no pasa", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, {
      description: "Anticipo",
      dueDate: new Date("2026-11-01"),
      amount: "0",
    });
    expect(r).toMatchObject({ motivo: "VALIDACION" });
  });

  it("marcar cumplido sella la fecha, y desmarcarlo la borra", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    await guardarHito(jorge, detalle!, {
      description: "Anticipo",
      dueDate: new Date("2026-11-01"),
      amount: "500000",
    });
    const hito = await prisma.milestone.findFirstOrThrow({
      where: { opportunityId: id },
      select: { id: true },
    });

    await marcarHito(jorge, detalle!, hito.id, true);
    let h = await prisma.milestone.findUniqueOrThrow({
      where: { id: hito.id },
      select: { status: true, completedAt: true },
    });
    expect(h.status).toBe("CUMPLIDO");
    expect(h.completedAt).not.toBeNull();

    await marcarHito(jorge, detalle!, hito.id, false);
    h = await prisma.milestone.findUniqueOrThrow({
      where: { id: hito.id },
      select: { status: true, completedAt: true },
    });
    expect(h.status).toBe("PENDIENTE");
    expect(h.completedAt).toBeNull();
  });

  it("quitar un hito lo quita de esta oportunidad y de ninguna otra", async () => {
    const id = await unaOportunidad();
    const otra = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const detalleOtra = await getOpportunityDetail(jorge, otra);

    await guardarHito(jorge, detalle!, {
      description: "De la primera",
      dueDate: new Date("2026-11-01"),
      amount: "100",
    });
    await guardarHito(jorge, detalleOtra!, {
      description: "De la segunda",
      dueDate: new Date("2026-11-01"),
      amount: "100",
    });

    const dePrimera = await prisma.milestone.findFirstOrThrow({
      where: { opportunityId: id },
      select: { id: true },
    });
    // Se intenta quitarlo desde la OTRA oportunidad: no debe poder.
    await quitarHito(jorge, detalleOtra!, dePrimera.id);
    expect(await prisma.milestone.count({ where: { opportunityId: id } })).toBe(1);

    await quitarHito(jorge, detalle!, dePrimera.id);
    expect(await prisma.milestone.count({ where: { opportunityId: id } })).toBe(0);
  });
});

/** Una oportunidad con cotización de una línea: neto exacto de 1 000 000. */
async function unaOportunidadConNeto() {
  const id = await unaOportunidad();
  const detalle = await getOpportunityDetail(jorge, id);
  const [pais, producto] = await Promise.all([
    getCountry("MX"),
    prisma.product.findFirstOrThrow({ where: { active: true, prices: { some: {} } }, select: { id: true } }),
  ]);
  const abierta = await abrirCotizacion(jorge, detalle!, pais.taxRate);
  if (!abierta.ok) throw new Error("no se pudo abrir la cotización");
  const cotizacion = await getCotizacion(jorge, abierta.datos.id);
  const linea = await guardarLinea(
    jorge,
    cotizacion!,
    { productId: producto.id, quantity: "1", discountRate: "0", unitPrice: "1000000" },
    { lineMarginFloor: "0.10" },
  );
  if (!linea.ok) throw new Error(`no se pudo agregar la línea: ${JSON.stringify(linea)}`);
  return id;
}

describe("hitos · la suma no supera el neto", () => {
  it("un hito que rebasa el neto se rechaza con las cifras y no se escribe", async () => {
    const id = await unaOportunidadConNeto();
    let detalle = await getOpportunityDetail(jorge, id);
    await guardarHito(jorge, detalle!, {
      description: "Anticipo",
      dueDate: new Date("2026-10-15"),
      amount: "600000",
    });

    detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, {
      description: "Entrega",
      dueDate: new Date("2026-11-15"),
      amount: "600000",
    });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) {
      expect(r.problemas[0]?.campo).toBe("amount");
      expect(r.problemas[0]?.mensaje).toContain("1,200,000");
      expect(r.problemas[0]?.mensaje).toContain("1,000,000");
    }

    const hitos = await prisma.milestone.count({ where: { opportunityId: id } });
    expect(hitos).toBe(1);
  });

  it("llegar exacto al neto sí pasa: es el cuadre", async () => {
    const id = await unaOportunidadConNeto();
    let detalle = await getOpportunityDetail(jorge, id);
    await guardarHito(jorge, detalle!, { description: "Anticipo", dueDate: new Date("2026-10-15"), amount: "600000" });
    detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, { description: "Entrega", dueDate: new Date("2026-11-15"), amount: "400000" });
    expect(r.ok).toBe(true);
  });

  it("al editar un hito, su monto anterior no cuenta contra el tope", async () => {
    const id = await unaOportunidadConNeto();
    let detalle = await getOpportunityDetail(jorge, id);
    await guardarHito(jorge, detalle!, { description: "Anticipo", dueDate: new Date("2026-10-15"), amount: "600000" });
    detalle = await getOpportunityDetail(jorge, id);
    const anticipo = detalle!.milestones[0]!;
    // 600 000 → 900 000: con el anterior contado dos veces sumaría 1 500 000.
    const r = await guardarHito(jorge, detalle!, {
      milestoneId: anticipo.id,
      description: "Anticipo",
      dueDate: new Date("2026-10-15"),
      amount: "900000",
    });
    expect(r.ok).toBe(true);
  });

  it("en porcentaje, el servidor convierte contra el neto y guarda monto", async () => {
    const id = await unaOportunidadConNeto();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, {
      description: "Anticipo",
      dueDate: new Date("2026-10-15"),
      amount: "30",
      modo: "porcentaje",
    });
    expect(r.ok).toBe(true);
    const hito = await prisma.milestone.findFirstOrThrow({ where: { opportunityId: id }, select: { amount: true } });
    expect(hito.amount.toString()).toBe("300000");
  });

  it("en porcentaje sin cotización con líneas no hay neto: se rechaza", async () => {
    const id = await unaOportunidad();
    const detalle = await getOpportunityDetail(jorge, id);
    const r = await guardarHito(jorge, detalle!, {
      description: "Anticipo",
      dueDate: new Date("2026-10-15"),
      amount: "30",
      modo: "porcentaje",
    });
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });
});
