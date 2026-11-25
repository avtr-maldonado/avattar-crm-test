import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ETIQUETA_DE_CABECERA, CABECERAS_DE_IMPORTACION } from "./leadImport";
import { esXlsx, leerXlsx, plantillaXlsx } from "./xlsx";

/** Importación y plantilla de prospectos en Excel · decisiones §69. */
async function libroCon(filas: ExcelJS.CellValue[][]): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Prospectos");
  for (const f of filas) hoja.addRow(f);
  const buffer = await libro.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("esXlsx", () => {
  it("reconoce el archivo por su extensión, sin importar mayúsculas", () => {
    expect(esXlsx("prospectos.XLSX")).toBe(true);
    expect(esXlsx("prospectos.csv")).toBe(false);
  });
});

describe("leerXlsx", () => {
  it("devuelve la primera hoja como texto, fila por fila", async () => {
    const libro = await libroCon([
      ["Contacto", "Correo", "Teléfono", "Puntaje"],
      ["Laura García", "laura@novatek.com", "+52 55 9876 5432", "82"],
    ]);
    expect(await leerXlsx(libro)).toEqual([
      ["Contacto", "Correo", "Teléfono", "Puntaje"],
      ["Laura García", "laura@novatek.com", "+52 55 9876 5432", "82"],
    ]);
  });

  it("los números que Excel guarda como número se leen como texto sin notación científica", async () => {
    const libro = await libroCon([["Teléfono", "Puntaje"], [525598765432, 82]]);
    expect((await leerXlsx(libro))[1]).toEqual(["525598765432", "82"]);
  });

  it("un correo que Excel volvió enlace se lee como su texto", async () => {
    const libro = await libroCon([["Correo"], [{ text: "laura@novatek.com", hyperlink: "mailto:laura@novatek.com" }]]);
    expect((await leerXlsx(libro))[1]).toEqual(["laura@novatek.com"]);
  });

  it("las celdas vacías en medio quedan como texto vacío y las filas vacías del final se descartan", async () => {
    const libro = await libroCon([["A", "B", "C"], ["uno", null, "tres"], [], []]);
    expect(await leerXlsx(libro)).toEqual([
      ["A", "B", "C"],
      ["uno", "", "tres"],
    ]);
  });

  it("un archivo que no es Excel se rechaza con un mensaje en español", async () => {
    await expect(leerXlsx(new TextEncoder().encode("no soy excel").buffer as ArrayBuffer)).rejects.toThrow("No se pudo leer el archivo como Excel.");
  });
});

describe("plantillaXlsx", () => {
  const catalogos = {
    canales: [{ name: "Web" }, { name: "LinkedIn" }],
    campanas: [{ name: "Demo CRM Q4" }],
  };

  it("trae la cabecera de la importación y una fila de ejemplo con un canal que existe", async () => {
    const filas = await leerXlsx(await plantillaXlsx(catalogos));
    expect(filas[0]).toEqual(CABECERAS_DE_IMPORTACION.map((c) => ETIQUETA_DE_CABECERA[c]));
    expect(filas[1][CABECERAS_DE_IMPORTACION.indexOf("canal")]).toBe("Web");
    expect(filas[1][CABECERAS_DE_IMPORTACION.indexOf("campana")]).toBe("Demo CRM Q4");
  });

  it("País, Canal y Campaña llevan lista desplegable con los catálogos activos", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await plantillaXlsx(catalogos));
    const hoja = libro.getWorksheet("Prospectos")!;
    const columna = (c: (typeof CABECERAS_DE_IMPORTACION)[number]) => CABECERAS_DE_IMPORTACION.indexOf(c) + 1;
    for (const c of ["pais", "canal", "campana"] as const) {
      expect(hoja.getCell(2, columna(c)).dataValidation?.type).toBe("list");
      expect(hoja.getCell(500, columna(c)).dataValidation?.type).toBe("list");
    }
    const listas = libro.getWorksheet("Listas")!;
    const valores = listas.getSheetValues().flat().filter((v) => typeof v === "string");
    expect(valores).toEqual(expect.arrayContaining(["MX", "CO", "CL", "Web", "LinkedIn", "Demo CRM Q4"]));
  });

  it("el teléfono va con formato de texto, para que Excel no se coma el +52", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await plantillaXlsx(catalogos));
    const hoja = libro.getWorksheet("Prospectos")!;
    expect(hoja.getColumn(CABECERAS_DE_IMPORTACION.indexOf("telefono") + 1).numFmt).toBe("@");
  });
});
