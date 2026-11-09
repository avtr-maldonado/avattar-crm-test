import { describe, expect, it } from "vitest";
import { estadoInicialDeConversion, reducirConversion, type Coincidencias, type Prellenado } from "./estadoDeConversion";

const PROSPECTO: Prellenado = { companyName: "Novatek S.A.", companyIndustry: "Tecnología", contactName: "Laura García", jobTitle: "Gerente de TI", email: "laura@novatek.com", phone: null };
const NOVATEK = { id: "o1", nombre: "Novatek S.A.", detalle: "Prospecto · CDMX" };
const LAURA = { id: "p1", nombre: "Laura García", detalle: "Gerente de TI" };
const SIN_COINCIDENCIAS: Coincidencias = { cuenta: null, contactos: [], persona: null };

describe("estadoInicialDeConversion · lo que el servidor encontró decide cómo arranca", () => {
  it("con cuenta y persona existentes, arranca con las dos elegidas y los contactos cargados", () => {
    const e = estadoInicialDeConversion(PROSPECTO, { cuenta: NOVATEK, contactos: [LAURA], persona: LAURA });
    expect(e.cuenta).toEqual({ tipo: "EXISTENTE", id: "o1", nombre: "Novatek S.A." });
    expect(e.persona).toEqual({ tipo: "EXISTENTE", id: "p1", nombre: "Laura García" });
    expect(e.contactos).toEqual([LAURA]);
  });

  it("con cuenta existente y sin persona, la persona es nueva con el nombre del prospecto", () => {
    const e = estadoInicialDeConversion(PROSPECTO, { cuenta: NOVATEK, contactos: [], persona: null });
    expect(e.cuenta.tipo).toBe("EXISTENTE");
    expect(e.persona).toEqual({ tipo: "NUEVA", nombre: "Laura García" });
  });

  it("sin coincidencias, cuenta y persona nuevas con los datos del prospecto", () => {
    const e = estadoInicialDeConversion(PROSPECTO, SIN_COINCIDENCIAS);
    expect(e.cuenta).toEqual({ tipo: "NUEVA", nombre: "Novatek S.A." });
    expect(e.persona).toEqual({ tipo: "NUEVA", nombre: "Laura García" });
    expect(e.contactos).toBeNull();
  });
});

describe("reducirConversion · cambiar de cuenta reinicia a la persona", () => {
  const inicial = estadoInicialDeConversion(PROSPECTO, { cuenta: NOVATEK, contactos: [LAURA], persona: LAURA });

  it("elegir otra cuenta existente vuelve a la persona nueva del prospecto y espera sus contactos", () => {
    const e = reducirConversion(inicial, { tipo: "ELEGIR_CUENTA", eleccion: { tipo: "EXISTENTE", id: "o2", nombre: "Hidrosistemas" } });
    expect(e.persona).toEqual({ tipo: "NUEVA", nombre: "Laura García" });
    expect(e.contactos).toBeNull();
  });

  it("los contactos que llegan solo se aceptan si son de la cuenta vigente", () => {
    const e = reducirConversion(inicial, { tipo: "ELEGIR_CUENTA", eleccion: { tipo: "EXISTENTE", id: "o2", nombre: "Hidrosistemas" } });
    expect(reducirConversion(e, { tipo: "RECIBIR_CONTACTOS", de: "o1", lista: [LAURA] }).contactos).toBeNull();
    const otro = { id: "p9", nombre: "Pedro", detalle: null };
    expect(reducirConversion(e, { tipo: "RECIBIR_CONTACTOS", de: "o2", lista: [otro] }).contactos).toEqual([otro]);
  });

  it("una cuenta nueva deja a la persona nueva y sin lista; elegir persona existente la fija", () => {
    const nueva = reducirConversion(inicial, { tipo: "ELEGIR_CUENTA", eleccion: { tipo: "NUEVA", nombre: "Otra Empresa" } });
    expect(nueva.persona).toEqual({ tipo: "NUEVA", nombre: "Laura García" });
    expect(nueva.contactos).toBeNull();
    const fijada = reducirConversion(inicial, { tipo: "ELEGIR_PERSONA", eleccion: { tipo: "EXISTENTE", id: "p2", nombre: "Ana" } });
    expect(fijada.persona).toEqual({ tipo: "EXISTENTE", id: "p2", nombre: "Ana" });
  });
});
