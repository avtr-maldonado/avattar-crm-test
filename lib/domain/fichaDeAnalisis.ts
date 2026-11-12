import type { Prisma } from "@prisma/client";
import { deZod, falla, ok, type Problema, type ResultadoAccion } from "@/lib/acciones";
import type { Analista, RespuestaDeAnalista } from "@/lib/agente/analista";
import { enCurso } from "@/lib/agente/espera";
import { actividadesCitables, textoDeExpediente, type Expediente } from "@/lib/agente/expediente";
import { Analisis, type AnalisisDeOportunidad } from "@/lib/agente/salida";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { estadoDeAnalisis, expedienteDeOportunidad, tomarParaAnalizar, type FilasDeExpediente } from "@/lib/scope/agente";
import { getOpportunity } from "@/lib/scope/opportunities";
import { validarFuentes } from "./insightFuentes";
import { computeRiskFlags } from "./riskFlags";

/**
 * El agente de análisis · decisiones §62, enmendado por §63: **a demanda**.
 *
 * Tres piezas: la **marca de cambio** (cada servicio que muta una oportunidad
 * deja `lastChangedAt`, para saber si hay algo nuevo que analizar), la
 * **solicitud** («Analizar con IA»: permiso, alcance, abierta, el aviso de que
 * nada cambió, y el bloqueo «analizando»), y el **análisis** de una oportunidad
 * (expediente → analista → validación → ficha con bitácora). Nada corre solo:
 * sin pulsar el botón no se gasta un token. El analista llega por parámetro:
 * el dominio no sabe de Anthropic y las pruebas inyectan uno falso.
 */
type Escritor = Prisma.TransactionClient | typeof prisma;

/** Para fundir en un `update` de oportunidad que ya existe en la transacción. */
export function marcaDeCambio(ahora: Date = new Date()): { lastChangedAt: Date } {
  return { lastChangedAt: ahora };
}

/** Deja la marca de cambio en una oportunidad; para los servicios que no hacen `update` de ella. */
export async function anotarCambio(tx: Escritor, opportunityId: string, ahora: Date = new Date()): Promise<void> {
  await tx.opportunity.updateMany({ where: { id: opportunityId }, data: marcaDeCambio(ahora) });
}

const FORMATO_AVISO = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * «Analizar con IA» · §63. En orden: el permiso de la matriz
 * (`ANALIZAR_CON_IA`), la oportunidad al alcance, abierta, el aviso de tokens
 * (si la última ficha es posterior al último cambio, `CONFIRMACION` hasta que
 * `confirmado` llegue), y el bloqueo: si ya hay un análisis en curso,
 * `CONFLICTO`. Con todo eso, la oportunidad queda «analizando» y quien llamó
 * ejecuta `analizarOportunidad` después de responder.
 */
export async function solicitarAnalisis(
  session: Session,
  opportunityId: string,
  opciones: { confirmado?: boolean; ahora?: Date; zona?: string } = {},
): Promise<ResultadoAccion<null>> {
  const ahora = opciones.ahora ?? new Date();
  if (!can(session, "ANALIZAR_CON_IA")) {
    return falla("AUTORIZACION", "Tu rol no tiene el permiso «Analizar con IA»; puedes analizarla desde tu cliente de IA por el MCP.");
  }
  const o = await getOpportunity(session, opportunityId);
  if (!o) return falla("AUTORIZACION", "La oportunidad no existe o no está a tu alcance.");
  if (o.status !== "ABIERTA") {
    return falla("COMPUERTA", `${o.folio} está cerrada: conserva su última ficha y no se vuelve a analizar.`);
  }

  const estado = await estadoDeAnalisis(o.id);
  if (!estado) return falla("AUTORIZACION", "La oportunidad no existe o no está a tu alcance.");
  if (enCurso(estado.analysisStartedAt, ahora)) {
    return falla("CONFLICTO", `Ya hay un análisis en curso de ${o.folio}; la ficha llegará en un momento.`);
  }

  const sinCambios =
    estado.ultimaFichaEn != null && (estado.lastChangedAt == null || estado.ultimaFichaEn >= estado.lastChangedAt);
  if (sinCambios && !opciones.confirmado) {
    const cuando = opciones.zona
      ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: opciones.zona }).format(estado.ultimaFichaEn!)
      : FORMATO_AVISO.format(estado.ultimaFichaEn!);
    return falla("CONFIRMACION", `Nada ha cambiado desde el análisis del ${cuando}. ¿Analizar de todos modos?`);
  }

  const tomada = await tomarParaAnalizar(o.id, ahora);
  if (!tomada) return falla("CONFLICTO", `Ya hay un análisis en curso de ${o.folio}; la ficha llegará en un momento.`);
  return ok(null);
}

export type ResultadoDeAnalisis =
  | { opportunityId: string; resultado: "OK"; insightId: string }
  | { opportunityId: string; resultado: "FALLA"; motivo: string }
  | { opportunityId: string; resultado: "OMITIDA"; motivo: string };

function expedienteDe(filas: FilasDeExpediente, ahora: Date): Expediente {
  const { quotes, ...resto } = filas;
  return { ...resto, quote: quotes[0] ?? null, banderas: computeRiskFlags(filas, filas.stage, ahora) };
}

type Evaluacion =
  | { ok: true; ficha: AnalisisDeOportunidad; idsCitados: string[] }
  | { ok: false; problemas: Problema[] };

/** El servidor valida, no el modelo (§61, §62): esquema y después fuentes. */
function evaluar(expediente: Expediente, salida: unknown): Evaluacion {
  const parsed = Analisis.safeParse(salida);
  if (!parsed.success) {
    const r = deZod(parsed.error);
    return { ok: false, problemas: r.ok ? [] : r.problemas };
  }
  const fuentes = validarFuentes(expediente.id, parsed.data, actividadesCitables(expediente), {
    [expediente.id]: expediente.folio,
  });
  if (fuentes.problemas.length) return { ok: false, problemas: fuentes.problemas };
  return { ok: true, ficha: parsed.data, idsCitados: fuentes.idsCitados };
}

function textoDeProblemas(problemas: Problema[]): string {
  return problemas.map((p) => (p.campo ? `${p.campo}: ${p.mensaje}` : p.mensaje)).join(" · ");
}

async function guardarFicha(
  expediente: Expediente,
  ficha: AnalisisDeOportunidad,
  idsCitados: string[],
  respuesta: RespuestaDeAnalista,
  pedidoPor: string | null,
): Promise<string> {
  const payload = {
    estado: ficha.estado,
    fortalezas: ficha.fortalezas,
    riesgos: ficha.riesgos,
    siguientes_pasos: ficha.siguientes_pasos,
    recomendaciones: ficha.recomendaciones,
  } satisfies Prisma.InputJsonValue;

  return auditedTransaction(async (tx, audit) => {
    const fila = await tx.opportunityInsight.create({
      data: {
        opportunityId: expediente.id,
        payload,
        sourceActivityIds: idsCitados,
        model: respuesta.modelo,
        generatedById: null,
        origin: "AGENTE",
        inputTokens: respuesta.tokens.entrada,
        outputTokens: respuesta.tokens.salida,
      },
      select: { id: true },
    });
    const version = await tx.opportunityInsight.count({ where: { opportunityId: expediente.id } });
    await audit({
      entity: "Opportunity",
      entityId: expediente.id,
      action: "GENERAR_ANALISIS",
      // §63 · lo pidió una persona con el botón; la ficha la escribió el agente.
      byUserId: pedidoPor,
      after: {
        insightId: fila.id,
        version,
        etiqueta: ficha.estado.etiqueta,
        fortalezas: ficha.fortalezas.length,
        riesgos: ficha.riesgos.length,
        siguientesPasos: ficha.siguientes_pasos.length,
        recomendaciones: ficha.recomendaciones.length,
        model: respuesta.modelo,
        inputTokens: respuesta.tokens.entrada,
        outputTokens: respuesta.tokens.salida,
      },
    });
    await tx.opportunity.update({
      where: { id: expediente.id },
      data: { analysisStartedAt: null, analysisError: null },
    });
    return fila.id;
  });
}

/** Anota la falla y suelta el bloqueo: quien pulsó decide si vuelve a intentar. */
async function registrarFalla(opportunityId: string, motivo: string): Promise<ResultadoDeAnalisis> {
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { analysisError: motivo.slice(0, 500), analysisStartedAt: null },
  });
  return { opportunityId, resultado: "FALLA", motivo };
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Analiza una oportunidad que ya quedó «analizando» por `solicitarAnalisis`:
 * arma el expediente, pide la ficha, la valida y la guarda. Si las fuentes no
 * cuadran, devuelve los problemas al analista una sola vez; si tampoco así, es
 * una falla que se muestra y suelta el bloqueo.
 */
export async function analizarOportunidad(
  opportunityId: string,
  analista: Analista,
  opciones: { ahora?: Date; pedidoPor?: string | null } = {},
): Promise<ResultadoDeAnalisis> {
  const ahora = opciones.ahora ?? new Date();
  const filas = await expedienteDeOportunidad(opportunityId);
  if (!filas) return { opportunityId, resultado: "OMITIDA", motivo: "La oportunidad no existe." };
  if (filas.status !== "ABIERTA") {
    await prisma.opportunity.update({ where: { id: opportunityId }, data: { analysisStartedAt: null } });
    return { opportunityId, resultado: "OMITIDA", motivo: "La oportunidad está cerrada." };
  }

  const expediente = expedienteDe(filas, ahora);
  const texto = textoDeExpediente(expediente, ahora);

  try {
    let respuesta = await analista.analizar({ expediente: texto });
    let evaluacion = evaluar(expediente, respuesta.salida);
    if (!evaluacion.ok) {
      respuesta = await analista.analizar({
        expediente: texto,
        correccion: { salidaAnterior: JSON.stringify(respuesta.salida), problemas: evaluacion.problemas },
      });
      evaluacion = evaluar(expediente, respuesta.salida);
    }
    if (!evaluacion.ok) return await registrarFalla(opportunityId, textoDeProblemas(evaluacion.problemas));

    const insightId = await guardarFicha(expediente, evaluacion.ficha, evaluacion.idsCitados, respuesta, opciones.pedidoPor ?? null);
    return { opportunityId, resultado: "OK", insightId };
  } catch (e) {
    return registrarFalla(opportunityId, mensajeDe(e));
  }
}
