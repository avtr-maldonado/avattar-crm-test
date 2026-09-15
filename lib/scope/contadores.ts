import { cache } from "react";
import type { CountryCode } from "@prisma/client";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { actividadEnOficina, activityScope } from "./activities";
import { opportunityScope } from "./opportunities";

/**
 * Los contadores de la barra lateral · §13.5.
 *
 * «Contadores en los rubros con pendientes.» La palabra que manda es
 * **pendientes**: no cuentan cuántas cosas hay, cuentan cuántas piden acción.
 * Un número junto a Contactos no significaría nada; junto a Autorizaciones
 * significa que alguien está esperando una respuesta con un reloj corriendo.
 *
 * Todos pasan por `lib/scope` (INV-01). Para un Vendedor son los suyos: si el
 * contador de oportunidades mostrara el total de la oficina, sería la fuga de
 * §2.3 por agregación, en la navegación y a la vista permanente.
 *
 * ## Y se acotan a la oficina activa
 *
 * Quien opera en varios países ve, en cada momento, los pendientes del país
 * que eligió en la barra superior; los demás no desaparecen, solo esperan a
 * que cambie de oficina. La oficina va **después** del alcance del rol, con
 * `AND`: nunca lo amplía (AC-25). Un vendedor de México con la oficina en
 * Colombia cuenta cero, no las de Colombia.
 *
 * `cache` los resuelve una vez por request, no una por rubro.
 */
export type Contadores = {
  oportunidades: number;
  actividades: number;
  autorizaciones: number;
};

export const contadoresDeNavegacion = cache(
  async (session: Session, pais: CountryCode): Promise<Contadores> => {
    const ahora = new Date();
    const finDeHoy = new Date(
      Date.UTC(
        ahora.getUTCFullYear(),
        ahora.getUTCMonth(),
        ahora.getUTCDate(),
        23,
        59,
        59,
      ),
    );

    const [oportunidades, actividades, autorizaciones] = await Promise.all([
      // Solo abiertas: las cerradas no piden nada.
      prisma.opportunity.count({
        where: { AND: [opportunityScope(session), { status: "ABIERTA", countryCode: pais }] },
      }),

      // §12.4 · lo que el vendedor tiene que resolver hoy: vencidas y de hoy,
      // sin completar. Es la bandeja con la que empieza su día, acotada a la
      // oficina con la misma cláusula que usa la bandeja (`agenda.ts`), para
      // que el número del menú y la pantalla digan lo mismo.
      prisma.activity.count({
        where: {
          AND: [
            activityScope(session),
            { completedAt: null, startsAt: { lte: finDeHoy } },
            actividadEnOficina(pais),
          ],
        },
      }),

      // RN-04 · nadie autoriza su propia solicitud, así que al solicitante no
      // le corresponde el contador: es del que tiene que resolver.
      contarAutorizacionesPendientes(session, pais),
    ]);

    return { oportunidades, actividades, autorizaciones };
  },
);

/**
 * Autorizaciones que **este** usuario tiene que resolver, en la oficina activa.
 *
 * Un Vendedor ve las que originó, en lectura (§5.3), pero no son un pendiente
 * suyo: no puede hacer nada con ellas. Contárselas sería pedirle acción sobre
 * algo que no controla, que es la forma más rápida de que aprenda a ignorar los
 * contadores.
 */
async function contarAutorizacionesPendientes(
  session: Session,
  pais: CountryCode,
): Promise<number> {
  if (session.role === "VENDEDOR" || session.role === "PREVENTA") return 0;

  // El alcance del gerente ya recorta por país; la oficina activa recorta de
  // nuevo, dentro de ese alcance.
  const alcance =
    session.role === "GERENTE_PAIS" ? { in: session.countryCodes.filter((c) => c === pais) } : pais;

  return prisma.discountApprovalRequest.count({
    where: {
      status: "PENDIENTE",
      // Nadie resuelve la propia.
      requestedById: { not: session.userId },
      opportunity: { countryCode: alcance },
    },
  });
}
