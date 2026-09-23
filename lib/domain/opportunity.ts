import type { BusinessType, CountryCode, ForecastCategory, Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { ETIQUETA_ESTATUS, iniciales } from "@/lib/etiquetas";
import {
  contextoDeCompuerta,
  cotizacionConLineas,
  type DetalleOportunidad,
} from "@/lib/scope/opportunityDetail";
import { evaluateGate, type GateContext, type GateFailure, type GateResult } from "./stageGate";
import { nextFolio } from "./folio";

export type DecisionDeTransicion = {
  avanza: boolean;
  gateOverride: boolean;
  faltantes: GateFailure[];
};

/**
 * Decide si una transición procede. Pura: sin base, sin sesión, sin umbrales.
 *
 * `BLOQUEANTE` no se salta. `ADVERTENCIA` se salta solo con confirmación
 * explícita, y entonces queda sellada en `StageTransition.gateOverride`, que es
 * lo que alimenta el reporte semanal de incumplimiento de §8.3.
 */
export function decidirTransicion(input: {
  gateMode: "ADVERTENCIA" | "BLOQUEANTE";
  resultado: GateResult;
  omitirCompuerta: boolean;
}): DecisionDeTransicion {
  if (input.resultado.ok) {
    // No hubo nada que omitir: marcar el override aquí ensuciaría el reporte de
    // §8.3 con incumplimientos que nunca ocurrieron.
    return { avanza: true, gateOverride: false, faltantes: [] };
  }

  if (input.gateMode === "BLOQUEANTE" || !input.omitirCompuerta) {
    return { avanza: false, gateOverride: false, faltantes: input.resultado.missing };
  }

  return { avanza: true, gateOverride: true, faltantes: input.resultado.missing };
}

/**
 * La etapa de entrada de un pipeline: la de `position` menor.
 *
 * INV-13 · no se busca por nombre. «Calificación» es el nombre en México y no
 * tiene por qué serlo en el pipeline de renovaciones.
 */
export function etapaInicial<T extends { id: string; position: number }>(
  stages: readonly T[],
): T {
  const primera = [...stages].sort((a, b) => a.position - b.position)[0];
  if (!primera) throw new Error("El pipeline está sin etapas: revisa la configuración.");
  return primera;
}

/**
 * El contexto de compuerta de una oportunidad **que todavía no existe**.
 *
 * No es un atajo: una oportunidad recién nacida genuinamente no tiene
 * documentos, ni cotización congelada, ni hitos, ni evaluaciones MEDDIC. Lo
 * único que puede traer de entrada es una persona con rol en el comité, porque
 * eso se captura en el mismo formulario.
 *
 * La consecuencia es honesta y visible: crear directamente en Propuesta o más
 * allá va a fallar la compuerta, y el vendedor verá exactamente qué le falta.
 */
export function contextoDeCompuertaNueva(input: {
  tienePersonaConRol: boolean;
  meddicMinToClosing: number;
}): GateContext {
  return {
    tienePersonaConRol: input.tienePersonaConRol,
    tienePropuestaCargada: false,
    tieneContratoOrdenCompra: false,
    tieneCotizacion: false,
    cantidadHitos: 0,
    diferenciaHitos: null,
    meddicScore: 0,
    meddicDecisorConfirmado: false,
    autorizacionesPendientes: 0,
    meddicMinToClosing: input.meddicMinToClosing,
  };
}

/**
 * A quién se le puede reasignar —o asignar al crear— una oportunidad de este
 * país · `Q-14`.
 *
 * Solo usuarios activos que operan en él. Sin esta condición **AC-05 se rompe
 * por la puerta de atrás**: darle a un vendedor de Colombia una oportunidad de
 * México le daría acceso a ella; el alcance por país se habría aplicado
 * correctamente en cada consulta y el dato habría cruzado igual. La fuga no
 * está en el filtro, está en la escritura.
 */
export async function destinatariosValidos(countryCode?: CountryCode | null) {
  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      // Sin país, cualquier usuario activo: es el caso de las cuentas, que no
      // son de un país (decisiones §18).
      ...(countryCode ? { countryCodes: { has: countryCode } } : {}),
    },
    select: { id: true, name: true, initials: true },
    orderBy: { name: "asc" },
  });
}

export type OrganizacionNueva = {
  name: string;
  type: "CLIENTE" | "PROSPECTO" | "PARTNER" | "FABRICANTE" | "PROVEEDOR";
  city?: string;
  industry?: string;
};

export type PersonaNueva = {
  name: string;
  jobTitle?: string;
  email?: string;
  committeeRoleId?: string;
};

export type EntradaDeAlta = {
  /** Una de las dos: la organización existente, o los datos de la nueva. */
  organizationId?: string;
  organizacionNueva?: OrganizacionNueva;
  /** Igual para la persona principal, que además es opcional del todo. */
  primaryPersonId?: string;
  personaNueva?: PersonaNueva;

  name: string;
  pipelineId: string;
  /** Si no viene, la de posición menor. Se evalúa su compuerta igual (RN-02). */
  stageId?: string;
  omitirCompuerta?: boolean;
  estimatedAmount: string;
  expectedCloseDate: Date;
  businessType: BusinessType;
  forecastCategory?: ForecastCategory;
  sourceId?: string;
  ownerId?: string;
};

/**
 * Da de alta una oportunidad. `INV-12` y `RN-20`.
 *
 * ## Todo en una transacción, incluidas la organización y la persona
 *
 * «La organización y la persona se pueden crear aquí mismo sin perder lo
 * capturado.» Si se crearan por separado y la oportunidad fallara después, cada
 * cancelación a media captura dejaría una empresa huérfana en el catálogo. Esa
 * es la basura que nadie limpia nunca. Aquí, o se crean las tres o no se crea
 * ninguna.
 *
 * El folio se reserva con `nextFolio`, que hace un `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING` atómico dentro de esa misma transacción. **Nunca
 * `count() + 1`**: ese era el defecto del esquema archivado, que además no
 * reiniciaba en enero.
 */
export async function crearOportunidad(
  session: Session,
  input: EntradaDeAlta,
  umbrales: { meddicMinToClosing: number },
): Promise<ResultadoAccion<{ id: string; folio: string; gateOverride: boolean }>> {
  if (!input.organizationId === !input.organizacionNueva) {
    return falla("VALIDACION", {
      campo: "organizationId",
      mensaje: "Elige una organización de la lista o escribe el nombre de una nueva.",
    });
  }

  // ── El pipeline: de él sale el país ───────────────────────────────────────
  // El país de la oportunidad es el del pipeline elegido, no el de la cuenta:
  // las cuentas no son de un país (decisiones §18) y a una misma empresa se le
  // vende en México y en Colombia. Lo que sí se exige es que quien crea opere
  // en ese país (AC-05): elegir el pipeline de Colombia sin operar ahí sería
  // darse una llave por la puerta de atrás.
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: input.pipelineId, active: true },
    select: {
      id: true,
      name: true,
      countryCode: true,
      stages: {
        select: { id: true, name: true, position: true, gateRequires: true, gateMode: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!pipeline) {
    return falla("VALIDACION", { campo: "pipelineId", mensaje: "Ese pipeline no existe." });
  }

  const countryCode: CountryCode = pipeline.countryCode;
  if (!session.countryCodes.includes(countryCode)) {
    return falla("AUTORIZACION", `No operas en ${countryCode}.`);
  }

  // ── La organización: existente, o nueva en la misma operación ─────────────
  let organizationId: string | null = null;

  if (input.organizationId) {
    const existente = await prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!existente) {
      return falla("VALIDACION", { campo: "organizationId", mensaje: "Esa organización no existe." });
    }
    organizationId = existente.id;
  }

  // ── La etapa y su compuerta · RN-02 ──────────────────────────────────────
  const destino = input.stageId
    ? pipeline.stages.find((e) => e.id === input.stageId)
    : etapaInicial(pipeline.stages);

  if (!destino) {
    return falla("VALIDACION", {
      campo: "stageId",
      mensaje: "Esa etapa no pertenece al pipeline elegido.",
    });
  }

  // Solo una persona con rol declarado puede satisfacer una compuerta al nacer.
  const rolDeclarado = input.personaNueva
    ? Boolean(input.personaNueva.committeeRoleId)
    : input.primaryPersonId
      ? await prisma.person
          .findFirst({
            where: { id: input.primaryPersonId, deletedAt: null },
            select: { committeeRoleId: true },
          })
          .then((p) => Boolean(p?.committeeRoleId))
      : false;

  const decision = decidirTransicion({
    gateMode: destino.gateMode,
    resultado: evaluateGate(
      destino.gateRequires as Parameters<typeof evaluateGate>[0],
      contextoDeCompuertaNueva({
        tienePersonaConRol: rolDeclarado,
        meddicMinToClosing: umbrales.meddicMinToClosing,
      }),
    ),
    omitirCompuerta: input.omitirCompuerta ?? false,
  });

  if (!decision.avanza) {
    return falla(
      "COMPUERTA",
      ...decision.faltantes.map((f) => ({ mensaje: `«${destino.name}» — ${f.message}` })),
    );
  }

  // ── El propietario · Q-13 aplicado al alta ───────────────────────────────
  // Si un vendedor pudiera dar de alta a nombre de otro, tendría reasignación
  // disfrazada de creación.
  const ownerId =
    input.ownerId && can(session, "VER_OPORTUNIDADES_OFICINA") ? input.ownerId : session.userId;

  if (ownerId !== session.userId) {
    const validos = await destinatariosValidos(countryCode);
    if (!validos.some((u) => u.id === ownerId)) {
      return falla("VALIDACION", {
        campo: "ownerId",
        mensaje: `Ese usuario no está activo o no opera en ${countryCode}.`,
      });
    }
  }

  const ahora = new Date();

  const creada = await prisma.$transaction(async (tx) => {
    if (!organizationId) {
      const nueva = await tx.organization.create({
        data: {
          name: input.organizacionNueva!.name,
          type: input.organizacionNueva!.type,
          city: input.organizacionNueva!.city || null,
          industry: input.organizacionNueva!.industry || null,
          countryCode,
          // La empresa que un vendedor da de alta es suya: es quien la trabaja.
          ownerId: session.userId,
        },
        select: { id: true },
      });
      organizationId = nueva.id;
    }

    let primaryPersonId = input.primaryPersonId ?? null;
    if (input.personaNueva) {
      const persona = await tx.person.create({
        data: {
          organizationId,
          name: input.personaNueva.name,
          initials: iniciales(input.personaNueva.name),
          jobTitle: input.personaNueva.jobTitle || null,
          email: input.personaNueva.email || null,
          committeeRoleId: input.personaNueva.committeeRoleId || null,
        },
        select: { id: true },
      });
      primaryPersonId = persona.id;
    }

    const folio = await nextFolio(tx, ahora.getFullYear());

    const oportunidad = await tx.opportunity.create({
      data: {
        folio,
        name: input.name,
        organizationId,
        primaryPersonId,
        pipelineId: pipeline.id,
        stageId: destino.id,
        countryCode,
        estimatedAmount: input.estimatedAmount,
        // Mientras no hay cotización, el estimado ES el valor vigente. El
        // comentario del esquema lo dice: `amount` es espejo de la cotización
        // activa, y todavía no hay ninguna.
        amount: input.estimatedAmount,
        // `grossMargin` queda en null a propósito: no hay costo del cual
        // derivarlo, e inventar un margen sería peor que no tenerlo, porque las
        // banderas de riesgo lo leen.
        expectedCloseDate: input.expectedCloseDate,
        businessType: input.businessType,
        forecastCategory: input.forecastCategory ?? "PIPELINE",
        sourceId: input.sourceId || null,
        ownerId,
        createdById: session.userId,
        // RN-03 · el reloj de estancamiento empieza a correr desde el alta.
        stageEnteredAt: ahora,
      },
      select: { id: true, folio: true },
    });

    // Nacer en una etapa avanzada es una transición como cualquier otra, y su
    // `gateOverride` alimenta el mismo reporte de §8.3. Sin esta fila, la
    // oportunidad aparecería en Negociación sin que nada explique cómo llegó.
    if (destino.position > etapaInicial(pipeline.stages).position) {
      await tx.stageTransition.create({
        data: {
          opportunityId: oportunidad.id,
          fromStageId: null,
          toStageId: destino.id,
          byUserId: session.userId,
          gateOverride: decision.gateOverride,
        },
      });
    }

    return oportunidad;
  });

  // `gateOverride` sale con el resultado porque quien creó la oportunidad tiene
  // que enterarse: quedó registrada como incumplimiento y alimenta el reporte
  // semanal de §8.3. Enterarse por el reporte, una semana después, es tarde.
  return ok({ ...creada, gateOverride: decision.gateOverride });
}

// ═══════════════════════════════════════════════════════════ Cambiar etapa

/**
 * Mueve una oportunidad de etapa · `RN-02` y `RN-03`.
 *
 * Recibe el detalle **ya cargado por `lib/scope`**, igual que recibe los
 * umbrales: si `getOpportunityDetail` lo devolvió, la sesión alcanza esa
 * oportunidad (INV-01) y el dominio no tiene que volver a preguntarlo. Así esta
 * función decide y escribe, sin cargar.
 *
 * No lleva `AuditLog`: no está entre las seis acciones de INV-09, y no debería.
 * Su bitácora propia es `StageTransition`, que además guarda el `gateOverride`
 * que alimenta el reporte semanal de incumplimiento de §8.3.
 */
export async function cambiarEtapa(
  session: Session,
  detalle: DetalleOportunidad,
  input: { toStageId: string; omitirCompuerta?: boolean },
  umbrales: { meddicMinToClosing: number },
): Promise<ResultadoAccion<{ etapa: string; gateOverride: boolean }>> {
  if (detalle.status !== "ABIERTA") {
    return falla(
      "AUTORIZACION",
      `Esta oportunidad está ${ETIQUETA_ESTATUS[detalle.status].toLowerCase()}. Reabrirla es de Administración (RN-18).`,
    );
  }

  const destino = detalle.pipeline.stages.find((e) => e.id === input.toStageId);
  if (!destino) {
    return falla("VALIDACION", {
      campo: "toStageId",
      mensaje: "Esa etapa no pertenece al pipeline de esta oportunidad.",
    });
  }

  const decision = decidirTransicion({
    gateMode: destino.gateMode,
    resultado: evaluateGate(
      destino.gateRequires as Parameters<typeof evaluateGate>[0],
      contextoDeCompuerta(detalle, umbrales),
    ),
    omitirCompuerta: input.omitirCompuerta ?? false,
  });

  if (!decision.avanza) {
    return falla("COMPUERTA", ...decision.faltantes.map((f) => ({ mensaje: f.message })));
  }

  const origen = detalle.stage.id;
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: detalle.id },
      data: {
        stageId: destino.id,
        // RN-03 · el reloj mide cuánto lleva DONDE ESTÁ, así que se resella en
        // cada transición, incluida la que retrocede.
        stageEnteredAt: ahora,
      },
    });

    await tx.stageTransition.create({
      data: {
        opportunityId: detalle.id,
        fromStageId: origen,
        toStageId: destino.id,
        byUserId: session.userId,
        gateOverride: decision.gateOverride,
      },
    });
  });

  return ok({ etapa: destino.name, gateOverride: decision.gateOverride });
}

// ═══════════════════════════════════════════════════════ Editar oportunidad

export type EdicionDeOportunidad = {
  name?: string;
  primaryPersonId?: string | null;
  estimatedAmount?: string;
  expectedCloseDate?: Date;
  businessType?: BusinessType;
  forecastCategory?: ForecastCategory;
  sourceId?: string | null;
  ownerId?: string;
};

/**
 * Edita los datos comerciales de una oportunidad abierta.
 *
 * ## Quién puede · `Q-13`
 *
 * El propietario, o quien tenga alcance de oficina. Un vendedor edita las
 * suyas; las de su compañero ni siquiera se las devuelve `lib/scope`, así que
 * ese caso no suele llegar aquí. La comprobación existe igual: la autorización
 * no puede depender de que la pantalla haya cargado bien.
 *
 * ## Una cerrada no se edita · `RN-18`
 *
 * Solo Administración reabre. Si una ganada se pudiera editar sin reabrirla,
 * esa regla no valdría nada: bastaría cambiarle el importe después de cerrada.
 */
export async function editarOportunidad(
  session: Session,
  detalle: DetalleOportunidad,
  cambios: EdicionDeOportunidad,
  umbrales: { meddicMinToCommit: number },
): Promise<ResultadoAccion> {
  if (detalle.status !== "ABIERTA") {
    return falla(
      "AUTORIZACION",
      `Esta oportunidad está ${ETIQUETA_ESTATUS[detalle.status].toLowerCase()}. Reabrirla es de Administración (RN-18).`,
    );
  }

  const esSuya = detalle.owner.id === session.userId;
  if (!esSuya && !can(session, "VER_OPORTUNIDADES_OFICINA")) {
    return falla("AUTORIZACION", "Solo su propietario o Gerencia pueden editarla.");
  }

  const datos: Prisma.OpportunityUpdateInput = {};

  if (cambios.name !== undefined) {
    if (cambios.name.trim().length < 3) {
      return falla("VALIDACION", { campo: "name", mensaje: "Ponle nombre a la oportunidad." });
    }
    datos.name = cambios.name.trim();
  }

  if (cambios.expectedCloseDate !== undefined) datos.expectedCloseDate = cambios.expectedCloseDate;
  if (cambios.businessType !== undefined) datos.businessType = cambios.businessType;

  if (cambios.estimatedAmount !== undefined) {
    // Con cotización con líneas, `amount` es su espejo y el estimado deja de
    // mandar sobre el importe vigente (decisiones §21).
    datos.estimatedAmount = cambios.estimatedAmount;
    if (!cotizacionConLineas(detalle)) datos.amount = cambios.estimatedAmount;
  }

  if (cambios.forecastCategory !== undefined) {
    // RN-29 · «Compromiso» promete al pronóstico. Sin puntaje MEDDIC nadie
    // calificó esa promesa.
    if (
      cambios.forecastCategory === "COMPROMISO" &&
      (detalle.meddicScore ?? 0) < umbrales.meddicMinToCommit
    ) {
      return falla("VALIDACION", {
        campo: "forecastCategory",
        mensaje: `«Compromiso» exige un puntaje MEDDIC de al menos ${umbrales.meddicMinToCommit}; esta tiene ${detalle.meddicScore ?? 0}.`,
      });
    }
    datos.forecastCategory = cambios.forecastCategory;
  }

  if (cambios.primaryPersonId !== undefined) {
    datos.primaryPerson = cambios.primaryPersonId
      ? { connect: { id: cambios.primaryPersonId } }
      : { disconnect: true };
  }

  if (cambios.sourceId !== undefined) {
    datos.source = cambios.sourceId ? { connect: { id: cambios.sourceId } } : { disconnect: true };
  }

  // ── Reasignar · Q-13 y Q-14 ──────────────────────────────────────────────
  const reasigna = cambios.ownerId !== undefined && cambios.ownerId !== detalle.owner.id;
  if (reasigna) {
    if (!can(session, "VER_OPORTUNIDADES_OFICINA")) {
      return falla("AUTORIZACION", "Cambiar de propietario es de Gerencia.");
    }
    // El país es el de la oportunidad, no el de la cuenta: las cuentas no son
    // de un país (decisiones §18).
    const validos = await destinatariosValidos(detalle.countryCode);
    if (!validos.some((u) => u.id === cambios.ownerId)) {
      return falla("VALIDACION", {
        campo: "ownerId",
        mensaje: `Ese usuario no está activo o no opera en ${detalle.countryCode}.`,
      });
    }
    datos.owner = { connect: { id: cambios.ownerId } };
  }

  if (Object.keys(datos).length === 0) return ok(null);

  // Mover el cierre es lo que más se edita y lo que más explica, meses
  // después, por qué un trimestre no cerró como se prometió. Sin rastro nadie
  // sabe cuántas veces se corrió (decisiones §21).
  const cambiaCierre =
    cambios.expectedCloseDate !== undefined &&
    cambios.expectedCloseDate.getTime() !== detalle.expectedCloseDate.getTime();

  // El cambio de propietario SÍ está en INV-09; el cierre entró con la
  // bitácora. Los dos van en la misma transacción que el cambio.
  await auditedTransaction(async (tx, audit) => {
    await tx.opportunity.update({ where: { id: detalle.id }, data: datos });
    if (reasigna) {
      await audit({
        entity: "Opportunity",
        entityId: detalle.id,
        action: "CAMBIAR_PROPIETARIO",
        byUserId: session.userId,
        before: { ownerId: detalle.owner.id },
        after: { ownerId: cambios.ownerId! },
      });
    }
    if (cambiaCierre) {
      await audit({
        entity: "Opportunity",
        entityId: detalle.id,
        action: "CAMBIAR_CIERRE_ESTIMADO",
        byUserId: session.userId,
        before: { expectedCloseDate: detalle.expectedCloseDate.toISOString() },
        after: { expectedCloseDate: cambios.expectedCloseDate!.toISOString() },
      });
    }
  });

  return ok(null);
}
