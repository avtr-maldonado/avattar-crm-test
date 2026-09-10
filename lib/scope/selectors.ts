import type { Prisma } from "@prisma/client";
import { can, type Session } from "@/lib/auth/permissions";

/**
 * Los selectores · INV-02.
 *
 * El costo y la utilidad **no salen del servidor** si el usuario no tiene
 * `VER_COSTO`. No se ocultan en el componente: no se consultan. La diferencia
 * es todo el invariante — un dato que llegó al navegador ya se filtró, por más
 * que la pantalla no lo pinte.
 *
 * Por eso estas funciones **omiten la clave** en vez de ponerla en `false`.
 * Prisma trata ambas igual, pero la ausencia es lo que se puede afirmar
 * inspeccionando el objeto, y AC-03 pide exactamente eso: que las claves
 * `unitCost`, `totalCost` y `grossProfit` no estén en el JSON.
 *
 * `VER_MARGEN` y `VER_COSTO` son permisos **independientes** (RN-09): el
 * vendedor conoce su margen sin conocer el costo unitario del proveedor. Cada
 * uno gobierna sus propias columnas: `grossMargin` depende de `VER_MARGEN`,
 * mientras que `grossProfit`, `totalCost` y `unitCost` dependen de `VER_COSTO`.
 * Hoy los cinco roles tienen `VER_MARGEN`, pero la matriz es editable desde
 * Administración, así que el selector lo consulta en vez de darlo por hecho.
 *
 * Nunca usar `select: undefined` ni `include` sin `select`: eso trae todas las
 * columnas, costo incluido.
 */

/** Línea de cotización. `unitCost` solo con permiso. */
export function quoteLineSelect(session: Session): Prisma.QuoteLineSelect {
  const base: Prisma.QuoteLineSelect = {
    id: true,
    position: true,
    productId: true,
    description: true,
    unit: true,
    quantity: true,
    unitPrice: true,
    discountRate: true,
  };
  return can(session, "VER_COSTO") ? { ...base, unitCost: true } : base;
}

/** Cotización. Cada columna sensible según su propio permiso. */
export function quoteSelect(session: Session): Prisma.QuoteSelect {
  const base: Prisma.QuoteSelect = {
    id: true,
    opportunityId: true,
    version: true,
    status: true,
    currency: true,
    grossSubtotal: true,
    netSubtotal: true,
    discountRate: true,
    taxRate: true,
    taxAmount: true,
    total: true,
    // RN-09 · el margen es independiente del costo, y depende de su propio
    // permiso.
    ...(can(session, "VER_MARGEN") ? { grossMargin: true } : {}),
    frozenAt: true,
    createdAt: true,
    lines: { select: quoteLineSelect(session), orderBy: { position: "asc" } },
  };

  return can(session, "VER_COSTO")
    ? { ...base, totalCost: true, grossProfit: true }
    : base;
}

/**
 * Tarjeta del kanban y renglón de la tabla (P-01).
 *
 * Lo que la tarjeta muestra según §11: nombre, organización, importe, margen,
 * puntaje MEDDIC, fecha de cierre, iniciales del propietario y las banderas.
 * Las banderas se calculan (INV-11), así que se traen sus insumos, no un campo.
 */
export function opportunityCardSelect(session: Session): Prisma.OpportunitySelect {
  const base: Prisma.OpportunitySelect = {
    id: true,
    folio: true,
    name: true,
    amount: true,
    currency: true,
    // RN-09 · el margen depende de VER_MARGEN, que es independiente de
    // VER_COSTO. Hoy los cinco roles lo tienen, pero la matriz es editable
    // desde Administración: si alguien lo revoca, la columna debe dejar de
    // salir del servidor, no solo de pintarse.
    ...(can(session, "VER_MARGEN") ? { grossMargin: true } : {}),
    meddicScore: true,
    status: true,
    forecastCategory: true,
    expectedCloseDate: true,
    countryCode: true,
    // Insumos de las banderas de riesgo (RN-13). No hay campo «en riesgo».
    stageEnteredAt: true,
    lastActivityAt: true,
    nextActivityAt: true,
    organization: { select: { id: true, name: true } },
    stage: { select: { id: true, name: true, position: true, probability: true, staleAfterDays: true } },
    owner: { select: { id: true, name: true, initials: true } },
  };
  return base;
}

/** Detalle de la oportunidad (P-02). */
export function opportunityDetailSelect(session: Session): Prisma.OpportunitySelect {
  return {
    ...opportunityCardSelect(session),
    estimatedAmount: true,
    businessType: true,
    partnerName: true,
    actualCloseDate: true,
    lossCompetitor: true,
    createdAt: true,
    updatedAt: true,
    pipeline: { select: { id: true, name: true } },
    primaryPerson: {
      select: {
        id: true,
        name: true,
        initials: true,
        jobTitle: true,
        committeeRole: { select: { id: true, name: true } },
      },
    },
    lossReason: { select: { id: true, name: true, requiresCompetitor: true } },
    source: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, initials: true } },
  };
}
