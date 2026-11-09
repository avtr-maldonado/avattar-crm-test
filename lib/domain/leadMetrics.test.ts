import { describe, expect, it } from "vitest";
import { indicadoresDeProspectos, type ProspectoMedible } from "./leadMetrics";
import { formatFolioDeProspecto } from "./leadFolio";

/**
 * Los cinco indicadores de la pantalla de prospectos · decisiones §58, sobre la
 * lista ya acotada: abiertos, sin asignar, sin seguimiento (abiertos sin próxima
 * actividad), SLA vencido y tasa de conversión (convertidos sobre cerrados).
 */
const ahora = new Date("2026-11-10T12:00:00Z");
const hace = (horas: number) => new Date(ahora.getTime() - horas * 60 * 60 * 1000);
const en = (horas: number) => new Date(ahora.getTime() + horas * 60 * 60 * 1000);

function p(x: Partial<ProspectoMedible>): ProspectoMedible {
  return { stage: "NUEVO", assignedToId: null, nextActivityAt: null, createdAt: hace(2), firstContactDueAt: en(22), contactedAt: null, ...x };
}

describe("indicadoresDeProspectos", () => {
  it("cuenta abiertos, sin asignar, sin seguimiento y SLA vencido sobre los abiertos", () => {
    const r = indicadoresDeProspectos(
      [
        p({}),
        p({ stage: "ASIGNADO", assignedToId: "v1", nextActivityAt: en(5) }),
        p({ stage: "CONTACTADO", createdAt: hace(30), firstContactDueAt: hace(6), contactedAt: hace(10) }),
        p({ stage: "CALIFICADO", createdAt: hace(30), firstContactDueAt: hace(6) }),
        p({ stage: "CONVERTIDO", assignedToId: "v1" }),
        p({ stage: "DESCARTADO" }),
      ],
      ahora,
    );
    expect(r.abiertos).toBe(4);
    expect(r.sinAsignar).toBe(3);
    expect(r.sinSeguimiento).toBe(3);
    expect(r.slaVencido).toBe(1);
  });

  it("la tasa es convertidos entre cerrados (convertidos, descartados y rechazados); sin cerrados es nula", () => {
    expect(indicadoresDeProspectos([p({ stage: "CONVERTIDO" }), p({ stage: "DESCARTADO" }), p({ stage: "RECHAZADO" }), p({ stage: "CONVERTIDO" })], ahora).tasaDeConversion).toBe(0.5);
    expect(indicadoresDeProspectos([p({})], ahora).tasaDeConversion).toBeNull();
  });
});

describe("formatFolioDeProspecto", () => {
  it("PRO-AAAA-NNNNN con relleno", () => {
    expect(formatFolioDeProspecto(2026, 7)).toBe("PRO-2026-00007");
  });
});
