import { cache } from "react";
import type { CommercialPolicy, Country, CountryCode } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Los umbrales del sistema · INV-05.
 *
 * Ningún umbral está escrito en el código. Piso de margen, umbrales de
 * descuento, mínimos MEDDIC, SLA de autorización y cobertura sana se leen de
 * `CommercialPolicy`; la tasa de impuesto y el mes de inicio del año fiscal, de
 * `Country`. Las probabilidades y los días para estancada viven en `Stage`.
 *
 * Un literal `0.20`, `0.15`, `0.16` o `0.30` en `lib/domain` es un defecto, y
 * hay una prueba de arquitectura que falla si aparece (AC-31).
 *
 * La razón de fondo: estos números todavía no están confirmados por Dirección
 * (Q-04, Q-09, y las decisiones D-07 del alcance original). Si estuvieran en el
 * código, confirmarlos exigiría un despliegue. Están en la base para que
 * cambiarlos sea editar una fila desde Administración (P-11).
 *
 * `cache` de React los resuelve una vez por request, no una por llamada: el
 * kanban consulta la política una vez por cada tarjeta si no se envuelve.
 */

/** Lee la configuración de un país. Falla si no existe: es dato de arranque. */
export const getCountry = cache(async (code: CountryCode): Promise<Country> => {
  return prisma.country.findUniqueOrThrow({ where: { code } });
});

/**
 * Lee la política comercial de un país.
 *
 * Falla si no existe en vez de devolver valores por omisión. Un país sin
 * política configurada no debe operar con umbrales inventados: eso haría que
 * las autorizaciones se disparen —o no— por razones que nadie puso ahí.
 */
export const getCommercialPolicy = cache(
  async (code: CountryCode): Promise<CommercialPolicy> => {
    return prisma.commercialPolicy.findUniqueOrThrow({ where: { countryCode: code } });
  },
);

/**
 * Lee país y política juntos. Es la combinación que necesita el cotizador:
 * la tasa de impuesto sale del país y los pisos de margen, de la política.
 */
export const getPolicyContext = cache(
  async (code: CountryCode): Promise<{ country: Country; policy: CommercialPolicy }> => {
    const [country, policy] = await Promise.all([getCountry(code), getCommercialPolicy(code)]);
    return { country, policy };
  },
);
