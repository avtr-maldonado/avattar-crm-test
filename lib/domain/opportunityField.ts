import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { EdicionDeOportunidad } from "./opportunity";

/**
 * Los datos que se corrigen desde la ficha, uno por uno · P-02.
 *
 * ## Por qué hay una lista y no «cualquier campo»
 *
 * El nombre del campo llega del cliente. Sin una lista cerrada, bastaría
 * cambiar un `name` en el navegador para escribir en algo que la pantalla
 * nunca ofreció. Estos cinco son exactamente los que la ficha pinta como
 * editables; el folio es inmutable (`INV-12`), la cuenta cambiaría el país y
 * la etapa tiene su propia barra, que evalúa `RN-02`.
 *
 * El nombre, el importe y la persona principal siguen en el panel de edición
 * completa: son los que se escriben mirando el resto del formulario.
 */
export const CAMPOS_RAPIDOS = [
  "businessType",
  "forecastCategory",
  "expectedCloseDate",
  "sourceId",
  "ownerId",
] as const;

export type CampoRapido = (typeof CAMPOS_RAPIDOS)[number];

const TIPOS_DE_NEGOCIO = ["NUEVO", "EXPANSION", "RENOVACION"] as const;
const CATEGORIAS = ["PIPELINE", "MEJOR_CASO", "COMPROMISO", "OMITIDA"] as const;

/** Un solo campo, traducido al cambio parcial que `editarOportunidad` entiende. */
export function cambioDeCampo(
  campo: string,
  valor: string,
): ResultadoAccion<EdicionDeOportunidad> {
  switch (campo) {
    case "businessType":
      return TIPOS_DE_NEGOCIO.some((t) => t === valor)
        ? ok({ businessType: valor as (typeof TIPOS_DE_NEGOCIO)[number] })
        : rechaza(campo, "Ese tipo de negocio no existe.");

    case "forecastCategory":
      return CATEGORIAS.some((c) => c === valor)
        ? ok({ forecastCategory: valor as (typeof CATEGORIAS)[number] })
        : rechaza(campo, "Esa categoría de pronóstico no existe.");

    case "expectedCloseDate": {
      // Mediodía, como en el alta: a medianoche, un huso al oeste de UTC
      // devuelve el día anterior y el cierre se recorrería solo por guardarlo.
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? new Date(`${valor}T12:00:00`)
        : new Date(Number.NaN);
      return Number.isNaN(fecha.getTime())
        ? rechaza(campo, "Pon la fecha de cierre estimada.")
        : ok({ expectedCloseDate: fecha });
    }

    // Vacío es «quitarlo», no «no lo toques»: la ficha ofrece «Sin registrar»
    // y hay que poder volver ahí.
    case "sourceId":
      return ok({ sourceId: valor || null });

    // El propietario no admite vacío: toda oportunidad tiene dueño, y de él
    // depende quién la ve (`RN-31`).
    case "ownerId":
      return valor ? ok({ ownerId: valor }) : rechaza(campo, "Elige el propietario.");

    default:
      return rechaza(campo, "Ese dato no se edita desde la ficha.");
  }
}

function rechaza(campo: string, mensaje: string): ResultadoAccion<never> {
  return falla("VALIDACION", { campo, mensaje });
}
