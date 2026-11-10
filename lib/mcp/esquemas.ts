import { z } from "zod";

/**
 * Los esquemas de las herramientas del servidor MCP · decisiones §61.
 *
 * **Fuente única.** De aquí el SDK deriva el JSON Schema que el cliente de IA
 * ve, con esto valida lo que manda antes de llamar a la herramienta, y con
 * esto mismo vuelve a validar el servicio de dominio. Los mensajes dicen el
 * límite y qué hacer distinto, porque quien los lee es un agente que va a
 * reintentar: «máximo 10 riesgos; prioriza» corrige, «inválido» no.
 *
 * Los límites de abajo **no son umbrales de negocio** (INV-05): son el tamaño
 * de lo que viaja por una herramienta, y viven aquí a propósito.
 */
export const LIMITES = {
  /** Oportunidades por página de `buscar_oportunidades`. */
  busqueda: 25,
  actividadesPorOmision: 20,
  actividadesMax: 50,
  /** Caracteres del extracto de una actividad en la lista. */
  extracto: 200,
  riesgos: 10,
  acciones: 10,
  huecos: 10,
  descripcion: 300,
  cita: 500,
  resumen: 600,
  modelo: 100,
  texto: 120,
} as const;

export const CAMPOS_DE_FECHA = ["CIERRE_ESTIMADO", "CIERRE_REAL", "CREACION", "ULTIMA_ACTIVIDAD"] as const;
export const ESTATUS = ["ABIERTA", "GANADA", "PERDIDA"] as const;
export const ETIQUETAS_DE_ESTADO = ["SALUDABLE", "EN_RIESGO", "CRITICA", "SIN_INFORMACION"] as const;

const id = (de: string) =>
  z.string().trim().min(1, `falta el ${de}.`).max(64, `un ${de} tiene como mucho 64 caracteres.`);

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato AAAA-MM-DD, por ejemplo 2026-10-01.");

const texto = (nombre: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${nombre} necesita al menos ${min} caracteres.`)
    .max(max, `${nombre} tiene como mucho ${max} caracteres; resume.`);

/** La forma, sin las reglas cruzadas: es lo que el SDK publica como JSON Schema. */
export const BuscarOportunidadesBase = z
  .object({
    etapa: texto("etapa", 1, 80).optional().describe("Nombre de la etapa, tal como aparece en el pipeline."),
    responsable: texto("responsable", 1, 120).optional().describe("Nombre o correo del vendedor propietario."),
    importe_min: z.number().nonnegative("importe_min no puede ser negativo.").optional().describe("Importe mínimo en USD."),
    importe_max: z.number().nonnegative("importe_max no puede ser negativo.").optional().describe("Importe máximo en USD."),
    estatus: z
      .enum(ESTATUS, { errorMap: () => ({ message: `usa uno de: ${ESTATUS.join(", ")}.` }) })
      .default("ABIERTA")
      .describe("ABIERTA por omisión."),
    campo_fecha: z
      .enum(CAMPOS_DE_FECHA, { errorMap: () => ({ message: `usa uno de: ${CAMPOS_DE_FECHA.join(", ")}.` }) })
      .optional()
      .describe("Sobre qué fecha aplica el rango desde/hasta. Obligatorio si das alguna de las dos."),
    desde: fecha.optional().describe("Inicio del rango, AAAA-MM-DD, inclusive."),
    hasta: fecha.optional().describe("Fin del rango, AAAA-MM-DD, inclusive."),
    texto: texto("texto", 1, LIMITES.texto).optional().describe("Busca en nombre, folio y cuenta."),
    cursor: z.string().max(200).optional().describe("El siguiente_cursor de la página anterior."),
  })
  .strict();

/** La entrada completa: la base más las reglas cruzadas (campo de fecha, importes). */
export const BuscarOportunidades = BuscarOportunidadesBase.superRefine((v, ctx) => {
    if ((v.desde || v.hasta) && !v.campo_fecha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["campo_fecha"],
        message: `si das desde o hasta, di sobre qué campo aplica el rango: ${CAMPOS_DE_FECHA.join(", ")}.`,
      });
    }
    if (v.importe_min !== undefined && v.importe_max !== undefined && v.importe_min > v.importe_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["importe_min"],
        message: `importe_min (${v.importe_min}) no puede superar a importe_max (${v.importe_max}).`,
      });
    }
  });

export const ObtenerOportunidad = z.object({ opportunity_id: id("opportunity_id") }).strict();

export const ListarActividades = z
  .object({
    opportunity_id: id("opportunity_id"),
    limit: z
      .number()
      .int("limit debe ser entero.")
      .min(1, "limit debe ser al menos 1.")
      .max(LIMITES.actividadesMax, `limit tiene como mucho ${LIMITES.actividadesMax}; pagina con cursor.`)
      .default(LIMITES.actividadesPorOmision),
    cursor: z.string().max(200).optional().describe("El siguiente_cursor de la página anterior."),
  })
  .strict();

export const ObtenerNota = z.object({ activity_id: id("activity_id") }).strict();

const Fuente = z
  .object({
    activity_id: id("activity_id").describe("Una actividad de listar_actividades de esta oportunidad."),
    cita: texto("la cita", 3, LIMITES.cita).describe("Fragmento textual de obtener_nota que sostiene el punto."),
  })
  .strict();

const ConFuente = z
  .object({
    descripcion: texto("la descripción", 3, LIMITES.descripcion),
    fuente: Fuente,
  })
  .strict();

const Hueco = z.object({ descripcion: texto("la descripción", 3, LIMITES.descripcion) }).strict();

export const GuardarRecomendacion = z
  .object({
    opportunity_id: id("opportunity_id"),
    estado: z
      .object({
        etiqueta: z.enum(ETIQUETAS_DE_ESTADO, {
          errorMap: () => ({ message: `usa una de: ${ETIQUETAS_DE_ESTADO.join(", ")}.` }),
        }),
        resumen: texto("el resumen", 10, LIMITES.resumen),
      })
      .strict(),
    riesgos: z.array(ConFuente).max(LIMITES.riesgos, `máximo ${LIMITES.riesgos} riesgos; prioriza.`),
    acciones: z
      .array(ConFuente)
      .min(1, "al menos una acción: una recomendación sin acción no sirve al vendedor.")
      .max(LIMITES.acciones, `máximo ${LIMITES.acciones} acciones; prioriza.`),
    huecos: z.array(Hueco).max(LIMITES.huecos, `máximo ${LIMITES.huecos} huecos; prioriza.`),
    model: texto("model", 1, LIMITES.modelo).optional().describe("El modelo que generó la recomendación."),
  })
  .strict();

export type EntradaDeBusqueda = z.infer<typeof BuscarOportunidades>;
export type EntradaDeActividades = z.infer<typeof ListarActividades>;
export type Recomendacion = z.infer<typeof GuardarRecomendacion>;
export type FuenteCitada = z.infer<typeof Fuente>;

// ─── Salidas ──────────────────────────────────────────────────────────────────
// Estrictas a propósito: una clave de más (un costo que se coló) hace fallar la
// validación de salida del SDK antes de que llegue al cliente (INV-02).

const fechaIso = z.string();

export const OportunidadDeLista = z
  .object({
    opportunity_id: z.string(),
    folio: z.string(),
    nombre: z.string(),
    cuenta: z.string(),
    etapa: z.string(),
    probabilidad: z.string(),
    importe_usd: z.string(),
    estatus: z.enum(ESTATUS),
    pronostico: z.string(),
    cierre_estimado: z.string().nullable(),
    propietario: z.string(),
    ultima_actividad: fechaIso.nullable(),
  })
  .strict();

export const SalidaDeBusqueda = z
  .object({ oportunidades: z.array(OportunidadDeLista), siguiente_cursor: z.string().nullable() })
  .strict();

export const FichaDeOportunidad = z
  .object({
    opportunity_id: z.string(),
    folio: z.string(),
    nombre: z.string(),
    estatus: z.enum(ESTATUS),
    pronostico: z.string(),
    tipo_de_negocio: z.string(),
    pais: z.string(),
    pipeline: z.string(),
    cuenta: z.object({ nombre: z.string(), industria: z.string().nullable(), ciudad: z.string().nullable() }).strict(),
    contacto_principal: z
      .object({ nombre: z.string(), puesto: z.string().nullable(), rol_en_comite: z.string().nullable() })
      .strict()
      .nullable(),
    propietario: z.string(),
    preventa: z.string().nullable(),
    etapa: z.object({ nombre: z.string(), probabilidad: z.string(), desde: fechaIso }).strict(),
    importe_usd: z.string(),
    importe_estimado_usd: z.string(),
    cotizacion: z.object({ neto_usd: z.string(), lineas: z.number() }).strict().nullable(),
    cierre_estimado: z.string().nullable(),
    cierre_real: z.string().nullable(),
    creada: fechaIso,
    ultima_actividad: fechaIso.nullable(),
    proxima_actividad: fechaIso.nullable(),
    total_de_actividades: z.number(),
    meddic: z
      .object({
        puntaje: z.number().nullable(),
        componentes: z.array(
          z
            .object({ componente: z.string(), estado: z.string(), evidencia: z.string().nullable(), persona: z.string().nullable() })
            .strict(),
        ),
      })
      .strict(),
    hitos: z.array(
      z.object({ descripcion: z.string(), vence: z.string().nullable(), importe_usd: z.string(), estado: z.string() }).strict(),
    ),
    banderas: z.array(
      z
        .object({
          bandera: z.string(),
          dias_sin_contacto: z.number().nullable().optional(),
          dias_en_etapa: z.number().optional(),
          limite: z.number().optional(),
        })
        .strict(),
    ),
    recomendaciones_previas: z.array(z.object({ fecha: fechaIso, etiqueta: z.string().nullable(), por: z.string() }).strict()),
  })
  .strict();

export const ActividadDeLista = z
  .object({
    activity_id: z.string(),
    tipo: z.string(),
    asunto: z.string(),
    fecha: fechaIso,
    duracion_min: z.number().nullable(),
    hecha: z.boolean(),
    responsable: z.string(),
    extracto: z.string().nullable(),
    tiene_transcripcion: z.boolean(),
    longitud_transcripcion: z.number(),
  })
  .strict();

export const SalidaDeActividades = z
  .object({ actividades: z.array(ActividadDeLista), siguiente_cursor: z.string().nullable() })
  .strict();

export const Nota = z
  .object({
    activity_id: z.string(),
    opportunity_id: z.string().nullable(),
    folio: z.string().nullable(),
    tipo: z.string(),
    asunto: z.string(),
    fecha: fechaIso,
    hecha: z.boolean(),
    responsable: z.string(),
    notas: z.string().nullable(),
    resultado: z.string().nullable(),
    transcripcion: z.string().nullable(),
  })
  .strict();

export const SalidaDeRecomendacion = z
  .object({ insight_id: z.string(), generated_at: fechaIso, version: z.number() })
  .strict();
