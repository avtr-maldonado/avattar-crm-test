import { describe, expect, it } from "vitest";
import { envioDeMovimiento } from "./arrastre";

const TARJETA = { id: "opp-1", nombre: "Migración ERP", etapaId: "etapa-calificacion" };

describe("envioDeMovimiento", () => {
  it("lleva los dos identificadores que la acción necesita", () => {
    // El defecto que esto cubre: la primera versión los tomaba de campos
    // ocultos que React todavía no había actualizado, así que viajaban vacíos y
    // el arrastre parecía no hacer nada.
    const datos = envioDeMovimiento(TARJETA, "etapa-descubrimiento");
    expect(datos).not.toBeNull();
    expect(datos!.get("opportunityId")).toBe("opp-1");
    expect(datos!.get("toStageId")).toBe("etapa-descubrimiento");
  });

  it("no envía nada si se suelta en la misma columna", () => {
    // No es un error: es lo que pasa cuando alguien empieza a arrastrar y se
    // arrepiente. Enviarlo sería escribir una transición sin movimiento.
    expect(envioDeMovimiento(TARJETA, "etapa-calificacion")).toBeNull();
  });

  it("no envía nada si no había tarjeta arrastrándose", () => {
    expect(envioDeMovimiento(null, "etapa-descubrimiento")).toBeNull();
  });

  it("omitir la compuerta viaja solo cuando se pide", () => {
    const sin = envioDeMovimiento(TARJETA, "etapa-propuesta");
    expect(sin!.get("omitirCompuerta")).toBeNull();

    const con = envioDeMovimiento(TARJETA, "etapa-propuesta", { omitirCompuerta: true });
    expect(con!.get("omitirCompuerta")).toBe("true");
  });
});
