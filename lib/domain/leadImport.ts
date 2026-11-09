import type { CountryCode } from "@prisma/client";
import type { AltaDeProspecto } from "./lead";

/**
 * La previsualización de una importación de prospectos · decisiones §58.
 *
 * Pura: recibe las filas del CSV y los catálogos que el servidor ya trajo, y
 * devuelve fila por fila qué queda lista y qué falta, con todos los problemas
 * de la fila y no solo el primero. Nada se escribe aquí; eso es
 * `importarProspectos`, con las filas que salieron limpias.
 */
export const CABECERAS_DE_IMPORTACION = ["contacto", "correo", "telefono", "cargo", "empresa", "giro", "pais", "canal", "campana", "puntaje", "notas"] as const;
export type CabeceraDeImportacion = (typeof CABECERAS_DE_IMPORTACION)[number];

/** Lo que la plantilla muestra en la primera fila. */
export const ETIQUETA_DE_CABECERA: Record<CabeceraDeImportacion, string> = {
  contacto: "Contacto",
  correo: "Correo",
  telefono: "Teléfono",
  cargo: "Cargo",
  empresa: "Empresa",
  giro: "Giro",
  pais: "País",
  canal: "Canal",
  campana: "Campaña",
  puntaje: "Puntaje",
  notas: "Notas",
};

const OBLIGATORIAS: readonly CabeceraDeImportacion[] = ["contacto", "empresa", "pais", "canal"];
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAISES: ReadonlySet<string> = new Set<CountryCode>(["MX", "CO", "CL"]);

export type FilaValidada = {
  /** El número de fila en el archivo, contando la cabecera como 1. */
  fila: number;
  resumen: string;
  problemas: string[];
  /** Solo si no hay problemas. */
  datos?: AltaDeProspecto;
};

export type ContextoDeImportacion = {
  canales: { id: string; name: string }[];
  campanas: { id: string; name: string }[];
  /** Los países que la sesión alcanza para dar de alta. */
  paises: readonly CountryCode[];
  /** Correos (en minúsculas) con un prospecto abierto en la base. */
  correosAbiertos: ReadonlySet<string>;
};

/** «País», «PAIS», «pais» → `pais`; «Campaña» → `campana`. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function porNombre<T extends { name: string }>(lista: readonly T[], nombre: string): T | undefined {
  const n = normalizar(nombre);
  return lista.find((x) => normalizar(x.name) === n);
}

export function validarFilas(filas: readonly (readonly string[])[], ctx: ContextoDeImportacion): FilaValidada[] {
  const [cabecera, ...cuerpo] = filas;
  if (!cabecera) throw new Error("El archivo está vacío.");
  const indice = new Map<CabeceraDeImportacion, number>();
  cabecera.forEach((c, i) => {
    const n = normalizar(c) as CabeceraDeImportacion;
    if ((CABECERAS_DE_IMPORTACION as readonly string[]).includes(n)) indice.set(n, i);
  });
  const faltan = OBLIGATORIAS.filter((c) => !indice.has(c));
  if (faltan.length > 0) throw new Error(`Al archivo le faltan las columnas: ${faltan.join(", ")}.`);

  const vistos = new Set<string>();
  return cuerpo.map((valores, k) => {
    const v = (c: CabeceraDeImportacion) => (indice.has(c) ? (valores[indice.get(c)!] ?? "").trim() : "");
    const problemas: string[] = [];

    const contacto = v("contacto");
    if (contacto.length < 2) problemas.push("Falta el nombre del contacto.");
    const empresa = v("empresa");
    if (empresa.length < 2) problemas.push("Falta la empresa.");

    const paisTexto = v("pais").toUpperCase() as CountryCode;
    const pais = PAISES.has(paisTexto) ? paisTexto : null;
    if (!pais) problemas.push(`País «${v("pais")}» no reconocido (MX, CO o CL).`);
    else if (!ctx.paises.includes(pais)) problemas.push(`No operas en el país ${pais}.`);

    const canal = porNombre(ctx.canales, v("canal"));
    if (!canal) problemas.push(`Canal «${v("canal")}» no existe en el catálogo.`);

    const campanaTexto = v("campana");
    const campana = campanaTexto ? porNombre(ctx.campanas, campanaTexto) : undefined;
    if (campanaTexto && !campana) problemas.push(`Campaña «${campanaTexto}» no existe en el catálogo.`);

    const correo = v("correo").toLowerCase();
    if (correo && !FORMA_DE_CORREO.test(correo)) problemas.push(`El correo «${correo}» no tiene forma de correo.`);
    else if (correo && ctx.correosAbiertos.has(correo)) problemas.push(`El correo ${correo} ya tiene un prospecto abierto.`);
    else if (correo && vistos.has(correo)) problemas.push(`El correo ${correo} está repetido en el archivo.`);
    if (correo) vistos.add(correo);

    const puntajeTexto = v("puntaje");
    const puntaje = puntajeTexto === "" ? null : Number(puntajeTexto);
    if (puntaje !== null && (!Number.isInteger(puntaje) || puntaje < 0 || puntaje > 100)) problemas.push(`El puntaje «${puntajeTexto}» debe ir de 0 a 100.`);

    const resumen = [contacto || "(sin contacto)", empresa || "(sin empresa)"].join(" · ");
    if (problemas.length > 0 || !pais || !canal) return { fila: k + 2, resumen, problemas };

    return {
      fila: k + 2,
      resumen,
      problemas,
      datos: {
        contactName: contacto,
        email: correo || null,
        phone: v("telefono") || null,
        jobTitle: v("cargo") || null,
        companyName: empresa,
        companyIndustry: v("giro") || null,
        countryCode: pais,
        channelId: canal.id,
        campaignId: campana?.id ?? null,
        score: puntaje,
        notes: v("notas") || null,
      },
    };
  });
}
