import type {
  CountryCode,
  ForecastCategory,
  OpportunityStatus,
  RiskFlag,
  Role,
} from "@/lib/dto";

/**
 * Los textos visibles · INV-14.
 *
 * «La UI siempre está en español. Identificadores en inglés, valores de negocio
 * y textos visibles en español.» Este módulo es donde se traduce lo uno a lo
 * otro, en un solo lugar: si el mapa vive junto a un componente, la segunda
 * pantalla que lo necesita lo copia y las dos se desincronizan.
 *
 * Va aquí y no en `components/ui` también por una razón práctica: un archivo de
 * componente que exporta cosas que no son componentes rompe el Fast Refresh de
 * React, que deja de preservar el estado al editar.
 */
export const ETIQUETA_ROL: Record<Role, string> = {
  VENDEDOR: "Vendedor",
  GERENTE_PAIS: "Gerente de país",
  DIRECCION: "Dirección",
  ADMINISTRADOR: "Administración",
  PREVENTA: "Preventa",
};

export const NOMBRE_PAIS: Record<CountryCode, string> = {
  MX: "México",
  CO: "Colombia",
  CL: "Chile",
};

export const ETIQUETA_ESTATUS: Record<OpportunityStatus, string> = {
  ABIERTA: "Abierta",
  GANADA: "Ganada",
  PERDIDA: "Perdida",
};

/**
 * RN-15 · la categoría de pronóstico es el juicio del vendedor, independiente
 * de la etapa. «Omitida» es dinero que existe pero no se pronostica.
 */
export const ETIQUETA_CATEGORIA: Record<ForecastCategory, string> = {
  COMPROMISO: "Compromiso",
  MEJOR_CASO: "Mejor caso",
  PIPELINE: "Pipeline",
  OMITIDA: "Omitida",
};

/**
 * Qué significa cada categoría de pronóstico, en una línea · RN-15.
 *
 * Es el juicio del vendedor sobre cuándo y con qué certeza cierra; no depende
 * de la etapa. Lo lee el icono de ayuda del campo «Pronóstico».
 */
export const DESCRIPCION_CATEGORIA: Record<ForecastCategory, string> = {
  COMPROMISO:
    "Te comprometes a cerrarla en el periodo: el cliente ya decidió y solo falta formalizar. Exige el puntaje MEDDIC mínimo (RN-29).",
  MEJOR_CASO:
    "Puede cerrar en el periodo si todo sale bien; todavía hay algo por resolver con el cliente.",
  PIPELINE:
    "Se está trabajando, sin fecha comprometida. Cuenta en el valor abierto, pero no en lo que se promete.",
  OMITIDA:
    "Fuera del pronóstico del periodo: sigue abierta y cuenta en el valor abierto, pero no en la mezcla del forecast.",
};

/** Las cuatro, en orden de certeza, listas para la ayuda emergente. */
export const AYUDA_DE_PRONOSTICO: { nombre: string; texto: string }[] = (
  ["COMPROMISO", "MEJOR_CASO", "PIPELINE", "OMITIDA"] as const
).map((c) => ({ nombre: ETIQUETA_CATEGORIA[c], texto: DESCRIPCION_CATEGORIA[c] }));

const MES_CORTO = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });

/** «oct 2026», sin el punto que `es-MX` a veces agrega a la abreviatura. */
export function etiquetaDeMes(anio: number, mes: number): string {
  const nombre = MES_CORTO.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(".", "");
  return `${nombre} ${anio}`;
}

/**
 * INV-11 · las banderas se calculan, no se capturan. Estas son sus etiquetas.
 *
 * Viven aquí y no en `lib/domain/riskFlags` porque ese módulo es lógica pura y
 * se prueba sin nada de presentación; mezclarle textos visibles lo ataría al
 * idioma de la interfaz.
 */
export const ETIQUETA_BANDERA: Record<RiskFlag, string> = {
  SIN_ACTIVIDAD: "Sin actividad",
  ESTANCADA: "Estancada",
};

/**
 * Las iniciales del avatar: nombre y primer apellido.
 *
 * Aquí y no en cada pantalla, porque «Miguel Maldonado» debe dar MM en la barra
 * lateral, en el encabezado y en la tarjeta. Dos implementaciones divergen en
 * cuanto una tenga que lidiar con un nombre compuesto.
 */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * El trimestre fiscal de una fecha `AAAA-MM-DD`, para anotar el campo de cierre
 * estimado: «T4 2026».
 *
 * `Q-02` · se asumió que el año fiscal de Avattar es el calendario. Si resulta
 * que no, este es el único lugar que hay que tocar para las anotaciones —los
 * cálculos de periodo ya leen `Country.fiscalYearStartMonth`.
 */
export function etiquetaDeTrimestre(iso: string): string | null {
  const [anio, mes] = iso.split("-").map(Number);
  if (!anio || !mes) return null;
  return `T${Math.floor((mes - 1) / 3) + 1} ${anio}`;
}

/**
 * La bandera de riesgo, escrita con el número que la justifica.
 *
 * §13: «Los errores dicen qué falta con el dato concreto: "faltan $200,000 por
 * asignar en hitos", no "datos inválidos".» La cola de riesgo del embudo vive
 * de esto: una lista que dice "Estancada" tres veces no ayuda a decidir cuál
 * atender primero.
 *
 * El texto se arma aquí y no en `lib/domain/riskFlags`, que devuelve la
 * evidencia como datos: así ese módulo se prueba sin presentación y el español
 * de la interfaz queda en un solo lugar (INV-14).
 *
 * `margen` y `piso` llegan ya formateados desde el servidor, porque un
 * `Decimal` no cruza a un componente cliente (INV-03).
 */
export type EvidenciaVisible =
  | { flag: "SIN_ACTIVIDAD"; diasSinContacto: number | null }
  | { flag: "ESTANCADA"; diasEnEtapa: number; limite: number };

export function fraseDeRiesgo(
  evidencia: EvidenciaVisible,
  contexto: { etapa: string },
): string {
  switch (evidencia.flag) {
    case "SIN_ACTIVIDAD":
      return evidencia.diasSinContacto === null
        ? "Sin actividad futura programada · nunca se registró contacto"
        : `Sin actividad futura programada · ${evidencia.diasSinContacto} días sin contacto`;
    case "ESTANCADA":
      return `Estancada ${evidencia.diasEnEtapa} días en ${contexto.etapa}`;
  }
}

/**
 * El tono de la bandera · §13.1: «si algo es coral, requiere atención».
 *
 * Coral para lo que cuesta dinero o clientes —margen bajo el piso, un negocio
 * sin siguiente paso—; lima para lo que todavía es un problema de proceso. La
 * cola de riesgo se ordena por valor, así que el color es lo que separa «esto
 * se está cayendo» de «esto va lento».
 */
export function tonoDeRiesgo(flag: RiskFlag): "peligro" | "alerta" {
  return flag === "ESTANCADA" ? "alerta" : "peligro";
}
