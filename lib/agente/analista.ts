import Anthropic from "@anthropic-ai/sdk";
import { opcionesDeCliente } from "./cliente";
import { mensajeDeCorreccion, mensajeDeExpediente, SISTEMA } from "./prompt";
import { FORMATO_DE_SALIDA } from "./salida";

/**
 * El analista: quien convierte un expediente en una ficha · decisiones §62.
 *
 * Es una interfaz para que el dominio no sepa de Anthropic y las pruebas
 * inyecten uno falso, igual que `Calendario` en las actividades (F-605).
 * `analistaClaude` es el único que llama a la API.
 */
export type PeticionDeAnalisis = {
  /** El expediente ya en texto (`textoDeExpediente`). */
  expediente: string;
  /** La segunda vuelta: lo que devolvió antes y por qué no sirvió. */
  correccion?: { salidaAnterior: string; problemas: { campo?: string; mensaje: string }[] };
};

export type RespuestaDeAnalista = {
  /** Lo que devolvió, ya como JSON; lo valida el dominio con `Analisis`. */
  salida: unknown;
  modelo: string;
  tokens: { entrada: number; salida: number };
};

export interface Analista {
  analizar(peticion: PeticionDeAnalisis): Promise<RespuestaDeAnalista>;
}

export const MODELO = "claude-opus-5-5";

/** Sin la llave el agente está apagado: nada falla, solo no analiza (como Graph sin AZURE_*). */
export function configurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function mensajesDe(p: PeticionDeAnalisis): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: mensajeDeExpediente(p.expediente) }];
  if (p.correccion) {
    mensajes.push(
      { role: "assistant", content: p.correccion.salidaAnterior },
      { role: "user", content: mensajeDeCorreccion(p.correccion.problemas) },
    );
  }
  return mensajes;
}

export function analistaClaude(): Analista {
  const client = new Anthropic(opcionesDeCliente(process.env));
  return {
    async analizar(p) {
      // Streaming con `finalMessage()`: el expediente puede ser largo y la
      // respuesta tardar; así no vence el tiempo de la petición. Opus 5.5
      // piensa siempre; el esfuerzo se fija explícito porque su omisión es
      // `medium` y conviene que quede escrito. `fallbacks: "default"`: si el
      // clasificador de seguridad declina, la API reintenta en otro modelo
      // dentro de la misma llamada.
      const stream = client.beta.messages.stream({
        model: MODELO,
        max_tokens: 16_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: FORMATO_DE_SALIDA },
        system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
        messages: mensajesDe(p),
      });
      const mensaje = await stream.finalMessage();

      if (mensaje.stop_reason === "refusal") {
        throw new Error(`El modelo declinó analizar (${mensaje.stop_details?.category ?? "sin categoría"}).`);
      }
      if (mensaje.stop_reason === "max_tokens") {
        throw new Error("La respuesta del modelo quedó truncada por longitud.");
      }

      const texto = mensaje.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let salida: unknown;
      try {
        salida = JSON.parse(texto);
      } catch {
        throw new Error("La respuesta del modelo no es JSON.");
      }

      const u = mensaje.usage;
      return {
        salida,
        modelo: mensaje.model,
        tokens: {
          entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          salida: u.output_tokens,
        },
      };
    },
  };
}
