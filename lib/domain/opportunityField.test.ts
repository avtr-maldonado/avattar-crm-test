import { describe, expect, it } from "vitest";
import { CAMPOS_RAPIDOS, cambioDeCampo } from "./opportunityField";

/** Lo que devuelve cuando acepta, sin el envoltorio. */
function cambio(campo: string, valor: string) {
  const r = cambioDeCampo(campo, valor);
  if (!r.ok) throw new Error(`esperaba que aceptara ${campo}: ${r.problemas[0]?.mensaje}`);
  return r.datos;
}

describe("un campo a la vez, traducido a un cambio del dominio", () => {
  it("el tipo de negocio viaja como está", () => {
    expect(cambio("businessType", "EXPANSION")).toEqual({ businessType: "EXPANSION" });
  });

  it("la categoría de pronóstico también", () => {
    expect(cambio("forecastCategory", "COMPROMISO")).toEqual({ forecastCategory: "COMPROMISO" });
  });

  it("la fecha se fija al mediodía", () => {
    // Medianoche en un huso al oeste de UTC cae en el día anterior, y el
    // cierre estimado se movería un día solo por guardarlo. Es el mismo
    // mediodía que usa el alta.
    const { expectedCloseDate } = cambio("expectedCloseDate", "2026-12-20");
    expect(expectedCloseDate).toEqual(new Date("2026-12-20T12:00:00"));
  });

  it("el origen vacío significa quitarlo, no dejarlo como estaba", () => {
    expect(cambio("sourceId", "")).toEqual({ sourceId: null });
  });

  it("el propietario vacío no existe: toda oportunidad tiene dueño", () => {
    const r = cambioDeCampo("ownerId", "");
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });
});

describe("lo que no acepta", () => {
  it("un campo que no es editable así", () => {
    // El folio es inmutable (INV-12) y la cuenta cambiaría el país: ninguno de
    // los dos se toca desde la ficha, y el nombre del campo llega del cliente.
    const r = cambioDeCampo("folio", "OPP-2026-00001");
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });

  it("un valor fuera del catálogo", () => {
    const r = cambioDeCampo("businessType", "REGALADO");
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });

  it("una fecha que no es fecha", () => {
    const r = cambioDeCampo("expectedCloseDate", "el jueves");
    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
  });

  it("el problema dice a qué campo pertenece, para pintarlo donde se corrige", () => {
    const r = cambioDeCampo("forecastCategory", "TAL_VEZ");
    if (r.ok) throw new Error("esperaba que fallara");
    expect(r.problemas[0]?.campo).toBe("forecastCategory");
  });
});

describe("el catálogo de campos editables", () => {
  it("son los cinco de la ficha, y ninguno más", () => {
    // La lista la usan el componente y la acción: si alguien agrega uno aquí
    // sin pensarlo, esta prueba lo dice en voz alta.
    expect([...CAMPOS_RAPIDOS]).toEqual([
      "businessType",
      "forecastCategory",
      "expectedCloseDate",
      "sourceId",
      "ownerId",
    ]);
  });
});
