import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { esFolioValido, formatFolio, nextFolio } from "./folio";

describe("formatFolio · RN-20", () => {
  it("rellena el consecutivo a cinco dígitos", () => {
    expect(formatFolio(2026, 1)).toBe("OPP-2026-00001");
    expect(formatFolio(2026, 417)).toBe("OPP-2026-00417");
    expect(formatFolio(2026, 99999)).toBe("OPP-2026-99999");
  });

  it("el año va literal, no derivado del consecutivo", () => {
    expect(formatFolio(2027, 1)).toBe("OPP-2027-00001");
  });

  it("reconoce folios bien formados y rechaza el resto", () => {
    expect(esFolioValido("OPP-2026-00417")).toBe(true);
    expect(esFolioValido("OPP-2026-417")).toBe(false);
    expect(esFolioValido("opp-2026-00417")).toBe(false);
    expect(esFolioValido("OPP-26-00417")).toBe(false);
  });
});

/**
 * La atomicidad y el reinicio por año necesitan base. Se activan con la
 * Task 12, junto con el resto de las pruebas de integración.
 */
describe("nextFolio · RN-20 contra la base", () => {
  it.skip("dos llamadas seguidas dan números distintos", async () => {
    const a = await prisma.$transaction((tx) => nextFolio(tx, 2099));
    const b = await prisma.$transaction((tx) => nextFolio(tx, 2099));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^OPP-2099-\d{5}$/);

    await prisma.folioCounter.delete({ where: { year: 2099 } });
  });

  it.skip("el consecutivo reinicia en enero (el defecto del esquema anterior)", async () => {
    await prisma.$transaction((tx) => nextFolio(tx, 2098));
    await prisma.$transaction((tx) => nextFolio(tx, 2098));
    // Año nuevo, consecutivo nuevo. Con la secuencia global anterior habría
    // seguido en 00003.
    const primeroDelAnio = await prisma.$transaction((tx) => nextFolio(tx, 2097));
    expect(primeroDelAnio).toBe("OPP-2097-00001");

    await prisma.folioCounter.deleteMany({ where: { year: { in: [2097, 2098] } } });
  });

  it.skip("altas concurrentes no colisionan", async () => {
    // Lo que count()+1 no soporta: diez altas al mismo tiempo.
    const folios = await Promise.all(
      Array.from({ length: 10 }, () => prisma.$transaction((tx) => nextFolio(tx, 2096))),
    );
    expect(new Set(folios).size).toBe(10);

    await prisma.folioCounter.delete({ where: { year: 2096 } });
  });
});
