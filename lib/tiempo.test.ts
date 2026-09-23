import { describe, expect, it } from "vitest";
import {
  ciudadDe,
  duracionEnMinutos,
  etiquetaDeDuracion,
  fechaEn,
  horaEn,
  instanteEn,
  sumarMinutos,
} from "./tiempo";

describe("instanteEn · de la hora de pared al instante", () => {
  it("Ciudad de México va seis horas detrás de UTC todo el año", () => {
    // México dejó el horario de verano en 2022: 10:30 en CDMX son las 16:30Z.
    expect(instanteEn("2026-09-29", "10:30", "America/Mexico_City").toISOString()).toBe(
      "2026-09-29T16:30:00.000Z",
    );
  });

  it("Bogotá va cinco", () => {
    expect(instanteEn("2026-09-29", "10:30", "America/Bogota").toISOString()).toBe(
      "2026-09-29T15:30:00.000Z",
    );
  });

  it("Santiago en septiembre ya está en horario de verano: tres", () => {
    // El horario de verano chileno empieza el primer domingo de septiembre. Si
    // esto se calculara con un desfase fijo, cada reunión con Chile caería una
    // hora fuera de lugar medio año.
    expect(instanteEn("2026-09-29", "10:30", "America/Santiago").toISOString()).toBe(
      "2026-09-29T13:30:00.000Z",
    );
  });

  it("una zona que no existe cae a UTC en vez de reventar", () => {
    expect(instanteEn("2026-09-29", "10:30", "Marte/Olympus").toISOString()).toBe(
      "2026-09-29T10:30:00.000Z",
    );
  });
});

describe("horaEn y fechaEn · del instante a la hora de pared", () => {
  it("devuelven lo que se tecleó", () => {
    const i = instanteEn("2026-09-29", "10:30", "America/Mexico_City");
    expect(horaEn(i, "America/Mexico_City")).toBe("10:30");
    expect(fechaEn(i, "America/Mexico_City")).toBe("2026-09-29");
  });

  it("la fecha es la del lugar, no la de UTC", () => {
    // Las 22:00 en CDMX son las 04:00Z del día siguiente. La actividad es del
    // 29, no del 30, y así tiene que agruparse en la agenda.
    const i = new Date("2026-09-30T04:00:00Z");
    expect(fechaEn(i, "America/Mexico_City")).toBe("2026-09-29");
    expect(horaEn(i, "America/Mexico_City")).toBe("22:00");
  });
});

describe("duración", () => {
  it("entre dos horas del mismo día", () => {
    expect(duracionEnMinutos("10:30", "11:15")).toBe(45);
  });

  it("un fin antes del inicio sale negativo, para que quien valida lo vea", () => {
    expect(duracionEnMinutos("11:00", "10:30")).toBeLessThan(0);
  });

  it("sumar minutos a una hora da vuelta a medianoche", () => {
    expect(sumarMinutos("10:30", 30)).toBe("11:00");
    expect(sumarMinutos("23:45", 30)).toBe("00:15");
  });

  it("la etiqueta habla como la gente", () => {
    expect(etiquetaDeDuracion(30)).toBe("30 min");
    expect(etiquetaDeDuracion(60)).toBe("1 h");
    expect(etiquetaDeDuracion(90)).toBe("1 h 30 min");
    expect(etiquetaDeDuracion(0)).toBe("");
  });
});

describe("ciudadDe · el nombre que va en la etiqueta", () => {
  it("las tres ciudades del negocio, en español", () => {
    expect(ciudadDe("America/Mexico_City")).toBe("Ciudad de México");
    expect(ciudadDe("America/Bogota")).toBe("Bogotá");
    expect(ciudadDe("America/Santiago")).toBe("Santiago");
  });

  it("cualquier otra zona, su último tramo legible", () => {
    expect(ciudadDe("Europe/Buenos_Aires")).toBe("Buenos Aires");
    expect(ciudadDe("UTC")).toBe("UTC");
  });
});
