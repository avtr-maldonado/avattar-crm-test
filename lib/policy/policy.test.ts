import { describe, expect, it } from "vitest";
import { getCommercialPolicy, getCountry } from "./index";

/**
 * Estas pruebas necesitan la base sembrada, así que se activan con la Task 12.
 * Hasta entonces quedan marcadas: una prueba que no puede correr todavía es
 * mejor escrita y saltada que ausente y olvidada.
 */
describe("lib/policy · INV-05", () => {
  it.skip("lee los umbrales de la base, no de constantes", async () => {
    const politica = await getCommercialPolicy("MX");
    expect(politica.marginFloor.toString()).toBe("0.2");
    expect(politica.lineMarginFloor.toString()).toBe("0.1");
    expect(politica.discountThresholdMgmt.toString()).toBe("0.15");
    expect(politica.discountThresholdDir.toString()).toBe("0.3");
    expect(politica.meddicMinToClosing).toBe(70);
    expect(politica.meddicMinToWin).toBe(80);
    expect(politica.meddicMinToCommit).toBe(70);
    expect(politica.healthyCoverageMin.toString()).toBe("3");
  });

  it.skip("la tasa de impuesto es fracción y varía por país (Q-04)", async () => {
    expect((await getCountry("MX")).taxRate.toString()).toBe("0.16");
    expect((await getCountry("CO")).taxRate.toString()).toBe("0.19");
    expect((await getCountry("CL")).taxRate.toString()).toBe("0.19");
  });

  it.skip("el año fiscal es el calendario (Q-02)", async () => {
    for (const pais of ["MX", "CO", "CL"] as const) {
      expect((await getCountry(pais)).fiscalYearStartMonth).toBe(1);
    }
  });

  it.skip("un país sin política falla en vez de inventar umbrales", async () => {
    // CO y CL sí tienen política sembrada; la garantía es que findUniqueOrThrow
    // reviente en lugar de devolver valores por omisión.
    await expect(getCommercialPolicy("XX" as never)).rejects.toThrow();
  });
});
