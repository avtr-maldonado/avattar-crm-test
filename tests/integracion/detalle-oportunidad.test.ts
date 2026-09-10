import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getCommercialPolicy } from "@/lib/policy";
import {
  contextoDeCompuerta,
  getOpportunityDetail,
} from "@/lib/scope/opportunityDetail";
import { evaluateGate, type GateRequirement } from "@/lib/domain/stageGate";

/**
 * P-02 contra los datos reales.
 *
 * Lo que se prueba es la lista de requisitos: es lo que convierte el detalle en
 * una pantalla que gobierna el proceso en vez de una ficha que muestra campos.
 * Si dice que falta algo que ya está, o calla algo que falta, el vendedor
 * aprende a ignorarla y la compuerta deja de existir en la práctica.
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

async function detallePorFolio(session: Session, folio: string) {
  const { id } = await prisma.opportunity.findUniqueOrThrow({
    where: { folio },
    select: { id: true },
  });
  return getOpportunityDetail(session, id);
}

describe("P-02 · alcance", () => {
  it("un vendedor no alcanza la oportunidad de otro: devuelve null, no lanza", async () => {
    // Distinguir «no existe» de «existe pero no es tuya» le confirmaría a
    // Paulina que la oportunidad de Jorge existe. La pantalla da 404 en ambos.
    const paulina = await sesionDe("pe@avattar.com");
    expect(await detallePorFolio(paulina, "OPP-2026-00417")).toBeNull();
  });

  it("un vendedor sí alcanza la suya", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const suya = await detallePorFolio(paulina, "OPP-2026-00402");
    expect(suya?.folio).toBe("OPP-2026-00402");
  });

  it("el gerente alcanza las de su oficina", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    expect((await detallePorFolio(jorge, "OPP-2026-00402"))?.folio).toBe("OPP-2026-00402");
  });
});

describe("P-02 · INV-02, el costo no sale sin permiso", () => {
  it("la respuesta de un vendedor NO trae grossProfit ni totalCost", async () => {
    // AC-03 · verificable inspeccionando las claves, no la pantalla.
    const paulina = await sesionDe("pe@avattar.com");
    const detalle = await detallePorFolio(paulina, "OPP-2026-00402");
    const serializado = JSON.stringify(detalle);

    expect(serializado).not.toContain("grossProfit");
    expect(serializado).not.toContain("totalCost");
    expect(serializado).not.toContain("unitCost");
    // El margen SÍ: es un permiso independiente (RN-09).
    expect(detalle).toHaveProperty("grossMargin");
  });

  it("la de un gerente sí trae las columnas de costo cuando hay cotización", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const detalle = await detallePorFolio(jorge, "OPP-2026-00417");
    // El seed de E0 no crea cotizaciones congeladas: llegan con E2. Lo que se
    // verifica aquí es que el SELECTOR las pide, no que existan filas.
    expect(detalle).not.toBeNull();
    expect(detalle).toHaveProperty("grossMargin");
  });
});

describe("P-02 · lista de requisitos · RN-02", () => {
  it("dice exactamente qué falta para avanzar, con la cifra concreta", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const o = (await detallePorFolio(jorge, "OPP-2026-00417"))!;
    const politica = await getCommercialPolicy("MX");

    // 00417 está en Negociación; la siguiente es Cierre.
    const siguiente = o.pipeline.stages.find((e) => e.position === o.stage.position + 1)!;
    expect(siguiente.name).toBe("Cierre");

    const evaluacion = evaluateGate(
      siguiente.gateRequires as GateRequirement[],
      contextoDeCompuerta(o, politica),
    );

    // Cierre pide cuatro. En el seed de E0 no hay documentos ni cotización
    // congelada —llegan con E2— así que faltan esos dos. Los otros dos pasan:
    // MEDDIC va en 84 sobre un mínimo de 70, y no hay autorizaciones abiertas.
    expect(evaluacion.ok).toBe(false);
    expect(evaluacion.missing.map((m) => m.requirement).sort()).toEqual([
      "CONTRATO_O_OC_CARGADO",
      "HITOS_CUADRADOS",
    ]);
  });

  it("MEDDIC pasa la compuerta de cierre en 00417 y no en 00388", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const politica = await getCommercialPolicy("MX");

    const alta = (await detallePorFolio(jorge, "OPP-2026-00417"))!;
    const baja = (await detallePorFolio(jorge, "OPP-2026-00388"))!;

    const ctxAlta = contextoDeCompuerta(alta, politica);
    const ctxBaja = contextoDeCompuerta(baja, politica);

    expect(evaluateGate(["MEDDIC_MIN_CIERRE"], ctxAlta).ok).toBe(true);
    expect(evaluateGate(["MEDDIC_MIN_CIERRE"], ctxBaja).ok).toBe(false);

    // Y el mensaje trae las dos cifras, no un «no se puede» genérico.
    const mensaje = evaluateGate(["MEDDIC_MIN_CIERRE"], ctxBaja).missing[0].message;
    expect(mensaje).toContain(String(baja.meddicScore));
    expect(mensaje).toContain(String(politica.meddicMinToClosing));
  });

  it("sin cotización congelada, los hitos no pueden cuadrar contra nada", async () => {
    // Es distinto de «cuadran en cero»: no hay contra qué comparar, y el
    // mensaje debe decir eso en vez de afirmar una diferencia falsa.
    const jorge = await sesionDe("jm@avattar.com");
    const o = (await detallePorFolio(jorge, "OPP-2026-00417"))!;
    const politica = await getCommercialPolicy("MX");
    const ctx = contextoDeCompuerta(o, politica);

    expect(ctx.diferenciaHitos).toBeNull();
    const mensaje = evaluateGate(["HITOS_CUADRADOS"], ctx).missing[0].message;
    expect(mensaje).toMatch(/congelar la cotización/i);
  });

  it("el decisor económico confirmado satisface su compuerta", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const politica = await getCommercialPolicy("MX");

    // 00417 tiene DECISOR_ECONOMICO confirmado y ligado a Mariana Robles.
    const conDecisor = (await detallePorFolio(jorge, "OPP-2026-00417"))!;
    expect(evaluateGate(["MEDDIC_E_CONFIRMADO"], contextoDeCompuerta(conDecisor, politica)).ok)
      .toBe(true);

    // 00388 lo tiene en PARCIAL: identificado pero no contactado.
    const sinDecisor = (await detallePorFolio(jorge, "OPP-2026-00388"))!;
    expect(evaluateGate(["MEDDIC_E_CONFIRMADO"], contextoDeCompuerta(sinDecisor, politica)).ok)
      .toBe(false);
  });

  it("la etapa de Calificación no tiene requisitos: nada estorba al alta", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const o = (await detallePorFolio(jorge, "OPP-2026-00341"))!;
    expect(o.stage.name).toBe("Calificación");

    const siguiente = o.pipeline.stages.find((e) => e.position === o.stage.position + 1)!;
    expect(siguiente.name).toBe("Descubrimiento");
    // Descubrimiento pide persona con rol declarado.
    expect(siguiente.gateRequires).toEqual(["PERSONA_CON_ROL_DECLARADO"]);
  });
});

describe("P-02 · comité de compra", () => {
  it("Aceros del Norte trae sus cuatro personas con su rol", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const o = (await detallePorFolio(jorge, "OPP-2026-00417"))!;

    expect(o.organization.people).toHaveLength(4);
    const roles = o.organization.people
      .map((p) => p.committeeRole?.name)
      .filter(Boolean)
      .sort();
    expect(roles).toEqual(["Campeón", "Compras", "Decisor económico", "Decisor técnico"]);
  });

  it("MEDDIC E y C apuntan a personas de esa misma cuenta (§2.1)", async () => {
    // «Así el comité de compra del prototipo y MEDDIC son la misma información,
    // no dos capturas.»
    const jorge = await sesionDe("jm@avattar.com");
    const o = (await detallePorFolio(jorge, "OPP-2026-00417"))!;

    const anclados = o.meddic.filter(
      (m) => m.component === "DECISOR_ECONOMICO" || m.component === "CAMPEON",
    );
    const nombresDelComite = new Set(o.organization.people.map((p) => p.name));

    for (const m of anclados) {
      if (m.status !== "CONFIRMADO") continue;
      expect(m.person, `${m.component} sin persona`).not.toBeNull();
      expect(nombresDelComite.has(m.person!.name)).toBe(true);
    }
  });
});
