import { describe, expect, it } from "vitest";
import { INICIAL, reducirEdicion } from "./estadoDeEdicion";

/**
 * El estado de la tabla mientras se edita: modo, generación del formulario y el
 * borrador de celdas tecleadas. Puro, como los demás reductores de pantalla.
 */
describe("reducirEdicion", () => {
  it("empieza en lectura, sin borrador", () => {
    expect(INICIAL.editando).toBe(false);
    expect(INICIAL.borrador).toEqual({});
  });

  it("«editar» abre la edición sin tocar la generación", () => {
    const e = reducirEdicion(INICIAL, { tipo: "editar" });
    expect(e.editando).toBe(true);
    expect(e.generacion).toBe(INICIAL.generacion);
  });

  it("«teclear» guarda la celda por su nombre de campo", () => {
    const e = reducirEdicion(reducirEdicion(INICIAL, { tipo: "editar" }), {
      tipo: "teclear",
      nombre: "linea.abc.quantity",
      valor: "3",
    });
    expect(e.borrador).toEqual({ "linea.abc.quantity": "3" });
  });

  it("«cerrar» vuelve a lectura, sube la generación y vacía el borrador", () => {
    // Subir la generación remonta el formulario: los campos vuelven al valor
    // guardado, y un borrador viejo no puede pintar cifras de una edición
    // anterior.
    const abierta = reducirEdicion(reducirEdicion(INICIAL, { tipo: "editar" }), {
      tipo: "teclear",
      nombre: "linea.abc.quantity",
      valor: "3",
    });
    const e = reducirEdicion(abierta, { tipo: "cerrar" });
    expect(e.editando).toBe(false);
    expect(e.generacion).toBe(abierta.generacion + 1);
    expect(e.borrador).toEqual({});
  });

  it("teclear fuera de una celda de línea no ensucia el borrador", () => {
    const e = reducirEdicion(reducirEdicion(INICIAL, { tipo: "editar" }), {
      tipo: "teclear",
      nombre: "quoteId",
      valor: "x",
    });
    expect(e.borrador).toEqual({});
  });
});
