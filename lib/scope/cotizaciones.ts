import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { opportunityScope } from "./opportunities";
import { quoteSelect } from "./selectors";

/**
 * Una cotización, con el alcance de su oportunidad y los selectores de costo.
 *
 * ## Dos filtros distintos, y los dos hacen falta
 *
 * `opportunityScope` decide **qué filas** alcanza la sesión (INV-01) y
 * `quoteSelect` decide **qué columnas** (INV-02). RLS podría hacer lo primero;
 * lo segundo no, porque filtra filas y el invariante más delicado del sistema
 * es de columnas. Por eso ambos viven aquí.
 *
 * `forzarAlcance: false` **no salta la autorización de columnas** —esa nunca se
 * salta—: solo omite el filtro por oportunidad, y existe para poder verificar
 * en pruebas qué serializa una sesión dada sobre una fila conocida. En la
 * aplicación siempre se llama sin él.
 */
export async function getCotizacion(
  session: Session,
  id: string,
  opciones: { forzarAlcance?: boolean } = {},
) {
  const alcance = opciones.forzarAlcance === false ? {} : { opportunity: opportunityScope(session) };

  return prisma.quote.findFirst({
    where: { AND: [{ id }, alcance] },
    select: {
      ...quoteSelect(session),
      // La oportunidad se necesita para saber si sigue abierta y para escribir
      // el espejo del neto; no es dato del cliente.
      opportunity: { select: { id: true, status: true, countryCode: true } },
    },
  });
}

export type CotizacionConLineas = NonNullable<Awaited<ReturnType<typeof getCotizacion>>>;

/**
 * La cotización vigente de una oportunidad: la de mayor versión.
 *
 * Es una sola y editable (decisiones §21). Las versiones anteriores a ese
 * cambio siguen en la base como historia que nadie lee; se toma la última,
 * que es la que se estaba trabajando.
 */
export async function cotizacionVigente(session: Session, opportunityId: string) {
  return prisma.quote.findFirst({
    where: { AND: [{ opportunityId }, { opportunity: opportunityScope(session) }] },
    select: {
      ...quoteSelect(session),
      opportunity: { select: { id: true, status: true, countryCode: true } },
    },
    orderBy: { version: "desc" },
  });
}
