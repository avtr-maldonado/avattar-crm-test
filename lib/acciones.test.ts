import { describe, expect, it } from "vitest";
import {
  SIN_CORRECCIONES,
  corregir,
  falla,
  problemaPendiente,
  darPorVisto,
} from "./acciones";

const IMPORTE = { campo: "estimatedAmount", mensaje: "Escribe el importe en dólares." };
const NOMBRE = { campo: "name", mensaje: "Ponle nombre a la oportunidad." };

const primerIntento = falla("VALIDACION", IMPORTE, NOMBRE);
const segundoIntento = falla("VALIDACION", IMPORTE);

describe("los problemas de un campo se apagan al corregirlo", () => {
  it("sin correcciones, cada campo muestra su problema", () => {
    expect(problemaPendiente(primerIntento, SIN_CORRECCIONES, "estimatedAmount")).toBe(IMPORTE.mensaje);
    expect(problemaPendiente(primerIntento, SIN_CORRECCIONES, "name")).toBe(NOMBRE.mensaje);
  });

  it("corregir un campo apaga su problema y deja los demás encendidos", () => {
    const c = corregir(SIN_CORRECCIONES, primerIntento, "estimatedAmount");

    expect(problemaPendiente(primerIntento, c, "estimatedAmount")).toBeUndefined();
    expect(problemaPendiente(primerIntento, c, "name")).toBe(NOMBRE.mensaje);
  });

  it("un resultado nuevo vuelve a mostrar el problema aunque el campo se corrigiera antes", () => {
    // Se corrigió el importe, se reenvió y el servidor volvió a rechazarlo:
    // ese rechazo es nuevo y tiene que verse, o el usuario cree que ya pasó.
    const c = corregir(SIN_CORRECCIONES, primerIntento, "estimatedAmount");

    expect(problemaPendiente(segundoIntento, c, "estimatedAmount")).toBe(IMPORTE.mensaje);
  });

  it("corregir sobre un resultado nuevo descarta las correcciones del anterior", () => {
    let c = corregir(SIN_CORRECCIONES, primerIntento, "estimatedAmount");
    c = corregir(c, segundoIntento, "name");

    expect(c.campos.has("estimatedAmount")).toBe(false);
    expect(c.campos.has("name")).toBe(true);
  });

  it("no muta las correcciones anteriores", () => {
    const antes = corregir(SIN_CORRECCIONES, primerIntento, "name");
    corregir(antes, primerIntento, "estimatedAmount");

    expect(antes.campos.has("estimatedAmount")).toBe(false);
  });

  it("sin resultado no hay problema que apagar", () => {
    expect(problemaPendiente(null, SIN_CORRECCIONES, "name")).toBeUndefined();
  });
});

describe("un resultado no sobrevive al cierre del panel · §51", () => {
  const rechazo = () => falla("VALIDACION", { campo: "name", mensaje: "Pon el nombre." });

  it("al cerrar, el resultado que quedaba en pantalla se da por visto", () => {
    const r = rechazo();
    const abierto = { abierto: true, descartado: null };
    const cerrado = darPorVisto(abierto, r, false);
    expect(cerrado).toEqual({ abierto: false, descartado: r });
  });

  it("al reabrir sigue dado por visto: el panel no vuelve señalando lo de antes", () => {
    const r = rechazo();
    const cerrado = darPorVisto({ abierto: true, descartado: null }, r, false);
    const reabierto = darPorVisto(cerrado, r, true);
    expect(reabierto.descartado).toBe(r);
  });

  it("un envío nuevo se ve, aunque rechace lo mismo", () => {
    const primero = rechazo();
    const cerrado = darPorVisto({ abierto: true, descartado: null }, primero, false);
    const segundo = rechazo();
    expect(segundo).not.toBe(primero);
    expect(cerrado.descartado).not.toBe(segundo);
  });

  it("sin cambio de apertura devuelve el mismo objeto, para no re-renderizar de más", () => {
    const visto = { abierto: true, descartado: null };
    expect(darPorVisto(visto, rechazo(), true)).toBe(visto);
  });
});
