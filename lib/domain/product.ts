import type { PriceModel, Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import type { ProductoEditable } from "@/lib/scope/productos";

/**
 * Catálogo de productos y lista de precio · P-06.
 *
 * ## El precio no se edita: se versiona · `RN-26`
 *
 * «Se cotiza con la lista vigente a la fecha. Cambiar una lista no altera
 * cotizaciones congeladas.» Por eso cambiar precio o costo **cierra la vigencia
 * actual y abre una nueva desde hoy**. La anterior queda como histórico, y es lo
 * que permite explicar por qué una cotización vieja tiene otro precio.
 *
 * ## Sin piso de precio · decisiones §33
 *
 * Hasta el 29-sep-2026 cada vigencia traía `minPrice`, derivado del piso de
 * margen por línea (RN-08). El negocio dejó el piso fuera del alcance: la
 * lista trae precio y costo, y el descuento no tiene tope por SKU.
 *
 * ## Un producto puede no tener lista · decisiones §22
 *
 * Hay servicios cuyo precio y costo se fijan en cada oportunidad. Se crean con
 * precio y costo vacíos y **sin vigencia**: la ausencia de `PriceListEntry` ya es
 * el estado, no hace falta columna. Precio y costo **van juntos o no van**: una
 * lista con uno solo no significa nada.
 */

/**
 * Hasta cuándo rige una vigencia que nadie ha reemplazado.
 *
 * No es «fin de año»: el seed usa 31-dic-2026 y es un artefacto de la demo. Un
 * precio que caducara solo el 31 de diciembre dejaría al cotizador sin lista el
 * 1 de enero sin que nadie lo hubiera decidido.
 */
const VIGENCIA_ABIERTA = new Date("9999-12-31T00:00:00Z");

/** El día en UTC, sin hora: `validFrom` y `validTo` son `@db.Date`. */
function diaUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

function diaAnterior(fecha: Date): Date {
  const d = diaUTC(fecha);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Lo que valida cualquier par precio/costo antes de escribirse. Van juntos o no van. */
function validarPrecios(
  listPrice: Money | null,
  standardCost: Money | null,
): { campo: string; mensaje: string } | null {
  if (listPrice === null && standardCost === null) return null;
  if (listPrice === null || standardCost === null) {
    // Van juntos: con uno solo no hay lista que valga (§22).
    return {
      campo: listPrice === null ? "listPrice" : "standardCost",
      mensaje:
        "Precio de lista y costo estándar van juntos: captura los dos, o deja ambos vacíos para fijarlos en cada cotización.",
    };
  }
  if (listPrice.lte(0)) {
    return { campo: "listPrice", mensaje: "El precio de lista tiene que ser mayor que cero." };
  }
  if (standardCost.lt(0)) {
    return { campo: "standardCost", mensaje: "El costo no puede ser negativo." };
  }
  if (standardCost.gt(listPrice)) {
    // Vender bajo costo no es un descuento: es una pérdida.
    return {
      campo: "standardCost",
      mensaje: `El costo (${standardCost.toFixed(2)}) supera al precio de lista (${listPrice.toFixed(2)}).`,
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════ Alta

export type AltaDeProducto = {
  sku: string;
  name: string;
  description?: string | null;
  familyId: string;
  unit: string;
  priceModel: PriceModel;
  /** Los dos en `null` = sin lista: precio y costo se fijan en cada cotización. */
  listPrice: string | null;
  standardCost: string | null;
};

export async function crearProducto(
  session: Session,
  input: AltaDeProducto,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", "El catálogo de productos lo edita Administración.");
  }
  // INV-02 · quien no ve el costo tampoco lo captura. Hoy Administración tiene
  // ambos permisos; la comprobación existe por si mañana no.
  if (input.standardCost !== null && !can(session, "VER_COSTO")) {
    return falla("AUTORIZACION", "Capturar el costo estándar exige poder verlo.");
  }

  const sku = input.sku.trim().toUpperCase();
  if (sku.length < 3) {
    return falla("VALIDACION", { campo: "sku", mensaje: "El SKU necesita al menos tres caracteres." });
  }
  if (input.name.trim().length < 3) {
    return falla("VALIDACION", { campo: "name", mensaje: "Ponle nombre al producto." });
  }
  if (input.unit.trim().length === 0) {
    return falla("VALIDACION", { campo: "unit", mensaje: "Di en qué unidad se vende." });
  }

  const listPrice = input.listPrice === null ? null : money(input.listPrice);
  const standardCost = input.standardCost === null ? null : money(input.standardCost);
  const problema = validarPrecios(listPrice, standardCost);
  if (problema) return falla("VALIDACION", problema);
  // Sin lista, el producto existe en el catálogo y su precio se fija al cotizar.
  const lista = listPrice !== null && standardCost !== null ? { listPrice, standardCost } : null;

  const repetido = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (repetido) {
    return falla("VALIDACION", { campo: "sku", mensaje: `Ya existe un producto con el SKU ${sku}.` });
  }

  const hoy = diaUTC(new Date());

  const creado = await prisma.product.create({
    data: {
      sku,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit: input.unit.trim(),
      priceModel: input.priceModel,
      family: { connect: { id: input.familyId } },
      // C-01 · la fecha del costo existe solo si se capturó uno. Q-05 · sin
      // Defontana, siempre a mano.
      costUpdatedAt: lista ? new Date() : null,
      costSource: "CARGA_MASIVA",
      ...(lista
        ? {
            prices: {
              create: {
                ...lista,
                validFrom: hoy,
                validTo: VIGENCIA_ABIERTA,
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return ok(creado);
}

// ═══════════════════════════════════════════════════════════════ Edición

export type EdicionDeProducto = {
  name?: string;
  description?: string | null;
  familyId?: string;
  unit?: string;
  priceModel?: PriceModel;
  active?: boolean;
  listPrice?: string;
  standardCost?: string;
};

/**
 * Edita un producto. **El SKU no está en la firma**: lo referencian líneas de
 * cotización y reportes por familia, así que se fija al crear, como el folio.
 *
 * Desactivar es lo más lejos que se llega: nada se borra (INV-15, MD-05).
 */
export async function editarProducto(
  session: Session,
  producto: ProductoEditable,
  cambios: EdicionDeProducto,
): Promise<ResultadoAccion> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", "El catálogo de productos lo edita Administración.");
  }

  const datos: Prisma.ProductUpdateInput = {};

  if (cambios.name !== undefined) {
    if (cambios.name.trim().length < 3) {
      return falla("VALIDACION", { campo: "name", mensaje: "Ponle nombre al producto." });
    }
    datos.name = cambios.name.trim();
  }
  if (cambios.description !== undefined) datos.description = cambios.description?.trim() || null;
  if (cambios.unit !== undefined) {
    if (cambios.unit.trim().length === 0) {
      return falla("VALIDACION", { campo: "unit", mensaje: "Di en qué unidad se vende." });
    }
    datos.unit = cambios.unit.trim();
  }
  if (cambios.priceModel !== undefined) datos.priceModel = cambios.priceModel;
  if (cambios.active !== undefined) datos.active = cambios.active;
  if (cambios.familyId !== undefined) datos.family = { connect: { id: cambios.familyId } };

  // ── Precio o costo: nueva vigencia · RN-26 ───────────────────────────────
  const tocaPrecios = cambios.listPrice !== undefined || cambios.standardCost !== undefined;
  let nuevaVigencia: { listPrice: Money; standardCost: Money } | null = null;
  // La vigencia de hoy, si la hay. Un producto sin lista (§22) no tiene ninguna.
  const vigente = producto.prices.find((p) => p.validFrom <= new Date()) ?? null;

  if (tocaPrecios) {
    // INV-02 · el costo actual no viene en el detalle si la sesión no puede
    // verlo, y sin él no se puede abrir una vigencia completa.
    if (!can(session, "VER_COSTO") || (vigente && !("standardCost" in vigente))) {
      return falla("AUTORIZACION", "Cambiar precio o costo exige poder ver el costo.");
    }
    const costoVigente = vigente && "standardCost" in vigente ? vigente.standardCost : null;

    const listPrice =
      cambios.listPrice !== undefined ? money(cambios.listPrice) : (vigente?.listPrice ?? null);
    const standardCost =
      cambios.standardCost !== undefined ? money(cambios.standardCost) : costoVigente;

    const problema = validarPrecios(listPrice, standardCost);
    if (problema) return falla("VALIDACION", problema);

    if (listPrice !== null && standardCost !== null) {
      nuevaVigencia = {
        listPrice,
        standardCost,
      };

      if (
        cambios.standardCost !== undefined &&
        (costoVigente === null || !standardCost.eq(costoVigente))
      ) {
        // C-01 · es lo que apaga el ámbar de «costo con más de 60 días».
        datos.costUpdatedAt = new Date();
      }
    }
  }

  if (Object.keys(datos).length === 0 && !nuevaVigencia) return ok(null);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(datos).length > 0) {
      await tx.product.update({ where: { id: producto.id }, data: datos });
    }

    if (nuevaVigencia) {
      const hoy = diaUTC(new Date());

      if (!vigente) {
        // La primera lista de un producto que nació sin ella: empieza hoy.
        await tx.priceListEntry.create({
          data: {
            productId: producto.id,
            ...nuevaVigencia,
            validFrom: hoy,
            validTo: VIGENCIA_ABIERTA,
          },
        });
      } else if (diaUTC(vigente.validFrom).getTime() === hoy.getTime()) {
        // Segunda corrección en el mismo día: se corrige la vigencia de hoy en
        // vez de abrir una de cero días, que no significaría nada y chocaría
        // con la unicidad (productId, validFrom).
        await tx.priceListEntry.update({ where: { id: vigente.id }, data: nuevaVigencia });
      } else {
        // La anterior termina ayer y la nueva empieza hoy: ni solapan ni dejan
        // hueco, que es lo que hace reproducible «el precio vigente a tal
        // fecha».
        await tx.priceListEntry.update({
          where: { id: vigente.id },
          data: { validTo: diaAnterior(hoy) },
        });
        await tx.priceListEntry.create({
          data: {
            productId: producto.id,
            ...nuevaVigencia,
            validFrom: hoy,
            validTo: VIGENCIA_ABIERTA,
          },
        });
      }
    }
  });

  return ok(null);
}
