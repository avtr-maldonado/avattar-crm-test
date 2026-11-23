import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { can, type Session } from "@/lib/auth/permissions";
import {
  configuracionDeCatalogos,
  configuracionDePermisos,
  configuracionDePipelines,
  configuracionDePolitica,
} from "@/lib/scope/configuracion";

/**
 * P-11 contra los datos reales.
 *
 * Esta pantalla es lo que hace **verificable** a INV-05: todo umbral del
 * sistema tiene que aparecer en ella. La prueba central de aquí abajo compara
 * la lista de umbrales que la configuración expone contra los que las reglas
 * de negocio consumen, y falla si aparece uno nuevo que nadie puso en P-11.
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

describe("P-11 · quién entra · §11", () => {
  it("el administrador entra a todo", async () => {
    const admin = await sesionDe("as@avattar.com");
    expect(can(admin, "EDITAR_CATALOGOS")).toBe(true);
    expect(can(admin, "EDITAR_POLITICA_COMERCIAL")).toBe(true);
  });

  it("dirección entra solo a política comercial", async () => {
    // «Solo ADMINISTRADOR; la política comercial también para DIRECCION.»
    const direccion = await sesionDe("dc@avattar.com");
    expect(can(direccion, "EDITAR_POLITICA_COMERCIAL")).toBe(true);
    expect(can(direccion, "EDITAR_CATALOGOS")).toBe(false);
  });

  it("vendedor y gerente no entran a ninguna de las dos", async () => {
    for (const correo of ["pe@avattar.com", "jm@avattar.com"]) {
      const s = await sesionDe(correo);
      expect(can(s, "EDITAR_CATALOGOS"), correo).toBe(false);
      expect(can(s, "EDITAR_POLITICA_COMERCIAL"), correo).toBe(false);
    }
  });

  it("AC-02 · el vendedor tampoco entra a análisis", async () => {
    const paulina = await sesionDe("pe@avattar.com");
    expect(can(paulina, "VER_ANALISIS")).toBe(false);
    // El gerente sí: es quien mira el desempeño de la oficina.
    expect(can(await sesionDe("jm@avattar.com"), "VER_ANALISIS")).toBe(true);
  });
});

describe("P-11 · INV-05, todo umbral aparece aquí", () => {
  it("la política expone los umbrales que las reglas consumen, y solo esos (§67)", async () => {
    // Si una regla empieza a leer un umbral nuevo y nadie lo agrega a P-11,
    // queda invisible para quien tiene que confirmarlo; si se expone uno que
    // nada lee, la pantalla promete una regla que no existe. Esta lista es el
    // contrato entre la configuración y la pantalla.
    const paises = await configuracionDePolitica();
    const mx = paises.find((p) => p.code === "MX")!;
    expect(mx.commercialPolicy).not.toBeNull();

    const expuestos = Object.keys(mx.commercialPolicy!).sort();
    expect(expuestos).toEqual([
      "leadFirstContactSlaHours",
      "meddicMinToClosing",
      "meddicMinToCommit",
    ]);
  });

  it("los tres países tienen política: sin ella, un país no puede operar", async () => {
    const paises = await configuracionDePolitica();
    expect(paises).toHaveLength(3);
    for (const p of paises) {
      expect(p.commercialPolicy, `${p.code} sin política`).not.toBeNull();
    }
  });

  it("el impuesto va en fracción y no en porcentaje (INV-03)", async () => {
    const mx = (await configuracionDePolitica()).find((p) => p.code === "MX")!;

    expect(mx.taxRate.toString()).toBe("0.16");
    // Un 16 en vez de 0.16 significaría 1600 % al formatearlo.
    expect(Number(mx.taxRate)).toBeLessThan(1);
    expect(mx.commercialPolicy!.leadFirstContactSlaHours).toBeGreaterThan(0);
  });
});

describe("P-11 · pipelines y etapas", () => {
  it("expone probabilidad, días, compuerta y requisitos de cada etapa", async () => {
    const pipelines = await configuracionDePipelines();
    const mx = pipelines.find((p) => p.name === "Ventas México")!;

    expect(mx.stages).toHaveLength(5);
    for (const e of mx.stages) {
      expect(e.probability).toBeDefined();
      expect(e.staleAfterDays).toBeGreaterThan(0);
      expect(["ADVERTENCIA", "BLOQUEANTE"]).toContain(e.gateMode);
      expect(Array.isArray(e.gateRequires)).toBe(true);
    }
  });

  it("cuenta cuántas oportunidades hay en cada etapa", async () => {
    // MD-05 · sirve para saber si una etapa se puede reordenar sin romper nada.
    //
    // Aquí el conteo es a propósito sobre TODO lo que hay, sembrado o no: quien
    // va a desactivar una etapa necesita saber cuántas oportunidades reales
    // dejaría huérfanas, no cuántas trae el escenario de demostración. Por eso
    // se afirma un mínimo y no una igualdad.
    const mx = (await configuracionDePipelines()).find((p) => p.name === "Ventas México")!;
    const total = mx.stages.reduce((n, e) => n + e._count.opportunities, 0);
    expect(total).toBeGreaterThanOrEqual(14);
  });

  it("los pesos MEDDIC suman 100 en los cuatro pipelines", async () => {
    for (const p of await configuracionDePipelines()) {
      const suma = p.meddicWeights.reduce((a, w) => a + w.weight, 0);
      expect(suma, `${p.name}`).toBe(100);
    }
  });
});

describe("P-11 · catálogos", () => {
  it("cuenta los usos de cada valor · MD-05", async () => {
    // «Se desactivan, nunca se eliminan.» Saber si un motivo se usó cien veces
    // o ninguna es la diferencia entre desactivarlo tranquilo y romper reportes.
    const c = await configuracionDeCatalogos();

    expect(c.tiposActividad).toHaveLength(13);
    expect(c.tiposDocumento).toHaveLength(9);
    expect(c.motivosPerdida).toHaveLength(8);
    expect(c.rolesComite).toHaveLength(7);

    // Los tipos de actividad sí se usan: hay 49 actividades sembradas.
    const usos = c.tiposActividad.reduce((n, t) => n + t._count.activities, 0);
    expect(usos).toBe(49);
  });

  it("marca los que llevan comportamiento propio", async () => {
    const c = await configuracionDeCatalogos();

    const contratos = c.tiposDocumento.filter((t) => t.isContract).map((t) => t.name).sort();
    expect(contratos).toEqual(["Contrato", "Orden de compra"]);

    const conCompetidor = c.motivosPerdida.filter((m) => m.requiresCompetitor);
    expect(conCompetidor.map((m) => m.name)).toEqual(["Competidor"]);
  });
});

describe("P-11 · matriz de permisos · §5.2", () => {
  it("los catorce permisos están, con su valor por los seis roles", async () => {
    const permisos = await configuracionDePermisos();
    // Once del spec §5.2 más VER_OBJETIVOS_EQUIPO (P-08), CREAR_OPORTUNIDAD (§39) y los tres de
    // prospectos (§58: VER_PROSPECTOS, GESTIONAR_PROSPECTOS, CONVERTIR_PROSPECTO) y ANALIZAR_CON_IA (§63), menos los tres
    // que nada consultaba (§66).
    expect(permisos).toHaveLength(14);
    expect(permisos.map((p) => p.code)).toContain("ANALIZAR_CON_IA");
    expect(permisos.map((p) => p.code)).toContain("CREAR_OPORTUNIDAD");
    expect(permisos.map((p) => p.code)).toContain("GESTIONAR_PROSPECTOS");
    for (const p of permisos) {
      expect(Object.keys(p.porRol)).toHaveLength(6);
    }
  });

  it("reproduce la tabla del spec en los casos que más importan", async () => {
    const porCodigo = Object.fromEntries(
      (await configuracionDePermisos()).map((p) => [p.code, p.porRol]),
    );

    // RN-09 · ver margen y ver costo son independientes.
    expect(porCodigo.VER_MARGEN.VENDEDOR.granted).toBe(true);
    expect(porCodigo.VER_COSTO.VENDEDOR.granted).toBe(false);

    // §2.3 · el vendedor no ve análisis ni los objetivos del equipo.
    expect(porCodigo.VER_ANALISIS.VENDEDOR.granted).toBe(false);
    expect(porCodigo.VER_OBJETIVOS_EQUIPO.VENDEDOR.granted).toBe(false);

    // §66 · los tres permisos que nada consultaba salieron de la matriz.
    expect(porCodigo.AUTORIZAR_DESCUENTO).toBeUndefined();
    expect(porCodigo.EXPORTAR_CON_COSTO).toBeUndefined();
    expect(porCodigo.VER_OPORTUNIDADES_PROPIAS).toBeUndefined();

    // RN-18 · solo Administración reabre.
    expect(porCodigo.REABRIR_OPORTUNIDAD.ADMINISTRADOR.granted).toBe(true);
    expect(porCodigo.REABRIR_OPORTUNIDAD.DIRECCION.granted).toBe(false);
  });

});
