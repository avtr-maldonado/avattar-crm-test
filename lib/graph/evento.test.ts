import { describe, expect, it } from "vitest";
import { eventoDeActividad } from "./evento";

const BASE = {
  subject: "Demostración técnica",
  startsAt: new Date("2026-09-29T16:30:00.000Z"),
  durationMin: 45,
  zona: "America/Mexico_City",
  notes: "Llevar la propuesta impresa.",
  esVideollamada: false,
  oportunidad: { folio: "OPP-2026-00894", name: "Ikusi · Servicios administrados" },
};

describe("eventoDeActividad · lo que Graph recibe", () => {
  it("inicio y fin van como hora de pared con su zona, no como instante", () => {
    // Graph quiere «10:30 en America/Mexico_City»; así el evento cae a la hora
    // correcta en el calendario de cada quien, esté donde esté.
    const e = eventoDeActividad(BASE);
    expect(e.start).toEqual({ dateTime: "2026-09-29T10:30:00", timeZone: "America/Mexico_City" });
    expect(e.end).toEqual({ dateTime: "2026-09-29T11:15:00", timeZone: "America/Mexico_City" });
  });

  it("sin duración, media hora: un evento de cero minutos no se ve en el calendario", () => {
    const e = eventoDeActividad({ ...BASE, durationMin: null });
    expect(e.end.dateTime).toBe("2026-09-29T11:00:00");
  });

  it("el cuerpo lleva las notas y el folio, para volver del calendario al CRM", () => {
    const e = eventoDeActividad(BASE);
    expect(e.body.contentType).toBe("text");
    expect(e.body.content).toContain("Llevar la propuesta impresa.");
    expect(e.body.content).toContain("OPP-2026-00894");
  });

  it("una videollamada pide la reunión de Teams; lo demás, no", () => {
    expect(eventoDeActividad({ ...BASE, esVideollamada: true })).toMatchObject({
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
    });
    expect(eventoDeActividad(BASE).isOnlineMeeting).toBe(false);
  });

  it("el asunto es el de la actividad, tal cual", () => {
    expect(eventoDeActividad(BASE).subject).toBe("Demostración técnica");
  });
});
