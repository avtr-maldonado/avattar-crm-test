import ExcelJS from "exceljs";
import { CABECERAS_DE_IMPORTACION, ETIQUETA_DE_CABECERA, type CabeceraDeImportacion } from "./leadImport";

/**
 * Prospectos en Excel · decisiones §69. Leer un `.xlsx` como las mismas filas
 * de texto que da `parseCsv`, para que la validación sea una sola, y armar la
 * plantilla con listas desplegables de los catálogos activos.
 *
 * Solo servidor: `exceljs` no entra al navegador.
 */
const PAISES = ["MX", "CO", "CL"] as const;
/** Hasta dónde llegan las listas desplegables de la plantilla. */
const FILAS_CON_LISTA = 1000;

export function esXlsx(nombre: string): boolean {
  return nombre.toLowerCase().endsWith(".xlsx");
}

/** El texto de una celda, como lo vería quien la capturó. */
function textoDe(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  // Excel guarda como número lo que parece número: teléfonos, puntajes. Sin
  // `toLocaleString` ni exponente, el dígito que se tecleó.
  if (typeof v === "number") return Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return textoDe(v.text as ExcelJS.CellValue);
  if ("result" in v) return textoDe(v.result as ExcelJS.CellValue);
  if ("error" in v) return "";
  return String(v);
}

/** La primera hoja del libro como filas de texto. Las filas vacías del final se descartan. */
export async function leerXlsx(archivo: ArrayBuffer): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo);
  } catch {
    throw new Error("No se pudo leer el archivo como Excel.");
  }
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error("No se pudo leer el archivo como Excel.");

  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila) => {
    const celdas: string[] = [];
    for (let c = 1; c <= fila.cellCount; c++) celdas.push(textoDe(fila.getCell(c).value).trim());
    filas.push(celdas);
  });
  while (filas.length > 0 && filas[filas.length - 1].every((c) => c === "")) filas.pop();
  return filas;
}

function letra(columna: number): string {
  return String.fromCharCode("A".charCodeAt(0) + columna - 1);
}

/**
 * La plantilla de importación: la hoja «Prospectos» con la cabecera y una fila
 * de ejemplo, y la hoja oculta «Listas» de donde salen los desplegables de
 * País, Canal y Campaña. Los catálogos son los activos al descargarla.
 */
export async function plantillaXlsx(catalogos: { canales: { name: string }[]; campanas: { name: string }[] }): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Prospectos", { views: [{ state: "frozen", ySplit: 1 }] });
  const listas = libro.addWorksheet("Listas", { state: "hidden" });

  const col = (c: CabeceraDeImportacion) => CABECERAS_DE_IMPORTACION.indexOf(c) + 1;

  hoja.addRow(CABECERAS_DE_IMPORTACION.map((c) => ETIQUETA_DE_CABECERA[c]));
  hoja.getRow(1).font = { bold: true };
  const ejemplo: Record<CabeceraDeImportacion, string> = {
    contacto: "Laura García",
    correo: "laura.garcia@novatek.com",
    telefono: "+52 55 9876 5432",
    cargo: "Gerente de TI",
    empresa: "Novatek S.A.",
    giro: "Tecnología",
    pais: "MX",
    canal: catalogos.canales[0]?.name ?? "",
    campana: catalogos.campanas[0]?.name ?? "",
    puntaje: "82",
    notas: "Pidió una demo del CRM",
  };
  hoja.addRow(CABECERAS_DE_IMPORTACION.map((c) => ejemplo[c]));
  CABECERAS_DE_IMPORTACION.forEach((c) => {
    hoja.getColumn(col(c)).width = Math.max(14, ETIQUETA_DE_CABECERA[c].length + 4);
  });
  // Texto, para que Excel no convierta «+52 55…» en número.
  hoja.getColumn(col("telefono")).numFmt = "@";

  const fuentes: [CabeceraDeImportacion, readonly string[]][] = [
    ["pais", PAISES],
    ["canal", catalogos.canales.map((c) => c.name)],
    ["campana", catalogos.campanas.map((c) => c.name)],
  ];
  fuentes.forEach(([cabecera, valores], i) => {
    const columnaEnListas = i + 1;
    listas.getCell(1, columnaEnListas).value = ETIQUETA_DE_CABECERA[cabecera];
    valores.forEach((v, j) => (listas.getCell(j + 2, columnaEnListas).value = v));
    if (valores.length === 0) return;
    const rango = `Listas!$${letra(columnaEnListas)}$2:$${letra(columnaEnListas)}$${valores.length + 1}`;
    for (let fila = 2; fila <= FILAS_CON_LISTA; fila++) {
      hoja.getCell(fila, col(cabecera)).dataValidation = {
        type: "list",
        // La campaña es opcional: vacía no es error.
        allowBlank: true,
        formulae: [rango],
        showErrorMessage: true,
        errorTitle: ETIQUETA_DE_CABECERA[cabecera],
        error: `Elige un valor de la lista de ${ETIQUETA_DE_CABECERA[cabecera].toLowerCase()}.`,
      };
    }
  });

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}
