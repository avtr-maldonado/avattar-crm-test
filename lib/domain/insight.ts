import type { Prisma } from "@prisma/client";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { auditedTransaction } from "@/lib/audit";
import { GuardarRecomendacion } from "@/lib/mcp/esquemas";
import { getOpportunity } from "@/lib/scope/opportunities";
import { actividadesPorIds } from "@/lib/scope/mcp";
import { validarFuentes } from "./insightFuentes";
import { puedeEditarOportunidad } from "./opportunityAccess";

/**
 * Guardar una recomendación de un cliente de IA · decisiones §61.
 *
 * **El servidor valida, no el modelo**, y en este orden:
 *
 * 1. El esquema (`GuardarRecomendacion`): longitudes y cardinalidades. El SDK
 *    ya validó con el mismo esquema antes de llamar; se repite aquí porque el
 *    servicio no sabe quién lo llama.
 * 2. La oportunidad está al alcance. Si no, «no existe o no está a tu
 *    alcance»: confirmar que existe ya sería decir algo (como `getOpportunity`).
 * 3. Permiso de escritura: propietario o Gerencia (`puedeEditarOportunidad`).
 *    Preventa la consulta y no escribe.
 * 4. Las fuentes: cada actividad citada existe al alcance, es de esta
 *    oportunidad y contiene la cita (`validarFuentes`). Todos los problemas
 *    juntos.
 *
 * Después, una fila nueva en `opportunity_insights` y `GUARDAR_RECOMENDACION`
 * en la bitácora, en la misma transacción (INV-09). Nunca se actualiza una
 * fila: la historia es el versionado.
 */
export type RecomendacionGuardada = { insight_id: string; generated_at: string; version: number };

export async function guardarRecomendacion(
  session: Session,
  entrada: unknown,
  opciones: { clientId: string },
): Promise<ResultadoAccion<RecomendacionGuardada>> {
  const parsed = GuardarRecomendacion.safeParse(entrada);
  if (!parsed.success) return deZod(parsed.error);
  const rec = parsed.data;

  const oportunidad = await getOpportunity(session, rec.opportunity_id);
  if (!oportunidad) {
    return falla(
      "AUTORIZACION",
      `La oportunidad «${rec.opportunity_id}» no existe o no está a tu alcance. Usa un opportunity_id devuelto por buscar_oportunidades.`,
    );
  }
  if (!puedeEditarOportunidad(session, oportunidad)) {
    return falla(
      "AUTORIZACION",
      `Solo el propietario o Gerencia guardan recomendaciones sobre ${oportunidad.folio}; tu sesión solo la consulta.`,
    );
  }

  const idsPedidos = [...new Set([...rec.riesgos, ...rec.acciones].map((x) => x.fuente.activity_id))];
  const actividades = await actividadesPorIds(session, idsPedidos);
  const folios: Record<string, string> = { [oportunidad.id]: oportunidad.folio };
  for (const a of actividades) if (a.opportunity) folios[a.opportunity.id] = a.opportunity.folio;

  const fuentes = validarFuentes(oportunidad.id, rec, actividades, folios);
  if (fuentes.problemas.length) return { ok: false, motivo: "VALIDACION", problemas: fuentes.problemas };

  const payload = {
    estado: rec.estado,
    riesgos: rec.riesgos,
    acciones: rec.acciones,
    huecos: rec.huecos,
  } satisfies Prisma.InputJsonValue;

  const guardada = await auditedTransaction(async (tx, audit) => {
    const fila = await tx.opportunityInsight.create({
      data: {
        opportunityId: oportunidad.id,
        payload,
        sourceActivityIds: fuentes.idsCitados,
        model: rec.model ?? null,
        generatedById: session.userId,
      },
      select: { id: true, generatedAt: true },
    });
    const version = await tx.opportunityInsight.count({ where: { opportunityId: oportunidad.id } });
    await audit({
      entity: "Opportunity",
      entityId: oportunidad.id,
      action: "GUARDAR_RECOMENDACION",
      byUserId: session.userId,
      after: {
        insightId: fila.id,
        version,
        etiqueta: rec.estado.etiqueta,
        riesgos: rec.riesgos.length,
        acciones: rec.acciones.length,
        huecos: rec.huecos.length,
        model: rec.model ?? null,
        clientId: opciones.clientId,
      },
    });
    return { fila, version };
  });

  return ok({
    insight_id: guardada.fila.id,
    generated_at: guardada.fila.generatedAt.toISOString(),
    version: guardada.version,
  });
}
