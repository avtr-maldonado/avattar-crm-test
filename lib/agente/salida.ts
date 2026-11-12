import { ETIQUETAS_DE_ESTADO, GuardarRecomendacion } from "@/lib/mcp/esquemas";

/**
 * Lo que el agente devuelve · decisiones §62 y §64.
 *
 * Es la recomendación del MCP (§61) sin `opportunity_id` ni `model`: el agente
 * ya sabe de qué oportunidad habla y el modelo lo reporta la llamada, no la
 * salida. Una sola fuente de verdad para la IA que entra por el MCP y la que
 * corre dentro del CRM: límites, cardinalidades y mensajes son los mismos.
 */
export const Analisis = GuardarRecomendacion.omit({ opportunity_id: true, model: true }).strict();
export type AnalisisDeOportunidad = ReturnType<typeof Analisis.parse>;

/**
 * El JSON Schema que la API impone con salida estructurada.
 *
 * Solo formas: objetos cerrados, `required` completo y la enumeración. Los
 * límites de longitud y cardinalidad no van aquí porque la salida estructurada
 * no los soporta; los aplica `Analisis` después, con sus mensajes. Una prueba
 * verifica que las claves de uno y otro coinciden. La fuente de una
 * recomendación es obligatoria en forma pero admite `null` (§64).
 */
const texto = { type: "string" } as const;

const fuente = {
  type: "object",
  properties: {
    activity_id: { ...texto, description: "El activity_id de una actividad del expediente." },
    cita: { ...texto, description: "Fragmento textual de esa actividad, copiado tal cual." },
  },
  required: ["activity_id", "cita"],
  additionalProperties: false,
} as const;

const conFuente = {
  type: "object",
  properties: { descripcion: texto, fuente },
  required: ["descripcion", "fuente"],
  additionalProperties: false,
} as const;

const conFuenteOpcional = {
  type: "object",
  properties: { descripcion: texto, fuente: { anyOf: [fuente, { type: "null" }] } },
  required: ["descripcion", "fuente"],
  additionalProperties: false,
} as const;

export const FORMATO_DE_SALIDA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      estado: {
        type: "object",
        properties: {
          etiqueta: { type: "string", enum: [...ETIQUETAS_DE_ESTADO] },
          diagnostico: texto,
        },
        required: ["etiqueta", "diagnostico"],
        additionalProperties: false,
      },
      fortalezas: { type: "array", items: conFuente },
      riesgos: { type: "array", items: conFuente },
      siguientes_pasos: { type: "array", items: conFuente },
      recomendaciones: { type: "array", items: conFuenteOpcional },
    },
    required: ["estado", "fortalezas", "riesgos", "siguientes_pasos", "recomendaciones"],
    additionalProperties: false,
  },
} as const;
