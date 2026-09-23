import { describe, expect, it } from "vitest";
import {
  ESTADO_INICIAL,
  nombreEsSugerido,
  reducir,
  type EstadoDeAlta,
} from "./estadoDeAlta";

const ACEROS = { tipo: "EXISTENTE", id: "o1", nombre: "Aceros del Norte" } as const;
const HIDRO = { tipo: "EXISTENTE", id: "o2", nombre: "Hidrosistemas del Valle" } as const;
const NUEVA = { tipo: "NUEVA", nombre: "Prueba Industrial" } as const;

function con(parcial: Partial<EstadoDeAlta>): EstadoDeAlta {
  return { ...ESTADO_INICIAL, ...parcial };
}

describe("el nombre se sugiere a partir de la organización", () => {
  it("elegir organización prellena «Nombre · »", () => {
    const e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    expect(e.nombre).toBe("Aceros del Norte · ");
    expect(nombreEsSugerido(e)).toBe(true);
  });

  it("una organización nueva sugiere igual que una existente", () => {
    const e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: NUEVA });
    expect(e.nombre).toBe("Prueba Industrial · ");
  });
});

describe("lo que el usuario escribió no se pisa", () => {
  it("cambiar de organización corrige el prefijo y conserva la descripción", () => {
    // Este es el caso que importa: alguien eligió mal la empresa, ya escribió
    // el servicio, y la corrige. Perder lo tecleado ahí es lo que hace que un
    // formulario se use una sola vez.
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "ESCRIBIR_NOMBRE", nombre: "Aceros del Norte · Servicios administrados" });
    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });

    expect(e.nombre).toBe("Hidrosistemas del Valle · Servicios administrados");
  });

  it("si el nombre no lleva el prefijo anterior, se deja intacto", () => {
    // Alguien borró todo y escribió algo propio. Reescribirle el prefijo sería
    // devolverle una decisión que ya había descartado.
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "ESCRIBIR_NOMBRE", nombre: "Renovación anual 2027" });
    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });

    expect(e.nombre).toBe("Renovación anual 2027");
  });

  it("mientras no lo toquen, el prefijo se reemplaza entero", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });

    expect(e.nombre).toBe("Hidrosistemas del Valle · ");
    expect(e.nombreTocado).toBe(false);
  });

  it("escribir marca el nombre como tocado, aunque coincida con el sugerido", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "ESCRIBIR_NOMBRE", nombre: "Aceros del Norte · " });
    expect(e.nombreTocado).toBe(true);
  });
});

describe("la persona cuelga de la organización", () => {
  it("cambiar de organización limpia la persona elegida", () => {
    // Sin esto quedaría ligado un contacto que no trabaja en esa empresa, y la
    // compuerta PERSONA_CON_ROL_DECLARADO se satisfaría con datos de otra.
    let e: EstadoDeAlta = con({ organizacion: ACEROS });
    e = reducir(e, {
      tipo: "ELEGIR_PERSONA",
      eleccion: { tipo: "EXISTENTE", id: "p1", nombre: "Luis Cantú" },
    });
    expect(e.persona.tipo).toBe("EXISTENTE");

    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });
    expect(e.persona).toEqual({ tipo: "VACIA" });
  });
});

describe("los contactos de la cuenta elegida", () => {
  const LISTA = [{ id: "p1", nombre: "Luis Cantú", detalle: "Director de sistemas" }];

  it("se guardan cuando llegan para la cuenta elegida", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "RECIBIR_CONTACTOS", de: "o1", lista: LISTA });
    expect(e.contactos).toEqual(LISTA);
  });

  it("se descartan si llegan para otra cuenta", () => {
    // Se eligió Aceros, se pidieron sus contactos y, antes de que llegaran, se
    // cambió a Hidrosistemas. Pintar la lista de Aceros ofrecería gente que no
    // trabaja en la empresa que se ve en pantalla.
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });
    e = reducir(e, { tipo: "RECIBIR_CONTACTOS", de: "o1", lista: LISTA });
    expect(e.contactos).toBeNull();
  });

  it("cambiar de cuenta olvida los de la anterior", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "RECIBIR_CONTACTOS", de: "o1", lista: LISTA });
    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: HIDRO });
    expect(e.contactos).toBeNull();
  });

  it("una cuenta nueva no tiene contactos", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "RECIBIR_CONTACTOS", de: "o1", lista: LISTA });
    e = reducir(e, { tipo: "ELEGIR_ORGANIZACION", eleccion: NUEVA });
    expect(e.contactos).toBeNull();
  });
});

describe("limpiar", () => {
  it("devuelve el formulario a como estaba y avanza la generación", () => {
    let e = reducir(ESTADO_INICIAL, { tipo: "ELEGIR_ORGANIZACION", eleccion: ACEROS });
    e = reducir(e, { tipo: "ESCRIBIR_NOMBRE", nombre: "Algo" });
    expect(reducir(e, { tipo: "LIMPIAR" })).toEqual({ ...ESTADO_INICIAL, generacion: 1 });
  });

  it("cada limpieza remonta el formulario con una generación nueva", () => {
    // La generación es la `key` del <form>: cambiarla es lo que devuelve a su
    // valor por omisión los campos no controlados que un envío rechazado conserva.
    const una = reducir(ESTADO_INICIAL, { tipo: "LIMPIAR" });
    const dos = reducir(una, { tipo: "LIMPIAR" });
    expect(dos.generacion).toBe(una.generacion + 1);
  });
});
