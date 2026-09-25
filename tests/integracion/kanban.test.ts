import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/permissions";
import type { CountryCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OPORTUNIDADES } from "@/prisma/seed/datos";
import { listOpportunities } from "@/lib/scope";
import { listPipelines, pipelinePorOmision } from "@/lib/scope/pipelines";
import { getCommercialPolicy } from "@/lib/policy";
import { formatUSD, sum, toClient } from "@/lib/money";
import { openTotal, weightedAmount } from "@/lib/domain/pipeline";
import { computeRiskFlags } from "@/lib/domain/riskFlags";

/**
 * El tablero contra el prototipo aprobado.
 *
 * Verifica la agregación por columna con los datos reales del seed, que es lo
 * que decide si la pantalla muestra lo mismo que Dirección autorizó. No prueba
 * píxeles: prueba las cifras, que son las que alguien va a leer en un comité.
 *
 * Vive en `tests/integracion` y no junto al componente porque necesita el
 * cliente de Prisma, y la prueba de arquitectura de AC-32 —con razón— no
 * admite eso dentro de `components/`. Mantener esa regla sin excepciones vale
 * más que la comodidad de tener la prueba al lado del archivo.
 */
const AHORA = new Date("2026-09-01T12:00:00Z");

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

/** Arma las columnas igual que la pantalla, para probar esa lógica. */
/**
 * Estas cifras se miden **sobre el escenario sembrado**, no sobre toda la base.
 *
 * La igualdad exacta con §15 valía mientras la aplicación era de solo lectura.
 * Dejó de valer el día que se puede dar de alta una oportunidad: contar todo lo
 * que hay en México convertiría esta prueba en «nadie ha usado el sistema», que
 * no es lo que promete. Promete que el seed reprodujo el escenario que Dirección
 * aprobó, y eso sigue siendo cierto aunque encima haya trabajo real.
 */
const FOLIOS_SEMBRADOS = new Set(OPORTUNIDADES.map((o) => o.folio));

async function columnasDe(session: Session, paisActivo: CountryCode = "MX") {
  const [pipelines, todas] = await Promise.all([
    listPipelines(session),
    listOpportunities(session),
  ]);
  const pipeline = pipelinePorOmision(pipelines, session, paisActivo)!;
  // Pasa por `lib/scope` como la pantalla real, y después se queda con el
  // escenario de §15 para poder compararlo contra la maqueta aprobada.
  const oportunidades = todas.filter((o) => FOLIOS_SEMBRADOS.has(o.folio));

  return pipeline.stages.map((etapa) => {
    const deLaEtapa = oportunidades.filter((o) => o.stage.id === etapa.id);
    return {
      nombre: etapa.name,
      cantidad: deLaEtapa.length,
      total: openTotal(deLaEtapa),
      ponderado: sum(deLaEtapa.map((o) => weightedAmount(o.amount, etapa.probability))),
    };
  });
}

describe("tablero kanban · cifras del prototipo aprobado", () => {
  it("cada columna cuadra con la maqueta, etapa por etapa", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const columnas = await columnasDe(jorge);

    // Las cifras que muestra la maqueta aprobada, columna por columna.
    const esperado = [
      { nombre: "Calificación", cantidad: 3, total: "1061000", ponderado: "106100" },
      { nombre: "Descubrimiento", cantidad: 3, total: "1975000", ponderado: "493750" },
      { nombre: "Propuesta", cantidad: 3, total: "3112000", ponderado: "1556000" },
      { nombre: "Negociación", cantidad: 3, total: "4128000", ponderado: "3096000" },
      { nombre: "Cierre", cantidad: 2, total: "2345000", ponderado: "2110500" },
    ];

    expect(columnas.map((c) => c.nombre)).toEqual(esperado.map((e) => e.nombre));

    for (const [i, e] of esperado.entries()) {
      expect(columnas[i].cantidad, `${e.nombre}: cantidad`).toBe(e.cantidad);
      expect(toClient(columnas[i].total), `${e.nombre}: total`).toBe(e.total);
      expect(toClient(columnas[i].ponderado), `${e.nombre}: ponderado`).toBe(e.ponderado);
    }
  });

  it("la suma de las columnas reproduce los totales de §15", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const columnas = await columnasDe(jorge);

    expect(toClient(sum(columnas.map((c) => c.total)))).toBe("12621000");
    expect(toClient(sum(columnas.map((c) => c.ponderado)))).toBe("7362350");
  });

  it("todas las etapas aparecen, incluso las que quedaran vacías", async () => {
    // Una columna que desaparece rompe el mapa mental del proceso.
    const jorge = await sesionDe("jm@avattar.com");
    expect(await columnasDe(jorge)).toHaveLength(5);
  });
});

describe("tablero kanban · alcance por rol · AC-01", () => {
  it("un vendedor ve solo sus columnas cargadas, no las del equipo", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    const columnas = await columnasDe(paulina);

    // Paulina tiene 00402 (Propuesta), 00337 (Calificación) y 00304 (Propuesta).
    const total = sum(columnas.map((c) => c.total));
    expect(toClient(total)).toBe("2883000");

    // Sigue viendo las cinco etapas: el proceso es el mismo, su conjunto no.
    expect(columnas).toHaveLength(5);
    expect(columnas.reduce((n, c) => n + c.cantidad, 0)).toBe(3);
  });

  it("los indicadores de un vendedor NO son los de la oficina (§2.3)", async () => {
    const [jorge, paulina] = await Promise.all([
      sesionDe("jm@avattar.com"),
      sesionDe("pe@avattar.com"),
    ]);
    const [deJorge, dePaulina] = await Promise.all([
      columnasDe(jorge),
      columnasDe(paulina),
    ]);

    const totalJorge = toClient(sum(deJorge.map((c) => c.total)));
    const totalPaulina = toClient(sum(dePaulina.map((c) => c.total)));

    expect(totalJorge).toBe("12621000");
    expect(totalPaulina).not.toBe(totalJorge);
    // Y no puede deducir el de la oficina por agregación: nunca lo recibe.
    expect(Number(totalPaulina)).toBeLessThan(Number(totalJorge));
  });
});

describe("tablero kanban · señales visuales", () => {
  it("el margen bajo el piso se marca en las tres que corresponden", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const [oportunidades, politica] = await Promise.all([
      listOpportunities(jorge),
      getCommercialPolicy("MX"),
    ]);

    const bajoElPiso = oportunidades
      .filter((o) => o.grossMargin?.lt(politica.marginFloor))
      .map((o) => o.folio)
      .sort();

    expect(bajoElPiso).toEqual([
      "OPP-2026-00304",
      "OPP-2026-00341",
      "OPP-2026-00388",
    ]);
  });

  it("las banderas de la tarjeta salen del cálculo, no de un campo (INV-11)", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const oportunidades = await listOpportunities(jorge);

    const conBandera = oportunidades
      // Sobre el escenario de §15: las altas reales también levantan banderas
      // —una oportunidad nueva sin próxima actividad la levanta, y debe—, pero
      // la cifra que este criterio compara es la del prototipo aprobado.
      .filter((o) => FOLIOS_SEMBRADOS.has(o.folio))
      .map((o) => ({ folio: o.folio, banderas: computeRiskFlags(o, o.stage, AHORA) }))
      .filter((o) => o.banderas.length > 0);

    expect(conBandera).toHaveLength(6);
    expect(conBandera.reduce((n, o) => n + o.banderas.length, 0)).toBe(7);
  });

  it("los importes se formatean con símbolo, miles y tabular-nums", async () => {
    const jorge = await sesionDe("jm@avattar.com");
    const columnas = await columnasDe(jorge);
    expect(formatUSD(columnas[4].total)).toBe("$2,345,000.00");
  });
});

describe("el tablero de quien lleva varios países · regresión", () => {
  /**
   * El defecto que esto cubre: `listPipelines` ordena por nombre y entre los de
   * venta «Ventas Chile» va antes que «Ventas México». Dirección y
   * Administración llevan los tres países, así que el tablero abría en Chile
   * —cero oportunidades— con la base llena de trabajo mexicano.
   *
   * Las pruebas de arriba no lo vieron porque todas usan a Jorge, que solo
   * tiene MX. Por eso esta prueba existe y usa a los que sí llevan varios.
   */
  for (const correo of ["dc@avattar.com", "as@avattar.com"]) {
    it(`${correo} ve oportunidades en su tablero, no columnas vacías`, async () => {
      const sesion = await sesionDe(correo);
      expect(sesion.countryCodes.length).toBeGreaterThan(1);

      const columnas = await columnasDe(sesion);
      const total = columnas.reduce((n, c) => n + c.cantidad, 0);

      expect(total, "el tablero salió vacío con la base llena").toBeGreaterThan(0);
      expect(toClient(sum(columnas.map((c) => c.total)))).toBe("12621000");
    });
  }

  it("cambiar de país cambia el tablero", async () => {
    // Colombia y Chile llegan con E5: sus pipelines existen y están vacíos.
    // Que el tablero los muestre vacíos ahí es correcto; lo que no lo era es
    // mostrarlos cuando el usuario está viendo México.
    const direccion = await sesionDe("dc@avattar.com");

    const mexico = await columnasDe(direccion, "MX");
    const colombia = await columnasDe(direccion, "CO");

    expect(mexico.reduce((n, c) => n + c.cantidad, 0)).toBeGreaterThan(0);
    expect(colombia.reduce((n, c) => n + c.cantidad, 0)).toBe(0);
  });
});
