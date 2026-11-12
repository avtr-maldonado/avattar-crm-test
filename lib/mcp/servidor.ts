import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCallResult } from "@prisma/client";
import type { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { registrarLlamadaMcp } from "@/lib/audit/mcp";
import { guardarRecomendacion } from "@/lib/domain/insight";
import { explainRiskFlags } from "@/lib/domain/riskFlags";
import { parseFilters, toWhere } from "@/lib/filters/opportunities";
import { AGENTE } from "@/lib/domain/bitacora";
import { listInsights } from "@/lib/scope/insights";
import {
  actividadesDeOportunidad,
  actividadPorId,
  buscarOportunidades,
  etapasPorNombre,
  nombresDeEtapas,
  totalDeActividades,
  usuariosPorNombre,
} from "@/lib/scope/mcp";
import { getOpportunity } from "@/lib/scope/opportunities";
import { getOpportunityDetail } from "@/lib/scope/opportunityDetail";
import { permiteAlcance, type Alcance, type SesionMcp } from "./auth";
import { codificarCursor, CursorDeActividades, CursorDeBusqueda, decodificarCursor } from "./cursor";
import { aActividadDeLista, aFichaDeOportunidad, aNota, aOportunidadDeLista } from "./dto";
import {
  BuscarOportunidades,
  BuscarOportunidadesBase,
  FichaDeOportunidad,
  GuardarRecomendacion,
  LIMITES,
  ListarActividades,
  Nota,
  ObtenerNota,
  ObtenerOportunidad,
  SalidaDeActividades,
  SalidaDeBusqueda,
  SalidaDeRecomendacion,
} from "./esquemas";
import { respuestaDeHerramienta, type RespuestaDeHerramienta } from "./resultado";

/**
 * El servidor MCP del CRM · decisiones §61.
 *
 * Un `McpServer` por request, armado con la sesión que el bearer resolvió:
 * cada herramienta lee por `lib/scope` con esa sesión y nada más. Aquí no hay
 * reglas de negocio: hay traducción de la entrada del agente a los lectores y
 * al servicio, y del `ResultadoAccion` a la respuesta de la herramienta. Cada
 * llamada deja su fila en `mcp_tool_calls`, termine como termine.
 *
 * Los esquemas Zod de `./esquemas` son la fuente única: el SDK publica de ahí
 * el JSON Schema, valida la entrada antes de llamar y la salida antes de
 * responder (una clave de costo que se colara haría fallar la salida).
 */
const INSTRUCCIONES = `CRM de ventas de Avattar. Flujo para analizar una oportunidad:
1. buscar_oportunidades para ubicarla (o usa el opportunity_id que te dio el usuario).
2. obtener_oportunidad una sola vez: etapa, MEDDIC, hitos, banderas y recomendaciones previas.
3. listar_actividades para ver qué pasó; obtener_nota solo en las actividades que vas a citar.
4. guardar_recomendacion con diagnóstico, fortalezas, riesgos, siguientes pasos (tareas pendientes y reuniones) y recomendaciones; cada punto con fuente cita activity_id y un fragmento textual de obtener_nota.
Los resultados están acotados al usuario autorizado; no existe forma de volcar el pipeline completo.`;

type Ejecucion<T> = Promise<{ resultado: ResultadoAccion<T>; opportunityId?: string | null }>;

type Definicion<In extends z.ZodTypeAny, Out extends z.ZodTypeAny> = {
  nombre: string;
  titulo: string;
  descripcion: string;
  alcance: Alcance;
  /** Lo que el SDK publica y valida. */
  forma: In;
  /** Lo que el servidor exige, con las reglas cruzadas; suele ser `forma`. */
  entrada: z.ZodType<z.infer<In>, z.ZodTypeDef, unknown>;
  salida: Out;
  soloLectura: boolean;
  ejecutar: (args: z.infer<In>, sesion: SesionMcp) => Ejecucion<z.infer<Out>>;
};

const ERROR_INTERNO = "Error interno del CRM; reintenta. Si persiste, avisa a Administración.";

function registrar<In extends z.ZodTypeAny, Out extends z.ZodTypeAny>(server: McpServer, sesion: SesionMcp, def: Definicion<In, Out>) {
  const callback = async (args: unknown): Promise<RespuestaDeHerramienta> => {
    const inicio = performance.now();
    let respuesta: RespuestaDeHerramienta;
    let opportunityId: string | null = null;
    let result: McpCallResult = "OK";
    let message: string | null = null;

    try {
      if (!permiteAlcance(sesion, def.alcance)) {
        respuesta = {
          content: [
            {
              type: "text",
              text: `Sin acceso: esta herramienta necesita el alcance ${def.alcance}. Vuelve a autorizar el cliente pidiendo ${def.alcance}.`,
            },
          ],
          isError: true,
        };
      } else {
        const parsed = def.entrada.safeParse(args);
        if (!parsed.success) {
          respuesta = respuestaDeHerramienta(deZod(parsed.error));
        } else {
          const r = await def.ejecutar(parsed.data, sesion);
          const entrada = parsed.data as { opportunity_id?: unknown };
          opportunityId = r.opportunityId ?? (typeof entrada.opportunity_id === "string" ? entrada.opportunity_id : null);
          respuesta = respuestaDeHerramienta(r.resultado as ResultadoAccion<Record<string, unknown>>);
        }
      }
      if (respuesta.isError) {
        result = "RECHAZADO";
        message = respuesta.content[0]?.text ?? null;
      }
    } catch (e) {
      console.error(`[mcp] ${def.nombre} falló`, e);
      result = "ERROR";
      message = e instanceof Error ? e.message : String(e);
      respuesta = { content: [{ type: "text", text: ERROR_INTERNO }], isError: true };
    }

    await registrarLlamadaMcp({
      userId: sesion.session.userId,
      clientId: sesion.clientId,
      tool: def.nombre,
      params: args,
      opportunityId,
      durationMs: performance.now() - inicio,
      result,
      message,
    });
    return respuesta;
  };

  server.registerTool(
    def.nombre,
    {
      title: def.titulo,
      description: def.descripcion,
      inputSchema: def.forma,
      outputSchema: def.salida,
      annotations: { readOnlyHint: def.soloLectura, destructiveHint: false, idempotentHint: def.soloLectura, openWorldHint: false },
    },
    callback as unknown as ToolCallback<In>,
  );
}

const noAlcanzada = (id: string) =>
  falla(
    "AUTORIZACION",
    `La oportunidad «${id}» no existe o no está a tu alcance. Usa un opportunity_id devuelto por buscar_oportunidades.`,
  );

function etiquetaDe(payload: unknown): string | null {
  const etiqueta = (payload as { estado?: { etiqueta?: unknown } } | null)?.estado?.etiqueta;
  return typeof etiqueta === "string" ? etiqueta : null;
}

export function crearServidorMcp(sesion: SesionMcp): McpServer {
  const server = new McpServer(
    { name: "crm-avattar", version: "1.0.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCCIONES },
  );
  const { session } = sesion;

  registrar(server, sesion, {
    nombre: "buscar_oportunidades",
    titulo: "Buscar oportunidades",
    descripcion:
      "Encuentra oportunidades del usuario por etapa, responsable, importe, fechas o texto. Úsala para ubicar la oportunidad a analizar o para una lista corta con filtros; " +
      `devuelve como mucho ${LIMITES.busqueda} por página con siguiente_cursor. No sirve para volcar el pipeline: si no sabes qué buscas, pregunta al usuario. ` +
      "Un rango de fechas exige campo_fecha. Por omisión solo abiertas.",
    alcance: "crm:read",
    forma: BuscarOportunidadesBase,
    entrada: BuscarOportunidades,
    salida: SalidaDeBusqueda,
    soloLectura: true,
    ejecutar: async (args) => {
      const cursor = decodificarCursor(args.cursor, CursorDeBusqueda);
      if (!cursor.ok) {
        return { resultado: falla("VALIDACION", { campo: "cursor", mensaje: "el cursor no es válido; manda el siguiente_cursor tal cual lo recibiste, o ninguno para empezar." }) };
      }
      const skip = cursor.valor?.skip ?? 0;
      const sp = new URLSearchParams();
      sp.set("status", args.estatus);

      if (args.etapa) {
        const etapas = await etapasPorNombre(session, args.etapa);
        if (!etapas.length) {
          const nombres = await nombresDeEtapas(session);
          return {
            resultado: falla("VALIDACION", {
              campo: "etapa",
              mensaje: `no hay una etapa «${args.etapa}» en tus pipelines. Las etapas son: ${nombres.join(", ")}.`,
            }),
          };
        }
        for (const e of etapas) sp.append("stage", e.id);
      }
      if (args.responsable) {
        const usuarios = await usuariosPorNombre(session, args.responsable);
        if (!usuarios.length) {
          return {
            resultado: falla("VALIDACION", {
              campo: "responsable",
              mensaje: `no hay un usuario activo en tus países que coincida con «${args.responsable}». Usa el nombre tal como aparece en el CRM o el correo.`,
            }),
          };
        }
        for (const u of usuarios) sp.append("owner", u.id);
      }
      if (args.importe_min !== undefined) sp.set("amountMin", String(args.importe_min));
      if (args.importe_max !== undefined) sp.set("amountMax", String(args.importe_max));
      if (args.campo_fecha) {
        sp.set("dateField", args.campo_fecha);
        sp.set("period", "PERSONALIZADO");
        if (args.desde) sp.set("from", `${args.desde}T00:00:00.000Z`);
        if (args.hasta) sp.set("to", `${args.hasta}T23:59:59.999Z`);
      }
      if (args.texto) sp.set("q", args.texto);

      // Los mismos filtros que la pantalla del pipeline (lib/filters): la misma
      // semántica, el alcance antepuesto. El inicio de año fiscal no interviene
      // porque el periodo es siempre PERSONALIZADO.
      const where = toWhere(parseFilters(sp, session), session, { fiscalYearStartMonth: 1 });
      const filas = await buscarOportunidades(session, where, { take: LIMITES.busqueda, skip });
      const pagina = filas.slice(0, LIMITES.busqueda);
      return {
        resultado: ok({
          oportunidades: pagina.map(aOportunidadDeLista),
          siguiente_cursor: filas.length > LIMITES.busqueda ? codificarCursor({ skip: skip + LIMITES.busqueda }) : null,
        }),
      };
    },
  });

  registrar(server, sesion, {
    nombre: "obtener_oportunidad",
    titulo: "Obtener oportunidad",
    descripcion:
      "La ficha completa de una oportunidad: cuenta, contacto, etapa y probabilidad, importe y cotización, MEDDIC por componente, hitos, banderas de riesgo calculadas, " +
      "cuántas actividades tiene y qué recomendaciones previas existen. Llámala una sola vez antes de analizar. No trae actividades: usa listar_actividades.",
    alcance: "crm:read",
    forma: ObtenerOportunidad,
    entrada: ObtenerOportunidad,
    salida: FichaDeOportunidad,
    soloLectura: true,
    ejecutar: async (args) => {
      const o = await getOpportunityDetail(session, args.opportunity_id);
      if (!o) return { resultado: noAlcanzada(args.opportunity_id) };
      const [total, previas] = await Promise.all([totalDeActividades(session, o.id), listInsights(session, o.id)]);
      const banderas = o.status === "ABIERTA" ? explainRiskFlags(o, o.stage, new Date()) : [];
      return {
        opportunityId: o.id,
        resultado: ok(
          aFichaDeOportunidad(o, {
            banderas,
            totalDeActividades: total,
            recomendaciones: previas.map((p) => ({ generatedAt: p.generatedAt, etiqueta: etiquetaDe(p.payload), generatedBy: p.generatedBy?.name ?? AGENTE })),
          }),
        ),
      };
    },
  });

  registrar(server, sesion, {
    nombre: "listar_actividades",
    titulo: "Listar actividades",
    descripcion:
      "Las actividades de una oportunidad, de la más reciente a la más antigua, con tipo, fecha, responsable y un extracto. No trae notas ni transcripciones completas: " +
      `para eso está obtener_nota. Pagina con limit (hasta ${LIMITES.actividadesMax}) y siguiente_cursor.`,
    alcance: "crm:read",
    forma: ListarActividades,
    entrada: ListarActividades,
    salida: SalidaDeActividades,
    soloLectura: true,
    ejecutar: async (args) => {
      const cursor = decodificarCursor(args.cursor, CursorDeActividades);
      if (!cursor.ok) {
        return { resultado: falla("VALIDACION", { campo: "cursor", mensaje: "el cursor no es válido; manda el siguiente_cursor tal cual lo recibiste, o ninguno para empezar." }) };
      }
      const o = await getOpportunity(session, args.opportunity_id);
      if (!o) return { resultado: noAlcanzada(args.opportunity_id) };
      const filas = await actividadesDeOportunidad(session, o.id, {
        take: args.limit,
        cursor: cursor.valor ? { startsAt: new Date(cursor.valor.startsAt), id: cursor.valor.id } : null,
      });
      const pagina = filas.slice(0, args.limit);
      const ultima = pagina.at(-1);
      return {
        opportunityId: o.id,
        resultado: ok({
          actividades: pagina.map((a) => aActividadDeLista(a, LIMITES.extracto)),
          siguiente_cursor:
            filas.length > args.limit && ultima ? codificarCursor({ startsAt: ultima.startsAt.toISOString(), id: ultima.id }) : null,
        }),
      };
    },
  });

  registrar(server, sesion, {
    nombre: "obtener_nota",
    titulo: "Obtener nota",
    descripcion:
      "El contenido completo de una actividad: notas, resultado y transcripción, si la tiene. Úsala solo con las actividades que vas a citar en la recomendación; " +
      "el activity_id sale de listar_actividades.",
    alcance: "crm:read",
    forma: ObtenerNota,
    entrada: ObtenerNota,
    salida: Nota,
    soloLectura: true,
    ejecutar: async (args) => {
      const a = await actividadPorId(session, args.activity_id);
      if (!a) {
        return {
          resultado: falla(
            "AUTORIZACION",
            `La actividad «${args.activity_id}» no existe o no está a tu alcance. Usa un activity_id devuelto por listar_actividades.`,
          ),
        };
      }
      return { opportunityId: a.opportunityId, resultado: ok(aNota(a)) };
    },
  });

  registrar(server, sesion, {
    nombre: "guardar_recomendacion",
    titulo: "Guardar recomendación",
    descripcion:
      "Guarda el resultado de tu análisis sobre una oportunidad: estado (etiqueta y diagnóstico), fortalezas, riesgos, siguientes pasos (tareas pendientes y reuniones " +
      "agendadas o acordadas) y recomendaciones. Cada fortaleza, riesgo y siguiente paso cita un activity_id de esta oportunidad y un fragmento textual copiado de obtener_nota; " +
      "una recomendación puede ir con fuente null. El CRM verifica cada cita y rechaza lo que no cuadre. Cada guardado es una versión nueva. " +
      "Llámala una vez al terminar, no mientras analizas.",
    alcance: "crm:write",
    forma: GuardarRecomendacion,
    entrada: GuardarRecomendacion,
    salida: SalidaDeRecomendacion,
    soloLectura: false,
    ejecutar: async (args) => ({ resultado: await guardarRecomendacion(session, args, { clientId: sesion.clientId }) }),
  });

  return server;
}
