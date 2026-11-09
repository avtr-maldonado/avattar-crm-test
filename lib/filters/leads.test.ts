import { describe, expect, it } from "vitest";
import { hrefDeProspectos, parseFiltrosDeProspectos, whereDeProspectos } from "./leads";

/**
 * Los filtros de Prospectos en la URL · decisiones §58 (INV-10). Etapa, canal,
 * campaña, vendedor, fechas de ingreso, «solo los míos» y el texto del buscador.
 * Sin etapas elegidas se ven las abiertas; una etapa inválida se descarta.
 */
describe("parseFiltrosDeProspectos", () => {
  it("lee varios valores por parámetro y descarta lo inválido", () => {
    const f = parseFiltrosDeProspectos(new URLSearchParams("etapa=NUEVO&etapa=ASIGNADO&etapa=NADA&canal=c1&campana=k1&vendedor=v1&vendedor=v2&desde=2026-10-01&hasta=2026-10-31&mios=1&q=novatek"));
    expect(f.etapas).toEqual(["NUEVO", "ASIGNADO"]);
    expect(f.canales).toEqual(["c1"]);
    expect(f.campanas).toEqual(["k1"]);
    expect(f.vendedores).toEqual(["v1", "v2"]);
    expect(f.desde).toBe("2026-10-01");
    expect(f.hasta).toBe("2026-10-31");
    expect(f.mios).toBe(true);
    expect(f.q).toBe("novatek");
  });

  it("sin nada, todo vacío y sin texto; una fecha mal escrita no cuenta", () => {
    const f = parseFiltrosDeProspectos(new URLSearchParams("desde=ayer"));
    expect(f).toEqual({ etapas: [], canales: [], campanas: [], vendedores: [], desde: null, hasta: null, mios: false, q: "" });
  });
});

describe("whereDeProspectos", () => {
  const sesion = { userId: "u-yo" };

  it("sin etapas se ven las abiertas; con etapas, esas", () => {
    const sin = whereDeProspectos(parseFiltrosDeProspectos(new URLSearchParams()), sesion);
    expect(sin.stage).toEqual({ in: ["NUEVO", "EN_VALIDACION", "CONTACTADO", "CALIFICADO", "ASIGNADO", "ACEPTADO"] });
    const con = whereDeProspectos(parseFiltrosDeProspectos(new URLSearchParams("etapa=CONVERTIDO")), sesion);
    expect(con.stage).toEqual({ in: ["CONVERTIDO"] });
  });

  it("canal, campaña, vendedor y fechas de ingreso; «míos» recorta por el asignado", () => {
    const w = whereDeProspectos(parseFiltrosDeProspectos(new URLSearchParams("canal=c1&vendedor=v1&desde=2026-10-01&hasta=2026-10-31&mios=1")), sesion);
    expect(w.channelId).toEqual({ in: ["c1"] });
    expect(w.assignedToId).toBe("u-yo");
    expect(w.createdAt).toEqual({ gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-11-01T00:00:00Z") });
  });

  it("el buscador mira contacto, empresa, correo y teléfono, sin distinguir mayúsculas", () => {
    const w = whereDeProspectos(parseFiltrosDeProspectos(new URLSearchParams("q=Nova")), sesion);
    expect(w.OR).toHaveLength(4);
    expect(w.OR?.[0]).toEqual({ contactName: { contains: "Nova", mode: "insensitive" } });
  });
});

describe("hrefDeProspectos", () => {
  it("escribe solo lo que está puesto y conserva lo extra, con parámetros repetidos", () => {
    const f = parseFiltrosDeProspectos(new URLSearchParams("etapa=NUEVO&etapa=ASIGNADO&mios=1&q=x"));
    expect(hrefDeProspectos(f, { vista: "kanban" })).toBe("/prospectos?vista=kanban&etapa=NUEVO&etapa=ASIGNADO&mios=1&q=x");
  });
});
