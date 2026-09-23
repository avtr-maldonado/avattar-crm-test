import type { EventoDeGraph } from "./evento";
import { configurado, tokenDeGraph } from "./token";

/**
 * Qué pasó con el calendario. Nunca una excepción: guardar la actividad en el
 * CRM no puede depender de que Microsoft conteste.
 */
export type ResultadoDeCalendario =
  | { estado: "SIN_CONFIGURAR" }
  | { estado: "OK"; eventId: string }
  | { estado: "FALLO"; detalle: string };

/**
 * El calendario, como lo ve el dominio.
 *
 * Es una interfaz y no un módulo para que `lib/domain/activity.ts` reciba uno
 * falso en sus pruebas y verifique **qué** le pidió al calendario —a quién,
 * con qué horas— sin salir a la red. En producción se usa `calendarioDeGraph`.
 */
export type Calendario = {
  configurado(): boolean;
  crear(correo: string, evento: EventoDeGraph): Promise<ResultadoDeCalendario>;
  actualizar(correo: string, eventId: string, evento: EventoDeGraph): Promise<ResultadoDeCalendario>;
  eliminar(correo: string, eventId: string): Promise<ResultadoDeCalendario>;
};

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * El calendario de Microsoft 365 vía Graph · F-605.
 *
 * Los eventos se escriben en el calendario del **responsable** de la
 * actividad, por su correo (`/users/{upn}/events`): con permiso de aplicación
 * eso funciona para cualquier persona del tenant, y el evento aparece como
 * suyo. Se usa el correo y no `entraObjectId` porque ese campo guarda hoy el
 * id de Supabase Auth, no el de Entra (decisiones §15).
 *
 * Una videollamada se pide como reunión de Teams con `isOnlineMeeting`: Graph
 * genera el enlace y lo pone en el evento. No hace falta `OnlineMeetings.*`.
 */
export const calendarioDeGraph: Calendario = {
  configurado,

  async crear(correo, evento) {
    return llamar("POST", `/users/${encodeURIComponent(correo)}/events`, evento);
  },

  async actualizar(correo, eventId, evento) {
    return llamar(
      "PATCH",
      `/users/${encodeURIComponent(correo)}/events/${encodeURIComponent(eventId)}`,
      evento,
      eventId,
    );
  },

  async eliminar(correo, eventId) {
    return llamar(
      "DELETE",
      `/users/${encodeURIComponent(correo)}/events/${encodeURIComponent(eventId)}`,
      undefined,
      eventId,
    );
  },
};

async function llamar(
  metodo: "POST" | "PATCH" | "DELETE",
  ruta: string,
  cuerpo?: EventoDeGraph,
  eventIdConocido?: string,
): Promise<ResultadoDeCalendario> {
  if (!configurado()) return { estado: "SIN_CONFIGURAR" };

  try {
    const token = await tokenDeGraph();
    const respuesta = await fetch(`${GRAPH}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(8_000),
    });

    // Borrar algo que ya no existe es haber terminado, no haber fallado.
    if (metodo === "DELETE" && (respuesta.status === 204 || respuesta.status === 404)) {
      return { estado: "OK", eventId: eventIdConocido ?? "" };
    }

    if (!respuesta.ok) {
      const texto = await respuesta.text().catch(() => "");
      return { estado: "FALLO", detalle: `Graph ${respuesta.status}: ${resumen(texto)}` };
    }

    if (metodo === "PATCH") return { estado: "OK", eventId: eventIdConocido ?? "" };

    const datos = (await respuesta.json()) as { id?: string };
    return datos.id
      ? { estado: "OK", eventId: datos.id }
      : { estado: "FALLO", detalle: "Graph no devolvió el id del evento." };
  } catch (e) {
    return { estado: "FALLO", detalle: e instanceof Error ? e.message : String(e) };
  }
}

/** El mensaje de error de Graph, si viene, sin arrastrar el JSON entero. */
function resumen(texto: string): string {
  try {
    const j = JSON.parse(texto) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message;
  } catch {
    /* no era JSON */
  }
  return texto.slice(0, 200);
}
