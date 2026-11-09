/**
 * CSV sin librería · decisiones §58. RFC 4180: coma, comillas dobles, comillas
 * escapadas duplicándolas, saltos de línea dentro de un campo entre comillas,
 * CRLF o LF. Un BOM al principio se ignora al leer y se agrega al escribir,
 * que es lo que hace que Excel abra los acentos bien.
 */
export const BOM = "﻿";

export function parseCsv(texto: string): string[][] {
  const t = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < t.length; i += 1) {
    const c = t[i]!;
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  // Las filas vacías del final no son datos: un editor deja una línea en blanco.
  return filas.filter((f) => f.some((v) => v !== ""));
}

function celda(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function aCsv(filas: readonly (readonly string[])[]): string {
  return filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
