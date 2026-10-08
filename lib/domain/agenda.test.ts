import { describe, expect, it } from "vitest";
import { agruparPorEstado, estadoDeAgenda, semanaElegida, relojDeAgenda } from "./agenda";

/**
 * El estado de una actividad en la agenda · decisiones §42.
 *
 * Cuatro cubetas: realizada (tiene `completedAt`), vencida (pendiente y de un
 * día anterior a hoy), en progreso (pendiente, empezó y todavía no termina) y
 * por realizar (lo demás). «Vencida» se mide por día, igual que la bandeja y
 * el contador: una llamada de hace una hora sigue siendo del plan de hoy.
 */
const ahora = new Date("2026-10-01T16:00:00Z");
const inicioDeHoy = new Date("2026-10-01T06:00:00Z");
const reloj = { ahora, inicioDeHoy };

function actividad(p: { startsAt: string; durationMin?: number | null; completedAt?: string | null }) {
  return {
    startsAt: new Date(p.startsAt),
    durationMin: p.durationMin ?? null,
    completedAt: p.completedAt ? new Date(p.completedAt) : null,
  };
}

describe("estadoDeAgenda", () => {
  it("una hecha es realizada, aunque haya sido ayer o mañana", () => {
    expect(estadoDeAgenda(actividad({ startsAt: "2026-09-20T10:00:00Z", completedAt: "2026-09-20T11:00:00Z" }), reloj)).toBe("realizada");
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-03T10:00:00Z", completedAt: "2026-10-01T11:00:00Z" }), reloj)).toBe("realizada");
  });

  it("una pendiente de un día anterior está vencida", () => {
    expect(estadoDeAgenda(actividad({ startsAt: "2026-09-30T23:30:00Z" }), reloj)).toBe("vencida");
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-01T06:00:00Z" }), reloj)).not.toBe("vencida");
  });

  it("una pendiente que ya empezó y no ha terminado está en progreso; sin duración, media hora", () => {
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-01T15:30:00Z", durationMin: 60 }), reloj)).toBe("en_progreso");
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-01T15:45:00Z" }), reloj)).toBe("en_progreso");
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-01T15:00:00Z" }), reloj)).toBe("por_realizar");
  });

  it("lo que todavía no empieza, de hoy o de después, está por realizar", () => {
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-01T18:00:00Z" }), reloj)).toBe("por_realizar");
    expect(estadoDeAgenda(actividad({ startsAt: "2026-10-05T09:00:00Z" }), reloj)).toBe("por_realizar");
  });
});

describe("agruparPorEstado", () => {
  it("reparte en las cuatro cubetas y conserva el orden por fecha dentro de cada una", () => {
    const grupos = agruparPorEstado(
      [
        { id: "a", ...actividad({ startsAt: "2026-09-29T10:00:00Z" }) },
        { id: "b", ...actividad({ startsAt: "2026-10-01T15:45:00Z", durationMin: 30 }) },
        { id: "c", ...actividad({ startsAt: "2026-10-02T09:00:00Z" }) },
        { id: "d", ...actividad({ startsAt: "2026-09-28T09:00:00Z", completedAt: "2026-09-28T10:00:00Z" }) },
        { id: "e", ...actividad({ startsAt: "2026-09-30T09:00:00Z" }) },
      ],
      reloj,
    );
    expect(grupos.vencida.map((a) => a.id)).toEqual(["a", "e"]);
    expect(grupos.en_progreso.map((a) => a.id)).toEqual(["b"]);
    expect(grupos.por_realizar.map((a) => a.id)).toEqual(["c"]);
    expect(grupos.realizada.map((a) => a.id)).toEqual(["d"]);
  });
});

describe("semanaElegida · la semana que se ve vive en la URL (decisiones §44)", () => {
  const hoy = "2026-10-02"; // viernes

  it("sin parámetro, el lunes de la semana en curso", () => {
    expect(semanaElegida(undefined, hoy)).toBe("2026-09-28");
  });

  it("cualquier día de una semana se normaliza a su lunes", () => {
    expect(semanaElegida("2026-10-14", hoy)).toBe("2026-10-12");
    expect(semanaElegida("2026-10-12", hoy)).toBe("2026-10-12");
  });

  it("un valor que no es fecha vuelve a la semana en curso, sin romper", () => {
    expect(semanaElegida("ayer", hoy)).toBe("2026-09-28");
    expect(semanaElegida("2026-13-40", hoy)).toBe("2026-09-28");
    expect(semanaElegida(["2026-10-12", "x"], hoy)).toBe("2026-09-28");
  });
});

describe("relojDeAgenda · §49", () => {
  it("«hoy» empieza a la medianoche de la zona, no a la del servidor ni a la de UTC", () => {
    // 7-oct-2026 03:30Z es todavía la noche del 6 en Ciudad de México (UTC-6).
    const ahora = new Date("2026-10-07T03:30:00Z");
    const reloj = relojDeAgenda(ahora, "America/Mexico_City");
    expect(reloj.ahora).toBe(ahora);
    expect(reloj.inicioDeHoy.toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });

  it("con el reloj, una pendiente de ayer en la zona es vencida y una de hoy por realizar", () => {
    const reloj = relojDeAgenda(new Date("2026-10-07T15:00:00Z"), "America/Mexico_City");
    const base = { durationMin: 30, completedAt: null };
    expect(estadoDeAgenda({ ...base, startsAt: new Date("2026-10-07T04:00:00Z") }, reloj)).toBe("vencida");
    expect(estadoDeAgenda({ ...base, startsAt: new Date("2026-10-07T20:00:00Z") }, reloj)).toBe("por_realizar");
  });
});
