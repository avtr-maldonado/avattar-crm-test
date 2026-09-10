import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { activityScope } from "./activities";
import { objectiveScope } from "./objectives";
import { opportunityScope } from "./opportunities";
import { organizationScope } from "./organizations";
import { quoteLineSelect, quoteSelect } from "./selectors";

function sesion(p: Partial<Session> & Pick<Session, "role" | "userId">): Session {
  return {
    email: "x@avattar.com",
    name: "X",
    countryCodes: ["MX"],
    permissions: new Set(),
    limits: {},
    ...p,
  };
}

const vendedor = sesion({ role: "VENDEDOR", userId: "u-paulina" });
const gerenteMx = sesion({ role: "GERENTE_PAIS", userId: "u-jorge" });
const gerenteDosPaises = sesion({
  role: "GERENTE_PAIS",
  userId: "u-multi",
  countryCodes: ["CO", "CL"],
});
const direccion = sesion({
  role: "DIRECCION",
  userId: "u-dir",
  countryCodes: ["MX", "CO", "CL"],
});
const administrador = sesion({ role: "ADMINISTRADOR", userId: "u-admin" });
const preventa = sesion({ role: "PREVENTA", userId: "u-ivan" });

describe("opportunityScope · INV-01, AC-01, AC-05", () => {
  it("el vendedor ve donde es PROPIETARIO, no donde es creador (RN-31)", () => {
    const s = opportunityScope(vendedor);
    expect(s).toEqual({ deletedAt: null, ownerId: "u-paulina" });
    // La confusión que RN-31 existe para evitar: si colara createdById, un
    // gerente que da de alta y asigna dejaría al vendedor nuevo sin acceso.
    expect(JSON.stringify(s)).not.toContain("createdById");
  });

  it("el gerente ve su oficina, y solo la suya (AC-05)", () => {
    expect(opportunityScope(gerenteMx)).toEqual({
      deletedAt: null,
      countryCode: { in: ["MX"] },
    });
    expect(opportunityScope(gerenteDosPaises)).toEqual({
      deletedAt: null,
      countryCode: { in: ["CO", "CL"] },
    });
  });

  it("dirección y administración ven todo, pero nunca lo borrado (INV-15)", () => {
    expect(opportunityScope(direccion)).toEqual({ deletedAt: null });
    expect(opportunityScope(administrador)).toEqual({ deletedAt: null });
  });

  it("preventa ve donde está asignado como apoyo (Q-03)", () => {
    expect(opportunityScope(preventa)).toEqual({
      deletedAt: null,
      supportUsers: { some: { userId: "u-ivan" } },
    });
  });

  it("todos los roles excluyen lo borrado (INV-15)", () => {
    for (const s of [vendedor, gerenteMx, direccion, administrador, preventa]) {
      expect(opportunityScope(s)).toMatchObject({ deletedAt: null });
    }
  });
});

describe("organizationScope · §5.3", () => {
  it("el vendedor ve la cuenta si es suya O si tiene una oportunidad propia ahí", () => {
    // Si fuera solo por propietario, un vendedor con una oportunidad en una
    // cuenta ajena no podría abrir la ficha de esa cuenta.
    expect(organizationScope(vendedor)).toEqual({
      deletedAt: null,
      OR: [
        { ownerId: "u-paulina" },
        { opportunities: { some: { ownerId: "u-paulina", deletedAt: null } } },
      ],
    });
  });

  it("el gerente ve las cuentas de su oficina", () => {
    expect(organizationScope(gerenteMx)).toEqual({
      deletedAt: null,
      countryCode: { in: ["MX"] },
    });
  });
});

describe("activityScope · §5.3", () => {
  it("el vendedor ve las propias más las ligadas a lo que puede ver", () => {
    const s = activityScope(vendedor);
    expect(s).toEqual({
      deletedAt: null,
      OR: [
        { userId: "u-paulina" },
        { opportunity: { ownerId: "u-paulina", deletedAt: null } },
        { organization: { ownerId: "u-paulina", deletedAt: null } },
      ],
    });
  });
});

describe("objectiveScope · §2.3", () => {
  it("el vendedor solo lee su propio renglón (AC-29)", () => {
    expect(objectiveScope(vendedor)).toEqual({ userId: "u-paulina" });
  });

  it("el gerente lee los de su oficina", () => {
    expect(objectiveScope(gerenteMx)).toEqual({ countryCode: { in: ["MX"] } });
  });

  it("dirección lee todos", () => {
    expect(objectiveScope(direccion)).toEqual({});
  });
});

describe("selectores de costo · INV-02, AC-03", () => {
  const conCosto = sesion({
    role: "GERENTE_PAIS",
    userId: "u-jorge",
    permissions: new Set(["VER_COSTO", "VER_MARGEN"]),
  });
  const sinCosto = sesion({
    role: "VENDEDOR",
    userId: "u-paulina",
    permissions: new Set(["VER_MARGEN"]),
  });

  it("la línea no incluye unitCost sin el permiso", () => {
    expect(quoteLineSelect(conCosto)).toHaveProperty("unitCost", true);
    // No basta que sea false: la clave NO debe existir, porque `select` con
    // false y sin clave producen el mismo JSON, pero la ausencia es lo que se
    // puede afirmar inspeccionando el resultado.
    expect(Object.keys(quoteLineSelect(sinCosto))).not.toContain("unitCost");
  });

  it("la cotización no incluye totalCost ni grossProfit sin el permiso", () => {
    const claves = Object.keys(quoteSelect(sinCosto));
    for (const prohibida of ["totalCost", "grossProfit"]) {
      expect(claves, `${prohibida} no debe salir del servidor`).not.toContain(prohibida);
    }
    // El margen SÍ sale: ver margen y ver costo son permisos independientes
    // (RN-09). El vendedor conoce su margen sin conocer el costo del proveedor.
    expect(claves).toContain("grossMargin");
  });

  it("sin VER_MARGEN tampoco sale el margen (RN-09, la otra mitad)", () => {
    const sinNada = sesion({ role: "VENDEDOR", userId: "u-x", permissions: new Set() });
    expect(Object.keys(quoteSelect(sinNada))).not.toContain("grossMargin");
  });

  it("con permiso salen las tres columnas de costo", () => {
    const claves = Object.keys(quoteSelect(conCosto));
    for (const c of ["totalCost", "grossProfit", "grossMargin"]) {
      expect(claves).toContain(c);
    }
  });

  it("ningún selector usa la forma peligrosa de traer todo", () => {
    // `select: undefined` trae todas las columnas, costo incluido. Un selector
    // vacío sería peor que no tener selector.
    for (const s of [quoteSelect(sinCosto), quoteLineSelect(sinCosto)]) {
      expect(Object.keys(s).length).toBeGreaterThan(0);
    }
  });
});
