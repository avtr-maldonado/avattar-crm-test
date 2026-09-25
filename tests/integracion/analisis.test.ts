import { beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, type Session } from "@/lib/auth/permissions";
import { getCountry } from "@/lib/policy";
import { rangoDeAnioFiscal, trimestreDe } from "@/lib/filters/dates";
import { abiertasDelAnalisis, actividadesHechasDelAnio, ganadas } from "@/lib/scope/analisis";

/**
 * Lectores de P-09 · Análisis · INV-01, INV-02, AC-25 · decisiones §28.
 *
 * Solo lectura sobre la base real: no siembra ni escribe, así que no depende
 * del escenario §15. Lo que comprueba es forma, no cifras: que el costo no
 * viaje sin `VER_COSTO`, que la evidencia MEDDIC no se serialice, y que un
 * país fuera del alcance devuelva nada en vez de ampliarlo.
 */

async function sesionPorRol(role: Role): Promise<Session> {
  const u = await prisma.user.findFirstOrThrow({
    where: { role, active: true, deletedAt: null },
    select: { id: true, email: true, name: true, role: true, countryCodes: true },
    orderBy: { email: "asc" },
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

const SIN_RECORTE = { pais: null, vendedor: null, producto: null, tipo: null };

let direccion: Session;
let vendedor: Session;

beforeAll(async () => {
  [direccion, vendedor] = await Promise.all([sesionPorRol("DIRECCION"), sesionPorRol("VENDEDOR")]);
});

describe("ganadas · la cotización viaja con costo solo con VER_COSTO (INV-02)", () => {
  it("con el permiso trae costo y utilidad; sin él, ni la llave existe", async () => {
    for (const s of [direccion, vendedor]) {
      const verCosto = can(s, "VER_COSTO");
      const ventas = await ganadas(s, SIN_RECORTE, null);
      for (const v of ventas) {
        expect(v.actualCloseDate).toBeInstanceOf(Date);
        if (!v.cotizacion) continue;
        expect("totalCost" in v.cotizacion).toBe(verCosto);
        expect("grossProfit" in v.cotizacion).toBe(verCosto);
        for (const l of v.cotizacion.lineas) expect("costo" in l).toBe(verCosto);
      }
    }
  });

  it("con año, todas caen en el año fiscal por cierre real (§10.2)", async () => {
    const pais = direccion.countryCodes[0]!;
    const { fiscalYearStartMonth } = await getCountry(pais);
    const { fiscalYear } = trimestreDe(new Date(), fiscalYearStartMonth);
    const rango = rangoDeAnioFiscal(fiscalYear, fiscalYearStartMonth);
    const ventas = await ganadas(direccion, SIN_RECORTE, { fiscalYear, fiscalYearStartMonth });
    for (const v of ventas) {
      expect(v.actualCloseDate >= rango.from && v.actualCloseDate <= rango.to).toBe(true);
    }
  });

  it("un país fuera del alcance no amplía nada: devuelve vacío (AC-25)", async () => {
    const fuera = (["MX", "CO", "CL"] as const).find((c) => !vendedor.countryCodes.includes(c));
    if (!fuera) return; // un vendedor con los tres países no tiene «fuera»
    expect(await ganadas(vendedor, { ...SIN_RECORTE, pais: fuera }, null)).toEqual([]);
    expect(await abiertasDelAnalisis(vendedor, { ...SIN_RECORTE, pais: fuera })).toEqual([]);
  });

  it("el vendedor solo ve lo suyo (RN-31)", async () => {
    const ventas = await ganadas(vendedor, SIN_RECORTE, null);
    for (const v of ventas) expect(v.owner.id).toBe(vendedor.userId);
  });
});

describe("abiertasDelAnalisis · etapa como datos y MEDDIC sin evidencia", () => {
  it("todas abiertas, con etapa y calificaciones que solo dicen si hay evidencia", async () => {
    const abiertas = await abiertasDelAnalisis(direccion, SIN_RECORTE);
    for (const o of abiertas) {
      expect(typeof o.stage.name).toBe("string");
      expect(typeof o.stage.staleAfterDays).toBe("number");
      for (const m of o.meddic ?? []) {
        expect(typeof m.conEvidencia).toBe("boolean");
        expect("evidence" in m).toBe(false);
      }
    }
  });
});

describe("actividadesHechasDelAnio · solo lo hecho, dentro del año", () => {
  it("cada actividad trae fecha de realización dentro del rango", async () => {
    const pais = direccion.countryCodes[0]!;
    const { fiscalYearStartMonth } = await getCountry(pais);
    const { fiscalYear } = trimestreDe(new Date(), fiscalYearStartMonth);
    const rango = rangoDeAnioFiscal(fiscalYear, fiscalYearStartMonth);
    const hechas = await actividadesHechasDelAnio(direccion, { pais: null, vendedor: null }, { fiscalYear, fiscalYearStartMonth });
    for (const a of hechas) {
      expect(a.completedAt >= rango.from && a.completedAt <= rango.to).toBe(true);
      expect(typeof a.tipo).toBe("string");
    }
  });
});
