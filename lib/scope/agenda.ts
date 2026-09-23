import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { fechaEn, instanteEn } from "@/lib/tiempo";
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
export type BandejaDeTrabajo = Awaited<ReturnType<typeof bandejaDeTrabajo>>;

export async function bandejaDeTrabajo(
  session: Session,
  ahora = new Date(),
  pais?: CountryCode,
  /** La zona de la oficina: «hoy» es el día de esa ciudad, no el de UTC. */
  zona = "UTC",
) {
  const enOficina = pais ? actividadEnOficina(pais) : {};
  const { inicio: inicioDeHoy, fin: finDeHoy } = diaEn(fechaEn(ahora, zona), zona);

  const seleccion = {
    id: true,
    subject: true,
    notes: true,
    startsAt: true,
    durationMin: true,
    type: { select: { id: true, name: true } },
    user: { select: { id: true, name: true, initials: true } },
    opportunity: { select: { id: true, folio: true, name: true, amount: true } },
    organization: { select: { id: true, name: true } },
  } as const;

  const [vencidas, hoy, sinProxima] = await Promise.all([
    prisma.activity.findMany({
      where: {
        AND: [
          activityScope(session),
          { completedAt: null, startsAt: { lt: inicioDeHoy } },
          enOficina,
        ],
      },
      select: seleccion,
      // Lo más viejo primero: es lo que más tiempo lleva sin atenderse.
      orderBy: { startsAt: "asc" },
    }),

    prisma.activity.findMany({
      where: {
        AND: [
          activityScope(session),
          { completedAt: null, startsAt: { gte: inicioDeHoy, lte: finDeHoy } },
          enOficina,
        ],
      },
      select: seleccion,
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

  return { vencidas, hoy, sinProxima, inicioDeHoy };
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
) {
  // La semana arranca en lunes: es una agenda de trabajo, no un calendario.
  // Se calcula sobre la fecha local de la oficina, y cada cubeta va de la
  // medianoche local a la siguiente: una reunión a las 22:00 en CDMX es del
  // 29, aunque en UTC ya sea el 30.
  const hoy = fechaEn(ahora, zona);
  const diaDeLaSemana = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7;
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - diaDeLaSemana));
  const lunes = diaEn(fechas[0]!, zona).inicio;
  const domingo = diaEn(fechas[6]!, zona).fin;

  const actividades = await prisma.activity.findMany({
    where: {
      AND: [
        activityScope(session),
        { startsAt: { gte: lunes, lte: domingo } },
        pais ? actividadEnOficina(pais) : {},
      ],
    },
    select: {
      id: true,
      subject: true,
      startsAt: true,
      completedAt: true,
      durationMin: true,
      type: { select: { name: true } },
      user: { select: { name: true, initials: true } },
      opportunity: { select: { id: true, folio: true, name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Siete cubetas siempre, aunque un día quede vacío: un calendario al que le
  // faltan días deja de leerse como semana.
  const dias = fechas.map((clave) => ({
    fecha: diaEn(clave, zona).inicio,
    /** El día del mes, ya en la zona: la pantalla no tiene que volver a calcularlo. */
    dia: Number(clave.slice(8)),
    esHoy: clave === hoy,
    actividades: actividades.filter((a) => fechaEn(a.startsAt, zona) === clave),
  }));

  return { lunes, domingo, dias, total: actividades.length };
}

/** El primer y el último instante de una fecha `YYYY-MM-DD` en una zona. */
function diaEn(fecha: string, zona: string) {
  const inicio = instanteEn(fecha, "00:00", zona);
  const fin = new Date(instanteEn(sumarDias(fecha, 1), "00:00", zona).getTime() - 1);
  return { inicio, fin };
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
