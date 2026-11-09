import { describe, expect, it } from "vitest";
import { aCsv, parseCsv } from "./csv";

/**
 * CSV sin librería · decisiones §58. RFC 4180: coma, comillas dobles, comillas
 * escapadas duplicándolas, saltos de línea dentro de comillas, CRLF o LF, y un
 * BOM al principio que se ignora.
 */
describe("parseCsv", () => {
  it("lee filas y columnas con comillas, comas y saltos dentro de un campo", () => {
    const texto = 'contacto,empresa,notas\r\n"García, Laura",Novatek,"Dijo ""mañana""\ny colgó"\r\nCarlos,Alfa,\r\n';
    expect(parseCsv(texto)).toEqual([
      ["contacto", "empresa", "notas"],
      ["García, Laura", "Novatek", 'Dijo "mañana"\ny colgó'],
      ["Carlos", "Alfa", ""],
    ]);
  });

  it("ignora el BOM y las filas vacías del final", () => {
    expect(parseCsv("﻿a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("aCsv", () => {
  it("escribe con comillas solo lo que las necesita y escapa las comillas", () => {
    expect(aCsv([["a", "b c"], ['x,"y"', "l\nm"]])).toBe('a,b c\r\n"x,""y""","l\nm"\r\n');
  });

  it("ida y vuelta", () => {
    const filas = [["contacto", "notas"], ['O"Neil, Pat', "una, dos\ntres"]];
    expect(parseCsv(aCsv(filas))).toEqual(filas);
  });
});
