import { describe, expect, it } from "vitest";
import { CABECERAS_DE_IMPORTACION, validarFilas } from "./leadImport";

/**
 * La previsualización de una importación · decisiones §58. Fila por fila dice
 * qué está bien y qué no, sin tocar la base: canal o campaña que no existe,
 * país fuera del alcance, correo mal formado, correo que ya tiene un prospecto
 * abierto o repetido dentro del mismo archivo.
 */
const ctx = {
  canales: [{ id: "c-web", name: "Web" }, { id: "c-evento", name: "Evento" }],
  campanas: [{ id: "k-demo", name: "Demo CRM Q4" }],
  paises: ["MX" as const],
  correosAbiertos: new Set(["ya@existe.com"]),
};

const cab = [...CABECERAS_DE_IMPORTACION];
const fila = (v: Partial<Record<(typeof CABECERAS_DE_IMPORTACION)[number], string>>) => cab.map((c) => v[c] ?? "");

describe("validarFilas", () => {
  it("una fila completa queda lista, con el canal y la campaña resueltos por nombre sin distinguir mayúsculas", () => {
    const r = validarFilas([cab, fila({ contacto: "Laura García", correo: "laura@novatek.com", empresa: "Novatek", pais: "MX", canal: "web", campana: "demo crm q4", puntaje: "82" })], ctx);
    expect(r).toHaveLength(1);
    expect(r[0]!.problemas).toEqual([]);
    expect(r[0]!.datos).toMatchObject({ contactName: "Laura García", email: "laura@novatek.com", companyName: "Novatek", countryCode: "MX", channelId: "c-web", campaignId: "k-demo", score: 82 });
  });

  it("dice qué falta en cada fila, todo junto", () => {
    const r = validarFilas([cab, fila({ contacto: "A", empresa: "", pais: "CO", canal: "Fax", campana: "Nada", correo: "no-es", puntaje: "200" })], ctx);
    expect(r[0]!.datos).toBeUndefined();
    expect(r[0]!.problemas.join(" ")).toMatch(/nombre/);
    expect(r[0]!.problemas.join(" ")).toMatch(/empresa/);
    expect(r[0]!.problemas.join(" ")).toMatch(/país/i);
    expect(r[0]!.problemas.join(" ")).toMatch(/canal/i);
    expect(r[0]!.problemas.join(" ")).toMatch(/campaña/i);
    expect(r[0]!.problemas.join(" ")).toMatch(/correo/);
    expect(r[0]!.problemas.join(" ")).toMatch(/puntaje/);
  });

  it("marca duplicados: contra lo abierto en la base y dentro del archivo", () => {
    const r = validarFilas(
      [cab, fila({ contacto: "Uno", empresa: "Empresa", pais: "MX", canal: "Web", correo: "YA@existe.com" }), fila({ contacto: "Dos", empresa: "Empresa", pais: "MX", canal: "Web", correo: "x@y.com" }), fila({ contacto: "Tres", empresa: "Empresa", pais: "MX", canal: "Web", correo: "x@y.com" })],
      ctx,
    );
    expect(r[0]!.problemas.join(" ")).toMatch(/ya tiene un prospecto abierto/);
    expect(r[1]!.problemas).toEqual([]);
    expect(r[2]!.problemas.join(" ")).toMatch(/repetido en el archivo/);
  });

  it("acepta cabeceras con otra capitalización y acentos, y rechaza un archivo sin las obligatorias", () => {
    const r = validarFilas([["CONTACTO", "Empresa", "País", "Canal"], ["Laura", "Novatek", "MX", "Web"]], ctx);
    expect(r[0]!.problemas).toEqual([]);
    expect(() => validarFilas([["nombre", "empresa"], ["x", "y"]], ctx)).toThrow(/contacto/);
  });

  it("la numeración de fila es la del archivo, contando la cabecera", () => {
    const r = validarFilas([cab, fila({ contacto: "Laura", empresa: "N", pais: "MX", canal: "Web" })], ctx);
    expect(r[0]!.fila).toBe(2);
  });
});
