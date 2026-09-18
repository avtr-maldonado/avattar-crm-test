import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/permissions";
import { buscarGlobal } from "@/lib/scope/busqueda";
import { contadoresDeNavegacion } from "@/lib/scope/contadores";
import { agendaSemanal, bandejaDeTrabajo } from "@/lib/scope/agenda";

/**
 * Buscador global y oficina activa.
 *
 * - El buscador respeta el alcance del rol (INV-01): lo que un vendedor no
 *   puede ver en el pipeline tampoco lo encuentra buscándolo.
 * - Los contadores del menú se acotan a la oficina activa: quien opera en
 *   varios países ve, en cada momento, solo los pendientes del país elegido.
 *
 * Dependen de los usuarios del seed y de que exista al menos una oportunidad
 * abierta en México; no del escenario completo de §15.
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

describe("buscarGlobal · busca dentro del alcance", () => {
  it("dirección encuentra una oportunidad abierta por parte de su nombre, con su cuenta", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const alguna = await prisma.opportunity.findFirstOrThrow({
      where: { deletedAt: null, status: "ABIERTA" },
      select: { id: true, name: true, folio: true, organization: { select: { name: true } } },
    });
    const termino = alguna.name.split(/\s+/)[0]!;

    const r = await buscarGlobal(direccion, termino);
    const encontrada = r.oportunidades.find((o) => o.id === alguna.id);
    expect(encontrada).toBeDefined();
    expect(encontrada?.folio).toBe(alguna.folio);
    expect(encontrada?.organizacion).toBe(alguna.organization.name);
  });

  it("también encuentra por folio y por cuenta", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const alguna = await prisma.opportunity.findFirstOrThrow({
      where: { deletedAt: null },
      select: { id: true, folio: true, organization: { select: { id: true, name: true } } },
    });

    const porFolio = await buscarGlobal(direccion, alguna.folio.slice(-5));
    expect(porFolio.oportunidades.some((o) => o.id === alguna.id)).toBe(true);

    const porCuenta = await buscarGlobal(direccion, alguna.organization.name.slice(0, 6));
    expect(porCuenta.cuentas.some((c) => c.id === alguna.organization.id)).toBe(true);
  });

  it("un vendedor no encuentra lo que no alcanza", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const ajena = await prisma.opportunity.findFirst({
      where: { deletedAt: null, ownerId: { not: paulina.userId } },
      select: { id: true, name: true },
    });
    // Si no hay ninguna ajena, no hay nada que probar aquí.
    if (!ajena) return;

    const r = await buscarGlobal(paulina, ajena.name);
    expect(r.oportunidades.some((o) => o.id === ajena.id)).toBe(false);
  });

  it("con menos de dos caracteres no busca", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const r = await buscarGlobal(direccion, "a");
    expect(r.oportunidades).toHaveLength(0);
    expect(r.cuentas).toHaveLength(0);
    expect(r.personas).toHaveLength(0);
  });
});

describe("contadoresDeNavegacion · se acotan a la oficina activa", () => {
  it("para dirección, el conteo de México es el de México y el de otro país sin datos es cero", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const abiertasMX = await prisma.opportunity.count({
      where: { deletedAt: null, status: "ABIERTA", countryCode: "MX" },
    });
    const abiertasCL = await prisma.opportunity.count({
      where: { deletedAt: null, status: "ABIERTA", countryCode: "CL" },
    });

    const mx = await contadoresDeNavegacion(direccion, "MX");
    const cl = await contadoresDeNavegacion(direccion, "CL");
    expect(mx.oportunidades).toBe(abiertasMX);
    expect(cl.oportunidades).toBe(abiertasCL);
  });

  it("la oficina nunca amplía el alcance: un vendedor de México con oficina Colombia cuenta cero", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const co = await contadoresDeNavegacion(paulina, "CO");
    expect(co.oportunidades).toBe(0);
  });
});

describe("bandejaDeTrabajo y agendaSemanal · se acotan a la oficina activa", () => {
  it("las oportunidades sin próximo paso se reparten entre las tres oficinas sin repetirse", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const ahora = new Date();
    const [todas, mx, co, cl] = await Promise.all([
      bandejaDeTrabajo(direccion, ahora),
      bandejaDeTrabajo(direccion, ahora, "MX"),
      bandejaDeTrabajo(direccion, ahora, "CO"),
      bandejaDeTrabajo(direccion, ahora, "CL"),
    ]);
    expect(todas.sinProxima.length).toBeGreaterThan(0);
    expect(mx.sinProxima.length + co.sinProxima.length + cl.sinProxima.length).toBe(
      todas.sinProxima.length,
    );
    for (const o of mx.sinProxima) {
      const pais = await prisma.opportunity.findUniqueOrThrow({
        where: { id: o.id },
        select: { countryCode: true },
      });
      expect(pais.countryCode).toBe("MX");
    }
  });

  it("la agenda semanal de una oficina cuenta lo mismo que la base para esa oficina", async () => {
    const direccion = await sesionDe("dc@avattar.com");
    const ahora = new Date();
    const semana = await agendaSemanal(direccion, ahora, "CL");
    const enPantalla = semana.dias.reduce((n, d) => n + d.actividades.length, 0);

    const diaDeLaSemana = (ahora.getUTCDay() + 6) % 7;
    const lunes = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - diaDeLaSemana),
    );
    const domingo = new Date(lunes.getTime() + 7 * 86_400_000 - 1);
    const enBase = await prisma.activity.count({
      where: {
        deletedAt: null,
        startsAt: { gte: lunes, lte: domingo },
        // La oficina es de la oportunidad. Una actividad sin oportunidad —de
        // una cuenta, o suelta— cuenta en todas, porque las cuentas no son de
        // un país (§18).
        OR: [{ opportunity: { countryCode: "CL" } }, { opportunity: null }],
      },
    });
    expect(enPantalla).toBe(enBase);
  });
});
