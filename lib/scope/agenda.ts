import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fechaEn, instanteEn, lunesDe, sumarDias } from "@/lib/tiempo";
import { actividadEnOficina, activityScope } from "./activities";
import { opportunityScope } from "./opportunities";

/**
 * La bandeja de trabajo del vendedor · §11 P-07, §12.4.
 *
 * «Es el flujo que decide la adopción, así que se diseña primero: entra a
 * `/actividades`, ve vencidas, hoy y oportunidades sin próxima actividad;
 * resuelve cada una registrando la actividad y su siguiente paso en el mismo
 * formulario; lo que quede sin siguiente paso aparece mañana en la tercera
 * lista.»
 *
 * ## Por qué son tres listas y no una
 *
 * Las tres piden acciones distintas. **Vencidas** es deuda: algo se prometió y
 * no se hizo. **Hoy** es el plan del día. **Sin próxima actividad** no es una
 * actividad en absoluto — es una oportunidad abandonada, y es la única de las
 * tres que no aparece en ninguna agenda porque justamente no hay nada agendado.
 * Mezclarlas convertiría la pantalla en una lista larga que nadie termina.
 *
 * Todo pasa por `lib/scope`: un gerente ve su oficina, un vendedor lo suyo.
 * Con `pais`, además, solo lo de esa oficina (`decisiones-pendientes.md` §16):
 * es lo que hace que el contador de Actividades del menú y esta pantalla
 * cuenten lo mismo.
 */
/**
 * Lo que la fila muestra y lo que el lápiz necesita para editar en el sitio:
 * el país de la oportunidad decide la zona y los responsables (decisiones §20).
 */
const SELECCION_DE_AGENDA = {
  id: true,
  subject: true,
  notes: true,
  outcome: true,
  transcript: true,
  startsAt: true,
  durationMin: true,
  completedAt: true,
  externalEventId: true,
  type: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, initials: true } },
  opportunity: { select: { id: true, folio: true, name: true, amount: true, countryCode: true } },
  organization: { select: { id: true, name: true } },
} as const;

export type BandejaDeTrabajo = Awaited<ReturnType<typeof bandejaDeTrabajo>>;

type ConOportunidad = { opportunity: { id: string } | null };

/** La misma actividad, con `accesible` en su oportunidad. */
type ConAcceso<A extends ConOportunidad> = Omit<A, "opportunity"> & {
  opportunity: (NonNullable<A["opportunity"]> & { accesible: boolean }) | null;
};

/**
 * Marca en cada actividad si su oportunidad **sigue** al alcance de la sesión
 * (decisiones §46). El alcance de actividades es más ancho que el de
 * oportunidades: quien fue responsable de una actividad la conserva en su
 * historial aunque ya no vea la oportunidad —a Preventa se le quita el apoyo,
 * un vendedor deja de ser propietario—. La pantalla no debe ofrecer un enlace
 * que termine en 404 ni un lápiz que el servidor vaya a rechazar.
 *
 * Una sola consulta por lectura, por los ids que aparecen; el alcance lo pone
 * `opportunityScope`, igual que en todas partes (INV-01).
 */
async function conAccesoAOportunidad<A extends ConOportunidad>(session: Session, actividades: A[]): Promise<ConAcceso<A>[]> {
  const ids = [...new Set(actividades.flatMap((a) => (a.opportunity ? [a.opportunity.id] : [])))];
  const alcanzables = new Set(
    ids.length === 0
      ? []
      : (
          await prisma.opportunity.findMany({
            where: { AND: [opportunityScope(session), { id: { in: ids } }] },
            select: { id: true },
          })
        ).map((o) => o.id),
  );
  return actividades.map(
    (a) =>
      ({
        ...a,
        opportunity: a.opportunity ? { ...a.opportunity, accesible: alcanzables.has(a.opportunity.id) } : null,
      }) as ConAcceso<A>,
  );
}

/**
 * El filtro «solo las mías» · §52.
 *
 * El alcance de un vendedor ya incluye las actividades de sus oportunidades
 * aunque el responsable sea otro (§2.3), y eso se queda: ver lo que pasa en una
 * oportunidad propia es parte de trabajarla. Lo que faltaba era poder recortar
 * a lo que a uno le toca hacer.
 *
 * Recorta **dentro** del alcance y nunca lo amplía: se agrega al `AND` que ya
 * lleva `activityScope`, igual que la oficina activa (§16).
 */
function soloDe(session: Session, soloMias: boolean): Prisma.ActivityWhereInput {
  return soloMias ? { userId: session.userId } : {};
}

export async function bandejaDeTrabajo(
  session: Session,
  ahora = new Date(),
  pais?: CountryCode,
  /** La zona de la oficina: «hoy» es el día de esa ciudad, no el de UTC. */
  zona = "UTC",
  /** Solo lo que esta sesión tiene a su cargo (§52). */
  soloMias = false,
) {
  const enOficina = pais ? actividadEnOficina(pais) : {};
  const { inicio: inicioDeHoy, fin: finDeHoy } = diaEn(fechaEn(ahora, zona), zona);


  const [vencidas, hoy, sinProxima] = await Promise.all([
    prisma.activity.findMany({
      where: {
        AND: [
          activityScope(session),
          { completedAt: null, startsAt: { lt: inicioDeHoy } },
          enOficina,
          soloDe(session, soloMias),
        ],
      },
      select: SELECCION_DE_AGENDA,
      // Lo más viejo primero: es lo que más tiempo lleva sin atenderse.
      orderBy: { startsAt: "asc" },
    }),

    prisma.activity.findMany({
      where: {
        AND: [
          activityScope(session),
          { completedAt: null, startsAt: { gte: inicioDeHoy, lte: finDeHoy } },
          enOficina,
          soloDe(session, soloMias),
        ],
      },
      select: SELECCION_DE_AGENDA,
      orderBy: { startsAt: "asc" },
    }),

    // RN-10 · «Actividad futura obligatoria en toda oportunidad abierta.» Esta
    // lista es la que hace que la regla exista en la práctica: sin ella, la
    // bandera del kanban avisa pero no hay dónde resolverla en bloque.
    prisma.opportunity.findMany({
      where: {
        AND: [
          opportunityScope(session),
          {
            status: "ABIERTA",
            // `undefined` no filtra: sin oficina, todo el alcance.
            countryCode: pais,
            OR: [{ nextActivityAt: null }, { nextActivityAt: { lt: ahora } }],
          },
        ],
      },
      select: {
        id: true,
        folio: true,
        name: true,
        amount: true,
        expectedCloseDate: true,
        lastActivityAt: true,
        organization: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, initials: true } },
      },
      orderBy: { amount: "desc" },
    }),
  ]);

  const [vencidasConAcceso, hoyConAcceso] = await Promise.all([
    conAccesoAOportunidad(session, vencidas),
    conAccesoAOportunidad(session, hoy),
  ]);
  return { vencidas: vencidasConAcceso, hoy: hoyConAcceso, sinProxima, inicioDeHoy };
}

const DIAS_DE_HISTORIA = 14;

/**
 * El tablero de actividades · P-07, decisiones §42: lo que alimenta la lista
 * y el kanban.
 *
 * Todo lo pendiente, de cualquier fecha (la deuda no caduca), más lo hecho en
 * las últimas dos semanas: lo bastante para ver qué se cerró sin convertir la
 * pantalla en un archivo. El estado de cada una se calcula en `lib/domain/agenda`.
 */
export async function tableroDeActividades(
  session: Session,
  ahora = new Date(),
  pais?: CountryCode,
  zona = "UTC",
  /** Solo lo que esta sesión tiene a su cargo (§52). */
  soloMias = false,
  /**
   * El lapso de la URL (§55): con él, lo que **empieza** dentro del rango,
   * hecho o pendiente, y la regla de «pendientes más dos semanas» se apaga. Es
   * un recorte distinto, no uno más: por eso cambia la consulta y no se filtra
   * en memoria.
   */
  rango?: { desde: Date; hasta: Date },
) {
  const enOficina = pais ? actividadEnOficina(pais) : {};
  const { inicio: inicioDeHoy } = diaEn(fechaEn(ahora, zona), zona);
  const desde = new Date(ahora.getTime() - DIAS_DE_HISTORIA * 24 * 60 * 60 * 1000);

  const actividades = await prisma.activity.findMany({
    where: {
      AND: [
        activityScope(session),
        rango
          ? { startsAt: { gte: rango.desde, lte: rango.hasta } }
          : { OR: [{ completedAt: null }, { completedAt: { gte: desde } }] },
        enOficina,
        soloDe(session, soloMias),
      ],
    },
    select: SELECCION_DE_AGENDA,
    orderBy: { startsAt: "asc" },
  });

  return { actividades: await conAccesoAOportunidad(session, actividades), inicioDeHoy, desde };
}

/**
 * La agenda de la semana · §11 P-07.
 *
 * Se trae completa —realizadas y pendientes— porque la semana es un registro,
 * no una lista de pendientes: ver lo que ya se hizo es la mitad de para qué
 * alguien abre una agenda.
 */
export async function agendaSemanal(
  session: Session,
  ahora = new Date(),
  pais?: CountryCode,
  /** La zona de la oficina: los días de la semana son los de esa ciudad. */
  zona = "UTC",
  /** El lunes de la semana que se quiere ver, `YYYY-MM-DD`; sin él, la de hoy (decisiones §44). */
  semana?: string,
  /** Solo lo que esta sesión tiene a su cargo (§52). */
  soloMias = false,
) {
  // La semana arranca en lunes: es una agenda de trabajo, no un calendario.
  // Se calcula sobre la fecha local de la oficina, y cada cubeta va de la
  // medianoche local a la siguiente: una reunión a las 22:00 en CDMX es del
  // 29, aunque en UTC ya sea el 30. «Hoy» sigue siendo hoy aunque se navegue
  // a otra semana: ahí simplemente no se marca ningún día.
  const hoy = fechaEn(ahora, zona);
  const inicio = semana ?? lunesDe(hoy);
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
  const lunes = diaEn(fechas[0]!, zona).inicio;
  const domingo = diaEn(fechas[6]!, zona).fin;

  const actividades = await prisma.activity.findMany({
    where: {
      AND: [
        activityScope(session),
        { startsAt: { gte: lunes, lte: domingo } },
        pais ? actividadEnOficina(pais) : {},
        soloDe(session, soloMias),
      ],
    },
    select: {
      id: true,
      subject: true,
      notes: true,
      outcome: true,
      transcript: true,
      startsAt: true,
      completedAt: true,
      durationMin: true,
      externalEventId: true,
      type: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, initials: true } },
      opportunity: { select: { id: true, folio: true, name: true, countryCode: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  const conAcceso = await conAccesoAOportunidad(session, actividades);

  // Siete cubetas siempre, aunque un día quede vacío: un calendario al que le
  // faltan días deja de leerse como semana.
  const dias = fechas.map((clave) => ({
    fecha: diaEn(clave, zona).inicio,
    /** El día del mes, ya en la zona: la pantalla no tiene que volver a calcularlo. */
    dia: Number(clave.slice(8)),
    esHoy: clave === hoy,
    actividades: conAcceso.filter((a) => fechaEn(a.startsAt, zona) === clave),
  }));

  return { lunes, domingo, dias, total: actividades.length };
}

/** El primer y el último instante de una fecha `YYYY-MM-DD` en una zona. */
function diaEn(fecha: string, zona: string) {
  const inicio = instanteEn(fecha, "00:00", zona);
  const fin = new Date(instanteEn(sumarDias(fecha, 1), "00:00", zona).getTime() - 1);
  return { inicio, fin };
}

/**
 * Las oportunidades a las que esta sesión puede agendarle una actividad desde
 * la pantalla de Actividades (§55): las **abiertas** a su alcance —el mismo
 * `opportunityScope` de siempre, así que Preventa ve las que apoya— y, con
 * oficina activa, solo las de esa oficina, que recorta y nunca amplía (§16).
 * Trae lo que el campo «Oportunidad» muestra y lo que el composer necesita
 * para elegir zona y responsables: el país.
 */
export async function oportunidadesParaAgendar(session: Session, pais?: CountryCode) {
  return prisma.opportunity.findMany({
    where: {
      AND: [opportunityScope(session), { status: "ABIERTA", countryCode: pais }],
    },
    select: {
      id: true,
      folio: true,
      name: true,
      countryCode: true,
      organization: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}

export type OportunidadParaAgendar = Awaited<ReturnType<typeof oportunidadesParaAgendar>>[number];
