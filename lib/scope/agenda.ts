import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
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
) {
  const enOficina = pais ? actividadEnOficina(pais) : {};
  const inicioDeHoy = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
  );
  const finDeHoy = new Date(inicioDeHoy.getTime() + 86_400_000 - 1);

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
) {
  // La semana arranca en lunes: es una agenda de trabajo, no un calendario.
  const diaDeLaSemana = (ahora.getUTCDay() + 6) % 7;
  const lunes = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - diaDeLaSemana),
  );
  const domingo = new Date(lunes.getTime() + 7 * 86_400_000 - 1);

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
  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(lunes.getTime() + i * 86_400_000);
    return {
      fecha,
      esHoy: fecha.toISOString().slice(0, 10) === ahora.toISOString().slice(0, 10),
      actividades: actividades.filter(
        (a) => a.startsAt.toISOString().slice(0, 10) === fecha.toISOString().slice(0, 10),
      ),
    };
  });

  return { lunes, domingo, dias, total: actividades.length };
}
