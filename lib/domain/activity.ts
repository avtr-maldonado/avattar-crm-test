import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { calendarioDeGraph, type Calendario } from "@/lib/graph/calendario";
import { eventoDeActividad } from "@/lib/graph/evento";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";

export type SiguientePaso = {
  typeId: string;
  subject: string;
  startsAt: Date;
};

export type RegistroDeActividad = {
  typeId: string;
  subject: string;
  outcome?: string;
  notes?: string;
  /** Cuándo ocurre o cuándo ocurrió. Por omisión, ahora. */
  cuando?: Date;
  /** Cuánto dura. Sin él, el calendario le da media hora. */
  durationMin?: number | null;
  /**
   * Si ya pasó (`true`, por omisión) o queda agendada (`false`).
   *
   * Es la misma distinción que hace la agenda: una actividad hecha es
   * historia, una por hacer es compromiso. Por omisión `true` porque este
   * servicio nació para registrar lo que pasó; el formulario del detalle
   * manda `false` cuando lo que se está haciendo es agendar.
   */
  hecha?: boolean;
  /** El responsable: de quién es y en cuyo calendario se agenda. Por omisión, quien registra. */
  userId?: string;
  /** La zona horaria de la oportunidad, para escribir la hora de pared en el calendario. */
  zona?: string;
  siguiente?: SiguientePaso;
  /** §12.4 · la confirmación explícita de cerrar sin seguimiento. */
  sinSeguimiento?: boolean;
};

export type EdicionDeActividad = Partial<
  Pick<
    RegistroDeActividad,
    "typeId" | "subject" | "outcome" | "notes" | "cuando" | "durationMin" | "hecha" | "userId" | "zona"
  >
> & {
  siguiente?: SiguientePaso;
  sinSeguimiento?: boolean;
};

/**
 * Qué pasó con el calendario de Microsoft 365 al guardar.
 *
 *   AGENDADA        el evento existe y apunta a esta actividad
 *   SIN_CALENDARIO  no hay credenciales de Graph: el CRM trabaja solo
 *   FALLO           Graph no contestó o rechazó; la actividad se guardó igual
 *   NO_APLICA       una actividad hecha es historia y no va al calendario
 */
export type SincroniaDeCalendario = "AGENDADA" | "SIN_CALENDARIO" | "FALLO" | "NO_APLICA";

export type ResultadoDeActividad = {
  id: string;
  siguienteEn: Date | null;
  calendario: SincroniaDeCalendario;
};

const ASUNTO_MINIMO = 3;

/**
 * Registra una actividad —hecha o por hacer— y, si viene, su siguiente paso.
 *
 * ## El DEBE de §12.4 vive aquí, no en el navegador
 *
 * «Una actividad que se completa sin agendar la siguiente **DEBE** preguntar de
 * forma explícita si se cierra sin seguimiento.»
 *
 * Si no viene `siguiente` ni `sinSeguimiento`, esta función **no escribe nada**
 * y devuelve `CONFIRMACION`. Ponerlo en un `confirm()` del navegador lo dejaría
 * a merced de la consola; ponerlo aquí lo hace la regla, y de paso se puede
 * probar sin navegador.
 *
 * La pregunta solo aplica a una oportunidad **abierta**: en una cerrada, no
 * tener siguiente paso no es un olvido, es lo normal.
 *
 * Y solo aplica cuando la oportunidad **se queda sin ningún pendiente**. El
 * DEBE habla de una actividad «que se completa sin agendar la siguiente»: si
 * lo que se guarda es una actividad **por hacer**, esa ya es la siguiente, y
 * si la oportunidad ya traía algo agendado, tampoco se queda sin próximo paso.
 * Preguntar en esos dos casos era pedir un dato que ya estaba, y es lo que el
 * negocio reportó como confuso el 22 de septiembre de 2026.
 *
 * ## El calendario va después, y nunca manda
 *
 * La actividad se escribe en su transacción. Solo después, y solo si queda por
 * hacer, se le pide al calendario del responsable un evento (F-605). Si Graph
 * falla, la actividad ya existe y el resultado lo dice: el CRM no depende de
 * que Microsoft conteste. El calendario llega por parámetro para que las
 * pruebas le pasen uno falso y verifiquen qué se le pidió.
 *
 * ## `nextActivityAt` se recalcula, no se sobrescribe
 *
 * Es el más próximo de los pendientes, no el que se acaba de agendar. Y
 * `lastActivityAt` solo avanza con actividades **hechas**: agendar una reunión
 * para octubre no es haber hablado con el cliente hoy.
 *
 * No lleva `AuditLog`: registrar una actividad no está entre las seis acciones
 * de INV-09, y no debería. La actividad **es** su propio registro.
 */
export async function registrarActividad(
  session: Session,
  detalle: DetalleOportunidad,
  input: RegistroDeActividad,
  calendario: Calendario = calendarioDeGraph,
): Promise<ResultadoAccion<ResultadoDeActividad>> {
  const subject = input.subject.trim();
  if (subject.length < ASUNTO_MINIMO) {
    return falla("VALIDACION", { campo: "subject", mensaje: "Escribe de qué se trata la actividad." });
  }

  const duracion = validarDuracion(input.durationMin);
  if (!duracion.ok) return duracion;

  const siguiente = validarSiguiente(input.siguiente);
  if (!siguiente.ok) return siguiente;

  const hecha = input.hecha ?? true;
  const abierta = detalle.status === "ABIERTA";

  // Qué deja agendado esta operación: la actividad misma si queda por hacer,
  // el siguiente paso si viene, o lo que la oportunidad ya tenía pendiente.
  const quedaPendiente = !hecha || input.siguiente != null || detalle.nextActivityAt != null;
  if (abierta && !quedaPendiente && !input.sinSeguimiento) {
    return falla("CONFIRMACION", PREGUNTA_SIN_SEGUIMIENTO);
  }

  const responsable = await responsableValido(input.userId ?? session.userId, detalle);
  if (!responsable.ok) return responsable;

  const cuando = input.cuando ?? new Date();

  const { id, siguienteEn } = await prisma.$transaction(async (tx) => {
    const creada = await tx.activity.create({
      data: {
        typeId: input.typeId,
        subject,
        notes: input.notes?.trim() || null,
        outcome: input.outcome?.trim() || null,
        startsAt: cuando,
        durationMin: duracion.datos,
        completedAt: hecha ? cuando : null,
        opportunityId: detalle.id,
        organizationId: detalle.organization.id,
        userId: responsable.datos.id,
      },
      select: { id: true },
    });

    if (input.siguiente) await crearSiguiente(tx, detalle, session.userId, input.siguiente);

    const proximo = await proximoPendiente(tx, detalle.id);
    await tx.opportunity.update({
      where: { id: detalle.id },
      data: {
        // Solo cuenta lo que ya pasó, y solo avanza: agendar para octubre no
        // apaga la bandera de «sin actividad reciente», y registrar hoy una
        // llamada de la semana pasada no enfría la cuenta.
        lastActivityAt:
          !hecha || (detalle.lastActivityAt && detalle.lastActivityAt > cuando)
            ? detalle.lastActivityAt
            : cuando,
        nextActivityAt: proximo,
      },
    });

    return { id: creada.id, siguienteEn: proximo };
  });

  const sincronia = hecha
    ? "NO_APLICA"
    : await agendar(calendario, {
        actividadId: id,
        correo: responsable.datos.email,
        eventoActual: null,
        detalle,
        typeId: input.typeId,
        subject,
        startsAt: cuando,
        durationMin: duracion.datos,
        notes: input.notes ?? null,
        zona: input.zona ?? "UTC",
      });

  return ok({ id, siguienteEn, calendario: sincronia });
}

/**
 * Edita una actividad de la oportunidad · P-02.
 *
 * Quien alcanza la oportunidad edita sus actividades: la actividad es dato de
 * la oportunidad, no del usuario que la capturó, y reprogramar la reunión de
 * un compañero es parte de trabajar la cuenta.
 *
 * ## Completar desde aquí es completar
 *
 * Marcar hecha una actividad que estaba por hacer es exactamente «una
 * actividad que se completa» (§12.4): si con eso la oportunidad se queda sin
 * nada pendiente, se pregunta igual que al registrar. Las demás ediciones no
 * preguntan nada.
 *
 * ## Los acumulados se recalculan desde la base
 *
 * Al registrar, `lastActivityAt` «solo avanza»; al editar puede haber que
 * retrocederlo —si la única actividad hecha se movió de fecha— así que los dos
 * campos se recalculan desde lo que hay, dentro de la misma transacción.
 *
 * ## El evento del calendario sigue a la actividad
 *
 * Si ya estaba en el calendario, se actualiza; si cambió de responsable, se
 * quita del calendario anterior y se pone en el nuevo; si pasó a hecha, se
 * deja donde está: ya ocurrió y borrarlo del calendario sería borrar historia.
 */
export async function editarActividad(
  session: Session,
  detalle: DetalleOportunidad,
  activityId: string,
  cambios: EdicionDeActividad,
  calendario: Calendario = calendarioDeGraph,
): Promise<ResultadoAccion<ResultadoDeActividad>> {
  const actual = await prisma.activity.findFirst({
    where: { id: activityId, opportunityId: detalle.id, deletedAt: null },
    select: {
      id: true,
      typeId: true,
      subject: true,
      notes: true,
      startsAt: true,
      durationMin: true,
      completedAt: true,
      externalEventId: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!actual) {
    return falla("AUTORIZACION", "No encontramos esa actividad, o no está a tu alcance.");
  }

  const subject = cambios.subject === undefined ? actual.subject : cambios.subject.trim();
  if (subject.length < ASUNTO_MINIMO) {
    return falla("VALIDACION", { campo: "subject", mensaje: "Escribe de qué se trata la actividad." });
  }

  const duracion = validarDuracion(cambios.durationMin === undefined ? actual.durationMin : cambios.durationMin);
  if (!duracion.ok) return duracion;

  const siguiente = validarSiguiente(cambios.siguiente);
  if (!siguiente.ok) return siguiente;

  const hecha = cambios.hecha ?? actual.completedAt != null;
  const seCompletaAhora = hecha && actual.completedAt == null;
  const abierta = detalle.status === "ABIERTA";

  if (abierta && seCompletaAhora && !cambios.siguiente && !cambios.sinSeguimiento) {
    // Los pendientes que quedarían **además** de esta: si no hay ninguno, la
    // oportunidad se queda sin próximo paso y hay que preguntar.
    const otrosPendientes = await prisma.activity.count({
      where: { opportunityId: detalle.id, completedAt: null, deletedAt: null, id: { not: actual.id } },
    });
    if (otrosPendientes === 0) return falla("CONFIRMACION", PREGUNTA_SIN_SEGUIMIENTO);
  }

  const responsable = await responsableValido(cambios.userId ?? actual.user.id, detalle);
  if (!responsable.ok) return responsable;

  const startsAt = cambios.cuando ?? actual.startsAt;
  const typeId = cambios.typeId ?? actual.typeId;
  const notes = cambios.notes === undefined ? actual.notes : cambios.notes.trim() || null;

  const siguienteEn = await prisma.$transaction(async (tx) => {
    await tx.activity.update({
      where: { id: actual.id },
      data: {
        typeId,
        subject,
        notes,
        ...(cambios.outcome !== undefined ? { outcome: cambios.outcome.trim() || null } : {}),
        startsAt,
        durationMin: duracion.datos,
        // Completarla ahora la fecha en su hora; la que ya estaba hecha
        // conserva la suya; desmarcarla la devuelve a pendiente.
        completedAt: hecha ? (actual.completedAt ?? startsAt) : null,
        userId: responsable.datos.id,
      },
    });

    if (cambios.siguiente) await crearSiguiente(tx, detalle, session.userId, cambios.siguiente);

    const [proximo, ultima] = await Promise.all([
      proximoPendiente(tx, detalle.id),
      tx.activity.findFirst({
        where: { opportunityId: detalle.id, completedAt: { not: null }, deletedAt: null },
        select: { completedAt: true },
        orderBy: { completedAt: "desc" },
      }),
    ]);

    await tx.opportunity.update({
      where: { id: detalle.id },
      data: { nextActivityAt: proximo, lastActivityAt: ultima?.completedAt ?? null },
    });

    return proximo;
  });

  const sincronia = hecha
    ? "NO_APLICA"
    : await agendar(calendario, {
        actividadId: actual.id,
        correo: responsable.datos.email,
        eventoActual: actual.externalEventId
          ? { id: actual.externalEventId, correo: actual.user.email }
          : null,
        detalle,
        typeId,
        subject,
        startsAt,
        durationMin: duracion.datos,
        notes,
        zona: cambios.zona ?? "UTC",
      });

  return ok({ id: actual.id, siguienteEn, calendario: sincronia });
}

// ──────────────────────────────────────────────────────────────── auxiliares

const PREGUNTA_SIN_SEGUIMIENTO =
  "Sin siguiente paso, esta oportunidad aparecerá mañana en «sin próximo paso». ¿La cierras sin seguimiento?";

function validarDuracion(durationMin: number | null | undefined): ResultadoAccion<number | null> {
  if (durationMin == null) return ok(null);
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    return falla("VALIDACION", {
      campo: "fin",
      mensaje: "La hora de fin tiene que ir después de la de inicio.",
    });
  }
  return ok(durationMin);
}

function validarSiguiente(siguiente: SiguientePaso | undefined): ResultadoAccion<null> {
  if (siguiente && siguiente.subject.trim().length < ASUNTO_MINIMO) {
    return falla("VALIDACION", { campo: "siguiente.subject", mensaje: "Escribe cuál es el siguiente paso." });
  }
  return ok(null);
}

/**
 * El responsable tiene que estar activo y operar en el país de la oportunidad:
 * es en su agenda y en su calendario donde va a aparecer. No hay puerta por
 * rol —asignarle una demostración a preventa es coordinar, no transferir la
 * oportunidad— y por eso no aplica `Q-13`.
 */
async function responsableValido(
  userId: string,
  detalle: DetalleOportunidad,
): Promise<ResultadoAccion<{ id: string; email: string }>> {
  const usuario = await prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null, countryCodes: { has: detalle.countryCode } },
    select: { id: true, email: true },
  });
  return usuario
    ? ok(usuario)
    : falla("VALIDACION", {
        campo: "userId",
        mensaje: `Ese usuario no está activo o no opera en ${detalle.countryCode}.`,
      });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function crearSiguiente(tx: Tx, detalle: DetalleOportunidad, userId: string, s: SiguientePaso) {
  await tx.activity.create({
    data: {
      typeId: s.typeId,
      subject: s.subject.trim(),
      startsAt: s.startsAt,
      opportunityId: detalle.id,
      organizationId: detalle.organization.id,
      userId,
    },
  });
}

/** El más próximo de los que quedan pendientes, ya con lo recién escrito. */
async function proximoPendiente(tx: Tx, opportunityId: string): Promise<Date | null> {
  const proximo = await tx.activity.findFirst({
    where: { opportunityId, completedAt: null, deletedAt: null },
    select: { startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return proximo?.startsAt ?? null;
}

/**
 * Pone, mueve o actualiza el evento de una actividad por hacer, y deja el
 * resultado en `externalEventId`. Nunca lanza: lo que pase se reporta.
 */
async function agendar(
  calendario: Calendario,
  a: {
    actividadId: string;
    correo: string;
    eventoActual: { id: string; correo: string } | null;
    detalle: DetalleOportunidad;
    typeId: string;
    subject: string;
    startsAt: Date;
    durationMin: number | null;
    notes: string | null;
    zona: string;
  },
): Promise<SincroniaDeCalendario> {
  if (!calendario.configurado()) return "SIN_CALENDARIO";

  const tipo = await prisma.activityType.findUnique({ where: { id: a.typeId }, select: { name: true } });
  const evento = eventoDeActividad({
    subject: a.subject,
    startsAt: a.startsAt,
    durationMin: a.durationMin,
    zona: a.zona,
    notes: a.notes,
    esVideollamada: /videollamada/i.test(tipo?.name ?? ""),
    oportunidad: { folio: a.detalle.folio, name: a.detalle.name },
  });

  // Cambió de responsable: el evento vivía en otro calendario. Se quita de ahí
  // y se crea en el nuevo; si no se pudo quitar, se crea igual, que es lo que
  // el nuevo responsable necesita ver.
  const cambioDeCalendario = a.eventoActual && a.eventoActual.correo !== a.correo;
  if (a.eventoActual && cambioDeCalendario) {
    await calendario.eliminar(a.eventoActual.correo, a.eventoActual.id);
  }

  const r =
    a.eventoActual && !cambioDeCalendario
      ? await calendario.actualizar(a.correo, a.eventoActual.id, evento)
      : await calendario.crear(a.correo, evento);

  if (r.estado === "SIN_CONFIGURAR") return "SIN_CALENDARIO";
  if (r.estado === "FALLO") {
    if (cambioDeCalendario) await vincularEvento(a.actividadId, null);
    return "FALLO";
  }

  await vincularEvento(a.actividadId, r.eventId);
  return "AGENDADA";
}

async function vincularEvento(activityId: string, externalEventId: string | null) {
  await prisma.activity.update({ where: { id: activityId }, data: { externalEventId } });
}
