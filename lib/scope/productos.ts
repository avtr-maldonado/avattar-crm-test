import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * El catálogo de productos y su lista de precio · P-06.
 *
 * ## Por qué el margen NO sale sin `VER_COSTO`, aunque RN-09 los separe
 *
 * RN-09 dice que ver margen y ver costo son permisos independientes, y en la
 * cotización eso tiene sentido: el vendedor necesita el margen para negociar.
 *
 * Pero en un catálogo el margen **es** el costo. Con el precio de lista a la
 * vista, `costo = precio × (1 − margen)` lo recupera exacto, no aproximado:
 * con 18 000 y 47.2 % salen 9 500 clavados. Es la misma aritmética que hacía
 * inútil la vista «sin costo» del esquema archivado, donde bastaba restar la
 * utilidad del importe.
 *
 * Así que sin `VER_COSTO` esta consulta **no trae costo ni margen**. Lo que sí
 * trae es `minPrice`, que es el piso duro de RN-08 y lo que el vendedor
 * realmente necesita para saber hasta dónde puede bajar.
 *
 * Queda anotado en `docs/decisiones-pendientes.md`: RN-09 al nivel de línea de
 * cotización tiene el mismo problema, y esa sí es una decisión de negocio.
 */
export async function listProductos(session: Session) {
  const verCosto = can(session, "VER_COSTO");
  const hoy = new Date();

  const productos = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      unit: true,
      priceModel: true,
      active: true,
      // C-01 · sin Defontana, el costo se mantiene a mano. Cuándo se tocó por
      // última vez es lo que dice si el margen es confiable, así que la fecha
      // se muestra aunque el costo no.
      ...(verCosto ? { costSource: true, costUpdatedAt: true } : {}),
      family: { select: { id: true, name: true } },
      prices: {
        where: { validFrom: { lte: hoy }, validTo: { gte: hoy } },
        select: {
          id: true,
          listPrice: true,
          minPrice: true,
          validFrom: true,
          validTo: true,
          ...(verCosto ? { standardCost: true } : {}),
        },
        orderBy: { validFrom: "desc" },
        take: 1,
      },
      _count: { select: { quoteLines: true } },
    },
    orderBy: [{ family: { name: "asc" } }, { sku: "asc" }],
  });

  return productos;
}

export type ProductoDeCatalogo = Awaited<ReturnType<typeof listProductos>>[number];

/**
 * Todas las vigencias de la lista de precio, para la pestaña de listas.
 *
 * RN-26 · se cotiza con la vigente a la fecha, y cambiar una lista no altera
 * cotizaciones congeladas. Ver el histórico de vigencias es lo que permite
 * explicar por qué una cotización vieja tiene otro precio.
 */
export async function listVigenciasDePrecio(session: Session) {
  const verCosto = can(session, "VER_COSTO");

  return prisma.priceListEntry.findMany({
    select: {
      id: true,
      listPrice: true,
      minPrice: true,
      validFrom: true,
      validTo: true,
      ...(verCosto ? { standardCost: true } : {}),
      product: {
        select: { id: true, sku: true, name: true, unit: true, family: { select: { name: true } } },
      },
    },
    orderBy: [{ validFrom: "desc" }, { product: { sku: "asc" } }],
  });
}

/**
 * Un producto con su vigencia actual, para editarlo.
 *
 * Trae también las vigencias futuras si las hubiera: cerrar la actual sin saber
 * que hay otra programada dejaría dos listas solapadas.
 */
export async function getProducto(session: Session, id: string) {
  const verCosto = can(session, "VER_COSTO");
  const hoy = new Date();

  return prisma.product.findFirst({
    where: { id },
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      unit: true,
      priceModel: true,
      active: true,
      costUpdatedAt: true,
      family: { select: { id: true, name: true } },
      prices: {
        where: { validTo: { gte: hoy } },
        select: {
          id: true,
          listPrice: true,
          minPrice: true,
          validFrom: true,
          validTo: true,
          ...(verCosto ? { standardCost: true } : {}),
        },
        orderBy: { validFrom: "asc" },
      },
      _count: { select: { quoteLines: true } },
    },
  });
}

export type ProductoEditable = NonNullable<Awaited<ReturnType<typeof getProducto>>>;
