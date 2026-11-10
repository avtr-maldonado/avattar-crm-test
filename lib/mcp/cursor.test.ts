import { describe, expect, it } from "vitest";
import { codificarCursor, CursorDeActividades, CursorDeBusqueda, decodificarCursor } from "./cursor";

/** El cursor es opaco para el agente: ida y vuelta exacta, y lo corrupto se detecta. */
describe("cursor", () => {
  it("ida y vuelta de un cursor de actividades", () => {
    const c = codificarCursor({ startsAt: "2026-11-09T17:00:00.000Z", id: "act_9" });
    expect(c).not.toMatch(/[+/=]/); // base64url: viaja en una URL o en JSON sin escapes
    expect(decodificarCursor(c, CursorDeActividades)).toEqual({ ok: true, valor: { startsAt: "2026-11-09T17:00:00.000Z", id: "act_9" } });
  });

  it("sin cursor es la primera página", () => {
    expect(decodificarCursor(undefined, CursorDeBusqueda)).toEqual({ ok: true, valor: null });
  });

  it("un cursor corrupto o de otra herramienta se rechaza, no se reinicia en silencio", () => {
    expect(decodificarCursor("no-es-base64-json", CursorDeBusqueda)).toEqual({ ok: false });
    const deActividades = codificarCursor({ startsAt: "2026-11-09T17:00:00.000Z", id: "act_9" });
    expect(decodificarCursor(deActividades, CursorDeBusqueda)).toEqual({ ok: false });
  });
});
