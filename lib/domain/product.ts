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
 * ## El piso se deriva · `RN-08` e `INV-05`
 *
 * `minPrice` no se captura. Sale de `costo / (1 − piso de margen por línea)`,
 * topado al precio de lista —el arreglo de §9.1—. El piso viene de
 * `CommercialPolicy`, por parámetro: `lib/domain` no lee `lib/policy` (AC-31).
 *
 * La lista es única en USD para los tres países, pero el piso de margen es por
 * país. **Se hereda del seed usar el de México.** Si el negocio prefiere el más
 * estricto de los tres, es una línea en la acción que lee la política.
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

/**
 * `RN-08` · el piso duro de descuento, derivado del costo y del piso de margen.
 *
 * Con `Decimal` de punta a punta (INV-03) y a cuatro decimales, que es la
 * precisión de la columna.
 */
export function pisoDePrecio(costo: Money, lista: Money, pisoMargen: Money): Money {
  const porMargen = costo.div(money(1).minus(pisoMargen)).toDecimalPlaces(4);
  // Un piso por encima del techo no significa nada: el producto no se podría
  // vender ni a precio de lista (§9.1).
  return porMargen.gt(lista) ? lista : porMargen;
}

type Umbrales = { lineMarginFloor: string };

/** Lo que valida cualquier par precio/costo antes de escribirse. */
function validarPrecios(
  listPrice: Money,
  standardCost: Money,
): { campo: string; mensaje: string } | null {
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
  listPrice: string;
  standardCost: string;
};

export async function crearProducto(
  session: Session,
  input: AltaDeProducto,
  umbrales: Umbrales,
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "EDITAR_CATALOGOS")) {
    return falla("AUTORIZACION", "El catálogo de productos lo edita Administración.");
  }
  // INV-02 · quien no ve el costo tampoco lo captura. Hoy Administración tiene
  // ambos permisos; la comprobación existe por si mañana no.
  if (!can(session, "VER_COSTO")) {
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

  const listPrice = money(input.listPrice);
  const standardCost = money(input.standardCost);
  const problema = validarPrecios(listPrice, standardCost);
  if (problema) return falla("VALIDACION", problema);

  const repetido = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (repetido) {
    return falla("VALIDACION", { campo: "sku", mensaje: `Ya existe un producto con el SKU ${sku}.` });
  }

  const hoy = diaUTC(new Date());
  const minPrice = pisoDePrecio(standardCost, listPrice, money(umbrales.lineMarginFloor));

  const creado = await prisma.product.create({
    data: {
      sku,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit: input.unit.trim(),
      priceModel: input.priceModel,
      family: { connect: { id: input.familyId } },
      // C-01 · el costo acaba de capturarse. Q-05 · sin Defontana, siempre a mano.
      costUpdatedAt: new Date(),
      costSource: "CARGA_MASIVA",
      prices: {
        create: {
          listPrice,
          minPrice,
          standardCost,
          validFrom: hoy,
          validTo: VIGENCIA_ABIERTA,
        },
      },
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
  umbrales: Umbrales,
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
  let nuevaVigencia: { listPrice: Money; minPrice: Money; standardCost: Money } | null = null;

  if (tocaPrecios) {
    // INV-02 · el costo actual no viene en el detalle si la sesión no puede
    // verlo, y sin él no hay contra qué derivar el piso.
    const vigente = producto.prices.find((p) => p.validFrom <= new Date());
    if (!vigente || !("standardCost" in vigente) || !can(session, "VER_COSTO")) {
      return falla("AUTORIZACION", "Cambiar precio o costo exige poder ver el costo.");
    }

    const listPrice = cambios.listPrice !== undefined ? money(cambios.listPrice) : vigente.listPrice;
    const standardCost =
      cambios.standardCost !== undefined ? money(cambios.standardCost) : vigente.standardCost;

    const problema = validarPrecios(listPrice, standardCost);
    if (problema) return falla("VALIDACION", problema);

    nuevaVigencia = {
      listPrice,
      standardCost,
      minPrice: pisoDePrecio(standardCost, listPrice, money(umbrales.lineMarginFloor)),
    };

    if (cambios.standardCost !== undefined && !standardCost.eq(vigente.standardCost)) {
      // C-01 · es lo que apaga el ámbar de «costo con más de 60 días».
      datos.costUpdatedAt = new Date();
    }
  }

  if (Object.keys(datos).length === 0 && !nuevaVigencia) return ok(null);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(datos).length > 0) {
      await tx.product.update({ where: { id: producto.id }, data: datos });
    }

    if (nuevaVigencia) {
      const hoy = diaUTC(new Date());
      const actual = producto.prices.find((p) => p.validFrom <= new Date())!;

      if (diaUTC(actual.validFrom).getTime() === hoy.getTime()) {
        // Segunda corrección en el mismo día: se corrige la vigencia de hoy en
        // vez de abrir una de cero días, que no significaría nada y chocaría
        // con la unicidad (productId, validFrom).
        await tx.priceListEntry.update({ where: { id: actual.id }, data: nuevaVigencia });
      } else {
        // La anterior termina ayer y la nueva empieza hoy: ni solapan ni dejan
        // hueco, que es lo que hace reproducible «el precio vigente a tal
        // fecha».
        await tx.priceListEntry.update({
          where: { id: actual.id },
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
