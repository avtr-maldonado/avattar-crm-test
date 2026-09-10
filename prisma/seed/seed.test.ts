import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toClient } from "@/lib/money";
import { computeMeddicScore, PESOS_POR_OMISION } from "@/lib/domain/meddic";
import { OPORTUNIDADES, ORGANIZACIONES, USUARIOS } from "./datos";
import {
  coberturaEquipo,
  coberturaPorVendedor,
  resumenDePipeline,
  resumenDeRiesgo,
} from "./verificacion";

/**
 * El seed contra §15.
 *
 * Estas pruebas son la razón por la que el seed existe en esta forma: si
 * alguien cambia un importe o una probabilidad, el escenario deja de ser
 * comparable con lo que Dirección aprobó, y esto falla en vez de mentir.
 */
const AHORA = new Date("2026-09-01T12:00:00Z");

describe("seed §15 · totales del prototipo", () => {
  it("reproduce el valor abierto y el ponderado, exactos", async () => {
    const r = await resumenDePipeline("MX");
    expect(r.cantidad).toBe(14);
    expect(toClient(r.valorAbierto)).toBe("12621000");
    expect(toClient(r.ponderado)).toBe("7362350");
  });

  it("las banderas calculadas dan 7 sobre 6 oportunidades, no las 5 declaradas", async () => {
    // INV-11 obliga a calcularlas. Con marginFloor = 0.20 hay TRES bajo el
    // piso —00388 (9 %), 00341 (11 %) y 00304 (19 %)— y el prototipo marcaba
    // solo la primera.
    const r = await resumenDeRiesgo("MX", AHORA);
    expect(r.banderas).toBe(7);
    expect(r.oportunidades).toBe(6);
    expect(toClient(r.monto)).toBe("3943000");
  });

  it("las banderas caen exactamente donde deben", async () => {
    const r = await resumenDeRiesgo("MX", AHORA);
    const porFolio = Object.fromEntries(r.detalle.map((d) => [d.folio, d.banderas.sort()]));

    expect(porFolio["OPP-2026-00388"]).toEqual(["MARGEN_BAJO"]);
    expect(porFolio["OPP-2026-00341"]).toEqual(["MARGEN_BAJO"]);
    expect(porFolio["OPP-2026-00304"]).toEqual(["ESTANCADA", "MARGEN_BAJO"]);
    expect(porFolio["OPP-2026-00374"]).toEqual(["SIN_ACTIVIDAD"]);
    expect(porFolio["OPP-2026-00322"]).toEqual(["SIN_ACTIVIDAD"]);
    expect(porFolio["OPP-2026-00355"]).toEqual(["ESTANCADA"]);
    // Las otras ocho, sin banderas.
    expect(Object.keys(porFolio)).toHaveLength(6);
  });

  it("la cobertura del equipo cae en la banda sana tras reescalar las cuotas", async () => {
    // Las cuotas de §15 daban 0.10× contra un mínimo de 3.0×.
    const cobertura = await coberturaEquipo("MX", 2026, 3);
    expect(cobertura).toBeCloseTo(3.02, 2);
  });

  it("el tablero del gerente muestra quién está por debajo (§10.3)", async () => {
    const porVendedor = await coberturaPorVendedor("MX", 2026, 3);
    const porNombre = Object.fromEntries(porVendedor.map((v) => [v.nombre, v.cobertura]));

    expect(porNombre["Jorge Medina"]).toBeCloseTo(3.68, 2);
    expect(porNombre["Ana Lucía Ríos"]).toBeCloseTo(4.06, 2);
    expect(porNombre["Paulina Estrada"]).toBeCloseTo(2.57, 2);
    // Sin nada que cierre en el trimestre: el caso que el gerente debe ver.
    expect(porNombre["Gabriel Duarte"]).toBe(0);
    expect(porNombre["Valeria Domínguez"]).toBe(0);
  });
});

describe("seed §15 · integridad del escenario", () => {
  it("siembra las 14 organizaciones que las oportunidades usan", async () => {
    // §15 declara nueve, pero las oportunidades referencian catorce.
    //
    // Se verifica que las catorce ESTÉN, no que sean las únicas: dar de alta
    // una oportunidad puede crear una organización nueva, y eso es la
    // aplicación funcionando, no el seed roto.
    const sembradas = await prisma.organization.findMany({
      where: { deletedAt: null, name: { in: ORGANIZACIONES.map((o) => o.name) } },
      select: { name: true },
    });
    expect(sembradas).toHaveLength(ORGANIZACIONES.length);
    expect(ORGANIZACIONES.filter((o) => !o.declaradaEnSpec)).toHaveLength(5);
  });

  it("Aceros del Norte cuelga de Grupo Industrial Bajío", async () => {
    const aceros = await prisma.organization.findFirstOrThrow({
      where: { name: "Aceros del Norte" },
      select: { isStrategic: true, parent: { select: { name: true } } },
    });
    expect(aceros.isStrategic).toBe(true);
    expect(aceros.parent?.name).toBe("Grupo Industrial Bajío");
  });

  it("los ocho usuarios, con los cinco roles representados", async () => {
    const usuarios = await prisma.user.findMany({ select: { role: true } });
    expect(usuarios).toHaveLength(USUARIOS.length);
    expect(new Set(usuarios.map((u) => u.role)).size).toBe(5);
  });

  it("la matriz de permisos deja al vendedor sin costo y sin análisis (§5.2)", async () => {
    const del = async (role: "VENDEDOR" | "GERENTE_PAIS", code: string) =>
      prisma.rolePermission.findFirst({
        where: { role, permission: { code } },
        select: { granted: true, limitValue: true },
      });

    expect((await del("VENDEDOR", "VER_MARGEN"))?.granted).toBe(true);
    expect((await del("VENDEDOR", "VER_COSTO"))?.granted).toBe(false);
    expect((await del("VENDEDOR", "VER_ANALISIS"))?.granted).toBe(false);
    expect((await del("GERENTE_PAIS", "VER_COSTO"))?.granted).toBe(true);

    // RN-04 · el gerente autoriza hasta 30 %.
    const autoriza = await del("GERENTE_PAIS", "AUTORIZAR_DESCUENTO");
    expect(autoriza?.granted).toBe(true);
    expect(autoriza?.limitValue?.toString()).toBe("0.3");
  });

  it("las cinco etapas traen sus compuertas declarativas (§8.3)", async () => {
    const etapas = await prisma.stage.findMany({
      where: { pipeline: { name: "Ventas México" } },
      select: { name: true, position: true, probability: true, staleAfterDays: true, gateRequires: true, isClosing: true },
      orderBy: { position: "asc" },
    });

    expect(etapas.map((e) => e.name)).toEqual([
      "Calificación", "Descubrimiento", "Propuesta", "Negociación", "Cierre",
    ]);
    expect(etapas.map((e) => e.probability.toString())).toEqual(["0.1", "0.25", "0.5", "0.75", "0.9"]);
    expect(etapas.map((e) => e.staleAfterDays)).toEqual([14, 21, 30, 21, 10]);
    expect(etapas[0].gateRequires).toEqual([]);
    expect(etapas[4].gateRequires).toEqual([
      "CONTRATO_O_OC_CARGADO", "HITOS_CUADRADOS", "MEDDIC_MIN_CIERRE", "SIN_AUTORIZACION_PENDIENTE",
    ]);
    expect(etapas[4].isClosing).toBe(true);
  });

  it("los pesos MEDDIC suman 100 en cada pipeline (Q-08)", async () => {
    const pipelines = await prisma.pipeline.findMany({
      select: { name: true, meddicWeights: { select: { weight: true } } },
    });
    expect(pipelines).toHaveLength(4);
    for (const p of pipelines) {
      const suma = p.meddicWeights.reduce((a, w) => a + w.weight, 0);
      expect(suma, `${p.name} no suma 100`).toBe(100);
    }
  });

  it("las 14 oportunidades tienen sus seis componentes MEDDIC", async () => {
    // §6.3 · el puntaje es DERIVADO. Sembrarlo sin las filas que lo producen
    // dejaría la pestaña MEDDIC vacía junto a un número salido de la nada.
    const conteos = await prisma.meddicComponentAssessment.groupBy({
      by: ["opportunityId"],
      _count: true,
    });
    // Las evaluaciones existen solo para lo sembrado: las altas nuevas no
    // traen MEDDIC hasta E3.
    expect(conteos).toHaveLength(OPORTUNIDADES.length);
    for (const c of conteos) expect(c._count).toBe(6);
  });

  it("el puntaje de CADA oportunidad coincide con el que calcula la fórmula", async () => {
    // Si el número desnormalizado y el calculado divergen, la tarjeta del
    // kanban miente.
    // Solo las sembradas: una oportunidad recién dada de alta no tiene
    // evaluaciones MEDDIC todavía —llegan con E3— y compararla contra la
    // fórmula sería exigirle un puntaje que nadie ha capturado.
    const todas = await prisma.opportunity.findMany({
      where: { folio: { in: OPORTUNIDADES.map((o) => o.folio) } },
      select: { folio: true, meddicScore: true, meddic: { select: { component: true, status: true } } },
    });

    for (const o of todas) {
      const calculado = computeMeddicScore(o.meddic, PESOS_POR_OMISION);
      expect(calculado, `${o.folio}: guardado ${o.meddicScore}, calculado ${calculado}`).toBe(
        o.meddicScore,
      );
    }
  });

  it("solo 33 puntajes son alcanzables, y 62 no es uno de ellos", () => {
    // El hallazgo que forzó derivar los componentes en vez de capturar el
    // número: con la fórmula de §7.2 y los pesos de Q-08 el puntaje salta en
    // escalones. §15 declara 62 para OPP-2026-00388 y ese valor no existe.
    const alcanzables = new Set<number>();
    for (let suma = 0; suma <= 10; suma++) {
      for (let dolor = 0; dolor <= 2; dolor++) {
        alcanzables.add(Math.round((17 * suma + 15 * dolor) / 2));
      }
    }
    expect(alcanzables.size).toBe(33);
    expect(alcanzables.has(84)).toBe(true);
    expect(alcanzables.has(62)).toBe(false);
    expect(alcanzables.has(60)).toBe(true);
    expect(alcanzables.has(66)).toBe(true);
  });

  it("OPP-2026-00417 llega a los 84 que §15 declara", async () => {
    const o = await prisma.opportunity.findUniqueOrThrow({
      where: { folio: "OPP-2026-00417" },
      select: { meddicScore: true },
    });
    expect(o.meddicScore).toBe(84);
  });

  it("OPP-2026-00388 queda bajo el mínimo de cierre, que es lo que importa", async () => {
    // §15 pedía 62; la fórmula da 66. Lo que el escenario quería demostrar
    // —que la validación de cierre se vea— se conserva igual.
    const [o, politica] = await Promise.all([
      prisma.opportunity.findUniqueOrThrow({
        where: { folio: "OPP-2026-00388" },
        select: { meddicScore: true },
      }),
      prisma.commercialPolicy.findUniqueOrThrow({ where: { countryCode: "MX" } }),
    ]);
    expect(o.meddicScore).toBeLessThan(politica.meddicMinToClosing);
  });

  it("MEDDIC E y C están anclados a personas reales (§2.1)", async () => {
    const anclados = await prisma.meddicComponentAssessment.findMany({
      where: {
        opportunity: { folio: "OPP-2026-00417" },
        component: { in: ["DECISOR_ECONOMICO", "CAMPEON"] },
        status: "CONFIRMADO",
      },
      select: { component: true, person: { select: { name: true } } },
    });
    expect(anclados).toHaveLength(2);
    for (const a of anclados) {
      expect(a.person?.name, `${a.component} sin persona ligada`).toBeTruthy();
    }
  });

  it("el contador de folio queda listo para la siguiente alta (RN-20)", async () => {
    /**
     * **Al menos** el máximo sembrado, no exactamente.
     *
     * La igualdad valía mientras nada pudiera crear oportunidades. Ya no: el
     * contador es atómico y **no retrocede al borrar**, así que cada alta de
     * prueba quema su número para siempre. Eso no es una fuga, es INV-12
     * funcionando —«el folio es inmutable, incluso al reabrir»—: reutilizar un
     * consecutivo liberado sería peor que dejar el hueco, porque dos documentos
     * distintos acabarían con el mismo folio en la contabilidad del cliente.
     *
     * Lo que de verdad hay que garantizar es que la siguiente alta no choque
     * con nada sembrado.
     */
    const contador = await prisma.folioCounter.findUniqueOrThrow({ where: { year: 2026 } });
    const maximoSembrado = Math.max(
      ...OPORTUNIDADES.map((o) => Number.parseInt(o.folio.slice(-5), 10)),
    );
    expect(contador.lastNumber).toBeGreaterThanOrEqual(maximoSembrado);

    // Y que ningún folio sembrado esté por encima del contador, que sería la
    // forma real de que la siguiente alta colisionara.
    const folios = await prisma.opportunity.findMany({ select: { folio: true } });
    for (const { folio } of folios) {
      const [, anio, consecutivo] = folio.match(/^OPP-(\d{4})-(\d{5})$/) ?? [];
      if (anio !== "2026") continue;
      expect(Number.parseInt(consecutivo, 10), folio).toBeLessThanOrEqual(contador.lastNumber);
    }
  });

  it("RN-32 · el anual cuadra con los trimestres salvo en el caso deliberado", async () => {
    const porUsuario = await prisma.objective.findMany({
      where: { fiscalYear: 2026 },
      select: {
        periodType: true,
        revenueQuota: true,
        user: { select: { initials: true } },
      },
    });

    const descuadres: string[] = [];
    for (const clave of ["JM", "AL", "PE", "GD", "VD"]) {
      const suyos = porUsuario.filter((o) => o.user.initials === clave);
      const trimestres = suyos.filter((o) => o.periodType === "TRIMESTRAL");
      const anual = suyos.find((o) => o.periodType === "ANUAL")!;
      const suma = trimestres.reduce((a, t) => a.plus(t.revenueQuota), anual.revenueQuota.minus(anual.revenueQuota));
      if (!suma.equals(anual.revenueQuota)) descuadres.push(clave);
    }

    // Uno solo, y es el que el seed puso a propósito para que AC-30 tenga caso.
    expect(descuadres).toEqual(["VD"]);
  });

  it("hay un solo objetivo anual por usuario y año", async () => {
    // Lo garantiza el índice NULLS NOT DISTINCT: el @@unique de Prisma no lo
    // hacía, porque en SQL NULL != NULL y `quarter` es nulo para ANUAL.
    const anuales = await prisma.objective.groupBy({
      by: ["userId", "fiscalYear"],
      where: { periodType: "ANUAL" },
      _count: true,
    });
    for (const a of anuales) {
      expect(a._count).toBe(1);
    }
  });
});
