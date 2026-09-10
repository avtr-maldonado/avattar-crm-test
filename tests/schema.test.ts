import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * El esquema como contrato ejecutable.
 *
 * Estas pruebas leen `schema.prisma` como texto a propósito: buscan errores que
 * `prisma validate` no puede detectar porque son de negocio, no de sintaxis.
 * Un `Float` donde debía ir `Decimal` compila perfecto y produce importes mal
 * redondeados seis meses después.
 */
const schema = readFileSync("prisma/schema.prisma", "utf8");

/** Devuelve el cuerpo de un bloque `model X { … }`. */
function modelo(nombre: string): string {
  const inicio = schema.indexOf(`model ${nombre} {`);
  expect(inicio, `no existe el modelo ${nombre}`).toBeGreaterThan(-1);
  return schema.slice(inicio).split("\n}")[0];
}

/** Devuelve los valores de un bloque `enum X { … }`. */
function valoresDeEnum(nombre: string): string[] {
  const inicio = schema.indexOf(`enum ${nombre} {`);
  expect(inicio, `no existe el enum ${nombre}`).toBeGreaterThan(-1);
  return schema
    .slice(inicio)
    .split("\n}")[0]
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("/"));
}

describe("schema.prisma · decisiones de negocio", () => {
  it("no reintroduce multimoneda (D-A)", () => {
    expect(schema).not.toMatch(/model ExchangeRate/);
    expect(schema).not.toMatch(/frozenExchangeRate/);
    expect(valoresDeEnum("Currency")).toEqual(["USD"]);
  });

  it("la lista de precio es única y global, sin dimensión de país (D-A)", () => {
    const lista = modelo("PriceListEntry");
    expect(lista).not.toMatch(/countryCode/);
    expect(lista).toMatch(/@@unique\(\[productId, validFrom\]\)/);
  });

  it("conserva cinco roles, no siete (Q-12)", () => {
    expect(valoresDeEnum("Role")).toEqual([
      "VENDEDOR",
      "GERENTE_PAIS",
      "DIRECCION",
      "ADMINISTRADOR",
      "PREVENTA",
    ]);
  });

  it("no captura consentimiento de datos personales (Q-11)", () => {
    const persona = modelo("Person");
    expect(persona).not.toMatch(/consent/i);
    // El derecho de supresión lo cubre el borrado lógico, no un campo aparte.
    expect(persona).toMatch(/deletedAt/);
  });

  it("tres estados de oportunidad, sin cancelada (RN-12)", () => {
    expect(valoresDeEnum("OpportunityStatus")).toEqual(["ABIERTA", "GANADA", "PERDIDA"]);
  });

  it("deja fuera Prospectos y copropietarios, que el esquema anterior traía", () => {
    expect(schema).not.toMatch(/model Lead\b|model Prospect/);
    expect(schema).not.toMatch(/model OpportunityCoOwner|copropietario/i);
  });
});

describe("schema.prisma · invariantes", () => {
  it("INV-03 · todo importe es Decimal(18,4), nunca Float", () => {
    // Nombrados uno por uno en vez de contarlos: un umbral numérico pasa por
    // razones equivocadas y se rompe al agregar cualquier campo.
    const importes: Record<string, string[]> = {
      Opportunity: ["estimatedAmount", "amount"],
      PriceListEntry: ["listPrice", "minPrice", "standardCost"],
      Quote: ["grossSubtotal", "netSubtotal", "taxAmount", "total", "totalCost", "grossProfit"],
      QuoteLine: ["quantity", "unitPrice", "unitCost"],
      Milestone: ["amount"],
      Objective: ["revenueQuota", "grossProfitQuota"],
    };

    for (const [nombreModelo, campos] of Object.entries(importes)) {
      const cuerpo = modelo(nombreModelo);
      for (const campo of campos) {
        const linea = cuerpo.split("\n").find((l) => l.trim().startsWith(`${campo} `));
        expect(linea, `${nombreModelo}.${campo} no existe`).toBeDefined();
        expect(linea, `${nombreModelo}.${campo} debe ser Decimal(18,4)`).toMatch(
          /Decimal\(18,\s*4\)/,
        );
      }
    }

    // Un Float en cualquier parte del esquema es un defecto: pierde centavos.
    expect(schema).not.toMatch(/\bFloat\b/);
  });

  it("INV-03 · los porcentajes son fracción, con escala suficiente", () => {
    // 7,4 permite 0.1500; un Decimal(5,2) obligaría a guardar 15.00.
    for (const campo of ["marginFloor", "discountThresholdMgmt", "grossMargin", "discountRate"]) {
      const linea = schema.split("\n").find((l) => l.trim().startsWith(campo));
      expect(linea, `no se encontró el campo ${campo}`).toBeDefined();
      expect(linea, `${campo} debe ser Decimal(7,4)`).toMatch(/Decimal\(7,\s*4\)/);
    }
  });

  it("INV-13 · las etapas son tabla, no enum", () => {
    expect(schema).not.toMatch(/enum Stage\b/);
    expect(schema).toMatch(/model Stage \{/);
    expect(modelo("Stage")).toMatch(/probability\s+Decimal/);
  });

  it("INV-12 · el folio es único y tiene contador por año (RN-20)", () => {
    expect(modelo("Opportunity")).toMatch(/folio\s+String\s+@unique/);
    const contador = modelo("FolioCounter");
    expect(contador).toMatch(/year\s+Int\s+@id/);
    expect(contador).toMatch(/lastNumber/);
  });

  it("INV-15 · las entidades de negocio llevan borrado lógico", () => {
    for (const entidad of ["User", "Organization", "Person", "Opportunity", "Activity"]) {
      expect(modelo(entidad), `${entidad} sin deletedAt`).toMatch(/deletedAt\s+DateTime\?/);
    }
  });

  it("INV-02 · las columnas de costo existen y están marcadas como sensibles", () => {
    expect(modelo("QuoteLine")).toMatch(/unitCost/);
    const cotizacion = modelo("Quote");
    for (const campo of ["totalCost", "grossProfit"]) {
      expect(cotizacion).toMatch(new RegExp(campo));
    }
    // El comentario que recuerda por qué no se serializan sin permiso.
    expect(schema).toMatch(/INV-02/);
  });

  it("§2.3 · la oportunidad tiene ownerId Y createdById, distintos", () => {
    const oportunidad = modelo("Opportunity");
    expect(oportunidad).toMatch(/ownerId\s+String/);
    expect(oportunidad).toMatch(/createdById\s+String/);
    // La visibilidad cuelga de ownerId; el índice lo confirma.
    expect(oportunidad).toMatch(/@@index\(\[ownerId, status\]\)/);
  });

  it("§2.1 · MEDDIC se ancla a personas reales, no a texto libre", () => {
    const evaluacion = modelo("MeddicComponentAssessment");
    expect(evaluacion).toMatch(/personId\s+String\?/);
    expect(evaluacion).toMatch(/person\s+Person\?/);
    expect(evaluacion).toMatch(/@@unique\(\[opportunityId, component\]\)/);
  });

  it("§6.3 · los hitos guardan monto, nunca porcentaje", () => {
    const hito = modelo("Milestone");
    expect(hito).toMatch(/amount\s+Decimal/);
    expect(hito).not.toMatch(/percent|porcentaje/i);
  });

  it("INV-05 · los umbrales viven en CommercialPolicy, uno por país", () => {
    const politica = modelo("CommercialPolicy");
    for (const umbral of [
      "marginFloor",
      "lineMarginFloor",
      "discountThresholdMgmt",
      "discountThresholdDir",
      "approvalSlaHours",
      "meddicMinToClosing",
      "meddicMinToWin",
      "meddicMinToCommit",
      "healthyCoverageMin",
    ]) {
      expect(politica, `falta ${umbral} en CommercialPolicy`).toMatch(new RegExp(umbral));
    }
    expect(politica).toMatch(/countryCode\s+CountryCode\s+@unique/);
  });
});

describe("schema.prisma · cobertura del modelo", () => {
  it("están los 32 modelos que el spec §6.2 exige", () => {
    const encontrados = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
    expect(encontrados).toHaveLength(32);
    // Los que el esquema anterior no tenía y el spec sí pide.
    for (const nuevo of [
      "StageTransition",
      "MeddicWeight",
      "SavedView",
      "Permission",
      "RolePermission",
      "FolioCounter",
    ]) {
      expect(encontrados, `falta ${nuevo}`).toContain(nuevo);
    }
  });

  it("todos los identificadores están en inglés (§4.1)", () => {
    const enEspanol =
      /^model (Oportunidad|Organizacion|Persona|Cotizacion|Hito|Actividad|Objetivo|Producto)/m;
    expect(schema).not.toMatch(enEspanol);
  });
});
