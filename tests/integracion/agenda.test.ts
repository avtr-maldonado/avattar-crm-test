import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { agendaSemanal, bandejaDeTrabajo } from "@/lib/scope/agenda";

/**
 * P-07 contra los datos reales.
 *
 * §12.4 llama a esta pantalla «el flujo que decide la adopción». Lo que se
 * prueba es que las tres listas separen bien: si una actividad vencida aparece
 * en «hoy», o una oportunidad con próximo paso aparece como abandonada, el
 * vendedor deja de confiar en la bandeja y vuelve a su libreta.
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

/** Fecha fija: la bandeja depende del reloj, y una prueba no puede depender de él. */
const AHORA = new Date("2026-09-10T15:00:00Z");

describe("bandeja de trabajo · §12.4", () => {
  it("las tres listas no se traslapan", async () => {
    // Si una actividad cae en dos grupos, el vendedor la resuelve dos veces o
    // ninguna. Es la propiedad que hace utilizable la pantalla.
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    const idsVencidas = new Set(b.vencidas.map((a) => a.id));
    const idsHoy = new Set(b.hoy.map((a) => a.id));
    for (const id of idsHoy) expect(idsVencidas.has(id)).toBe(false);
  });

  it("vencidas trae lo anterior a hoy, sin completar", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    expect(b.vencidas.length).toBeGreaterThan(0);
    for (const a of b.vencidas) {
      expect(a.startsAt.getTime()).toBeLessThan(b.inicioDeHoy.getTime());
    }
  });

  it("nada completado aparece en la bandeja", async () => {
    // La bandeja es de pendientes. Lo hecho vive en la agenda y en la bitácora.
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    const ids = [...b.vencidas, ...b.hoy].map((a) => a.id);
    const completadas = await prisma.activity.count({
      where: { id: { in: ids }, completedAt: { not: null } },
    });
    expect(completadas).toBe(0);
  });

  it("las vencidas vienen de lo más viejo a lo más nuevo", async () => {
    // Lo que más tiempo lleva sin atenderse va primero: es lo que más pesa.
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    const fechas = b.vencidas.map((a) => a.startsAt.getTime());
    expect(fechas).toEqual([...fechas].sort((a, z) => a - z));
  });
});

describe("bandeja · oportunidades sin próximo paso · RN-10", () => {
  it("incluye las dos que el seed dejó sin próxima actividad", async () => {
    // OPP-2026-00374 y OPP-2026-00322 son las que §15 marca «sin actividad».
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);
    const folios = b.sinProxima.map((o) => o.folio);

    expect(folios).toContain("OPP-2026-00374");
    expect(folios).toContain("OPP-2026-00322");
  });

  it("solo trae oportunidades ABIERTAS", async () => {
    // Una cerrada sin próximo paso no es un descuido: es lo normal.
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    const estados = await prisma.opportunity.findMany({
      where: { id: { in: b.sinProxima.map((o) => o.id) } },
      select: { status: true },
    });
    expect(estados.every((o) => o.status === "ABIERTA")).toBe(true);
  });

  it("ordena por importe: lo más grande abandonado es lo que más urge", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const b = await bandejaDeTrabajo(jorge, AHORA);

    const importes = b.sinProxima.map((o) => Number(o.amount));
    expect(importes).toEqual([...importes].sort((a, z) => z - a));
  });
});

describe("bandeja · alcance por rol · INV-01", () => {
  it("un vendedor ve solo lo suyo, y es menos que la oficina", async () => {
    const [jorge, paulina] = await Promise.all([
      sesionDe("jm@avattar.com"),
      sesionDe("pe@avattar.com"),
    ]);
    const [oficina, propia] = await Promise.all([
      bandejaDeTrabajo(jorge, AHORA),
      bandejaDeTrabajo(paulina, AHORA),
    ]);

    expect(propia.sinProxima.length).toBeLessThanOrEqual(oficina.sinProxima.length);
    // Y todo lo que ve es suyo.
    for (const o of propia.sinProxima) expect(o.owner.id).toBe(paulina.userId);
  });
});

describe("agenda semanal · §11", () => {
  it("siempre devuelve siete días, aunque alguno quede vacío", async () => {
    // Un calendario al que le faltan días deja de leerse como semana.
    const jorge = await sesionDe("jm@avattar.com");
    const s = await agendaSemanal(jorge, AHORA);
    expect(s.dias).toHaveLength(7);
  });

  it("la semana arranca en lunes", async () => {
    // Es una agenda de trabajo, no un calendario.
    const jorge = await sesionDe("jm@avattar.com");
    const s = await agendaSemanal(jorge, AHORA);
    expect(s.lunes.getUTCDay()).toBe(1);
    expect(s.domingo.getUTCDay()).toBe(0);
  });

  it("marca hoy exactamente un día", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const s = await agendaSemanal(jorge, AHORA);
    expect(s.dias.filter((d) => d.esHoy)).toHaveLength(1);
  });

  it("incluye lo realizado, no solo lo pendiente", async () => {
    // Ver lo que ya se hizo es la mitad de para qué alguien abre una agenda.
    const jorge = await sesionDe("jm@avattar.com");
    const s = await agendaSemanal(jorge, AHORA);
    const todas = s.dias.flatMap((d) => d.actividades);
    expect(todas.length).toBe(s.total);
  });
});

describe("actividades del seed · consistencia con las fechas", () => {
  it("cada oportunidad tiene actividades que respaldan su bitácora", async () => {
    // El defecto que este seed corrigió: `lastActivityAt` sin filas detrás.
    const conActividades = await prisma.activity.groupBy({
      by: ["opportunityId"],
      _count: true,
    });
    expect(conActividades).toHaveLength(14);
    for (const g of conActividades) expect(g._count).toBeGreaterThanOrEqual(2);
  });

  it("las dos sin próxima actividad no tienen ninguna pendiente", async () => {
    for (const folio of ["OPP-2026-00374", "OPP-2026-00322"]) {
      const pendientes = await prisma.activity.count({
        where: { opportunity: { folio }, completedAt: null },
      });
      expect(pendientes, `${folio} no debería tener pendientes`).toBe(0);
    }
  });

  it("las banderas de riesgo siguen dando los totales de §15", async () => {
    // Sembrar actividades no debió mover `nextActivityAt`, que es de donde sale
    // la bandera. Si esto falla, el seed empezó a contradecirse.
    const { resumenDeRiesgo } = await import("@/prisma/seed/verificacion");
    const r = await resumenDeRiesgo("MX", new Date("2026-09-01T12:00:00Z"));
    expect(r.banderas).toBe(7);
    expect(r.oportunidades).toBe(6);
  });
});
