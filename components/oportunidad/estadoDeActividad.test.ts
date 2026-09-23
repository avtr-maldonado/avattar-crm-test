import { describe, expect, it } from "vitest";
import { estadoInicial, reducir, type EstadoDeActividad } from "./estadoDeActividad";

const LLAMADA = { id: "t1", name: "Llamada" };
const REUNION = { id: "t2", name: "Reunión presencial" };

const INICIAL = estadoInicial({ tipo: LLAMADA, fecha: "2026-09-29", inicio: "10:30", fin: "11:00" });

function elegir(estado: EstadoDeActividad, tipo: { id: string; name: string }) {
  return reducir(estado, { tipo: "ELEGIR_TIPO", id: tipo.id, nombre: tipo.name });
}

describe("el asunto se sugiere a partir del tipo", () => {
  it("arranca con el tipo dado y su nombre de asunto", () => {
    // Un formulario que ya viene lleno con lo más probable se despacha en dos
    // clics. Es la diferencia entre registrar la llamada y no registrarla.
    expect(INICIAL.tipoId).toBe("t1");
    expect(INICIAL.asunto).toBe("Llamada");
  });

  it("cambiar de tipo reescribe el asunto sugerido", () => {
    expect(elegir(INICIAL, REUNION).asunto).toBe("Reunión presencial");
  });

  it("lo que escribiste no se pisa al cambiar de tipo", () => {
    let e = reducir(INICIAL, { tipo: "ESCRIBIR_ASUNTO", asunto: "Cerrar condiciones" });
    e = elegir(e, REUNION);
    expect(e.asunto).toBe("Cerrar condiciones");
    expect(e.tipoId).toBe("t2");
  });

  it("borrar el asunto vuelve a dejarlo sugerible", () => {
    let e = reducir(INICIAL, { tipo: "ESCRIBIR_ASUNTO", asunto: "" });
    e = elegir(e, REUNION);
    expect(e.asunto).toBe("Reunión presencial");
  });

  it("al editar, el asunto guardado es del usuario y no se pisa", () => {
    // La actividad ya existía con su asunto. Cambiarle el tipo no debe
    // renombrarla: eso sí sería perder un dato.
    const e = estadoInicial({
      tipo: LLAMADA,
      asunto: "Llamada de cierre con Rodrigo",
      fecha: "2026-09-29",
      inicio: "10:30",
      fin: "11:00",
    });
    expect(elegir(e, REUNION).asunto).toBe("Llamada de cierre con Rodrigo");
  });
});

describe("inicio y fin van juntos", () => {
  it("mover el inicio arrastra el fin y conserva la duración", () => {
    // Quien cambia «10:30» por «11:00» está moviendo la reunión, no
    // acortándola. Es lo que hace cualquier calendario.
    const e = reducir(INICIAL, { tipo: "CAMBIAR_INICIO", inicio: "11:00" });
    expect(e.inicio).toBe("11:00");
    expect(e.fin).toBe("11:30");
  });

  it("mover el fin solo cambia el fin", () => {
    const e = reducir(INICIAL, { tipo: "CAMBIAR_FIN", fin: "11:45" });
    expect(e.inicio).toBe("10:30");
    expect(e.fin).toBe("11:45");
  });

  it("la fecha se cambia sola", () => {
    const e = reducir(INICIAL, { tipo: "CAMBIAR_FECHA", fecha: "2026-10-01" });
    expect(e.fecha).toBe("2026-10-01");
    expect(e.inicio).toBe("10:30");
  });

  it("un fin antes del inicio se queda como está: lo señala quien guarda", () => {
    // El reductor no adivina qué quiso decir el usuario. La duración negativa
    // se ve en la etiqueta y el servidor la rechaza con su campo.
    const e = reducir(INICIAL, { tipo: "CAMBIAR_FIN", fin: "09:00" });
    expect(e.fin).toBe("09:00");
  });
});

describe("hecha o por hacer", () => {
  it("nace por hacer: agendar es lo normal", () => {
    expect(INICIAL.hecha).toBe(false);
  });

  it("al editar una actividad hecha, arranca hecha", () => {
    const e = estadoInicial({
      tipo: LLAMADA,
      fecha: "2026-09-29",
      inicio: "10:30",
      fin: "11:00",
      hecha: true,
    });
    expect(e.hecha).toBe(true);
  });

  it("marcarla como hecha no toca lo capturado", () => {
    let e = reducir(INICIAL, { tipo: "ESCRIBIR_ASUNTO", asunto: "Llamada de cierre" });
    e = reducir(e, { tipo: "MARCAR_HECHA", hecha: true });
    expect(e).toMatchObject({ hecha: true, asunto: "Llamada de cierre", inicio: "10:30" });
  });
});

describe("limpiar", () => {
  it("devuelve el formulario a como estaba y avanza la generación", () => {
    let e = reducir(INICIAL, { tipo: "ESCRIBIR_ASUNTO", asunto: "Algo" });
    e = reducir(e, { tipo: "CAMBIAR_INICIO", inicio: "15:00" });
    expect(reducir(e, { tipo: "LIMPIAR", inicial: INICIAL })).toEqual({
      ...INICIAL,
      generacion: 1,
    });
  });

  it("cada limpieza remonta el formulario con una generación nueva", () => {
    const una = reducir(INICIAL, { tipo: "LIMPIAR", inicial: INICIAL });
    const dos = reducir(una, { tipo: "LIMPIAR", inicial: INICIAL });
    expect(dos.generacion).toBe(una.generacion + 1);
  });
});
