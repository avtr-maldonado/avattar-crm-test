"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { getCommercialPolicy } from "@/lib/policy";
import {
  buscarOrganizacionesParaAlta,
  buscarPersonasDeOrganizacion,
} from "@/lib/scope/organizations";
import { listPipelines } from "@/lib/scope/pipelines";

/**
 * Sugerencias de organización mientras se teclea.
 *
 * Devuelve nombre, tipo y ciudad. Nunca el propietario ni cifras: la excepción
 * al alcance que documenta `buscarOrganizacionesParaAlta` está acotada a eso.
 */
export async function buscarOrganizacionesAccion(texto: string) {
  const session = await requireSession();
  const encontradas = await buscarOrganizacionesParaAlta(session, texto);

  return encontradas.map((o) => ({
    id: o.id,
    nombre: o.name,
    detalle: [ETIQUETA_TIPO[o.type], o.city].filter(Boolean).join(" · "),
  }));
}

const ETIQUETA_TIPO: Record<string, string> = {
  CLIENTE: "Cliente",
  PROSPECTO: "Prospecto",
  PARTNER: "Partner",
  FABRICANTE: "Fabricante",
  PROVEEDOR: "Proveedor",
};

/**
 * Los contactos de la organización elegida, para el desplegable de persona
 * principal. Todos, ordenados por nombre: una cuenta tiene un puñado y verlos
 * juntos es lo que evita crear un duplicado.
 *
 * Aquí sí manda el alcance por rol. Si la sesión no alcanza la cuenta, la
 * lista llega vacía y solo queda capturar un contacto nuevo.
 */
export async function personasDeOrganizacionAccion(organizationId: string) {
  const session = await requireSession();
  const personas = await buscarPersonasDeOrganizacion(session, organizationId);

  // Un solo calificador: en un <option> no hay segunda línea y con dos se
  // corta. El cargo distingue mejor a dos homónimos; el rol, si no hay cargo.
  return personas.map((p) => ({
    id: p.id,
    nombre: p.name,
    detalle: p.jobTitle ?? p.committeeRole?.name ?? null,
  }));
}

/**
 * `INV-03` · el importe viaja como cadena, nunca como `number`. Un importe en
 * punto flotante pierde centavos y `Decimal(18,4)` los guarda. Se aceptan comas
 * de miles porque la gente las escribe, y se quitan antes de validar.
 */
const importe = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, "Escribe el importe en dólares, sin símbolo. Ejemplo: 1200000")
      .refine((v) => Number(v) > 0, "El importe tiene que ser mayor que cero."),
  );

const esquema = z.object({
  organizationId: z.string().optional(),
  organizacionNombre: z.string().trim().min(2, "Elige o escribe la organización."),
  organizacionTipo: z
    .enum(["CLIENTE", "PROSPECTO", "PARTNER", "FABRICANTE", "PROVEEDOR"])
    .default("PROSPECTO"),

  primaryPersonId: z.string().optional(),
  personaNombre: z.string().trim().optional(),
  personaCargo: z.string().trim().optional(),
  personaRolComiteId: z.string().optional(),

  name: z.string().trim().min(3, "Ponle nombre a la oportunidad."),
  pipelineId: z.string().min(1, "Elige el pipeline."),
  stageId: z.string().min(1, "Elige la etapa."),
  omitirCompuerta: z.coerce.boolean().optional(),
  estimatedAmount: importe,
  expectedCloseDate: z.string().min(1, "Pon la fecha de cierre estimada."),
  businessType: z.enum(["NUEVO", "EXPANSION", "RENOVACION"]),
  forecastCategory: z.enum(["PIPELINE", "MEJOR_CASO", "COMPROMISO", "OMITIDA"]).default("PIPELINE"),
  sourceId: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function crearOportunidadAccion(
  _previo: ResultadoAccion<{ id: string; folio: string; gateOverride: boolean }> | null,
  form: FormData,
): Promise<ResultadoAccion<{ id: string; folio: string; gateOverride: boolean }>> {
  const datos = esquema.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();

  // El país de la oportunidad es el del pipeline (decisiones §18), y la
  // política que gatea su alta también. Quien opera en varios países no tiene
  // «su» país: tomar el primero de la sesión aplicaría los umbrales de México
  // a una oportunidad colombiana.
  const pipeline = (await listPipelines(session)).find((p) => p.id === d.pipelineId);
  if (!pipeline) {
    return falla("VALIDACION", { campo: "pipelineId", mensaje: "Elige el pipeline." });
  }
  const politica = await getCommercialPolicy(pipeline.countryCode);

  // Los umbrales se leen **aquí** y no en el dominio: la prueba de AC-31
  // verifica que ningún archivo de `lib/domain` importe `lib/policy`, para que
  // sus funciones sigan siendo probables sin base.
  const resultado = await crearOportunidad(
    session,
    {
      organizationId: d.organizationId || undefined,
      organizacionNueva: d.organizationId
        ? undefined
        : { name: d.organizacionNombre, type: d.organizacionTipo },
      primaryPersonId: d.primaryPersonId || undefined,
      personaNueva:
        !d.primaryPersonId && d.personaNombre
          ? {
              name: d.personaNombre,
              jobTitle: d.personaCargo,
              committeeRoleId: d.personaRolComiteId || undefined,
            }
          : undefined,
      name: d.name,
      pipelineId: d.pipelineId,
      stageId: d.stageId,
      omitirCompuerta: d.omitirCompuerta,
      estimatedAmount: d.estimatedAmount,
      expectedCloseDate: new Date(`${d.expectedCloseDate}T12:00:00`),
      businessType: d.businessType,
      forecastCategory: d.forecastCategory,
      sourceId: d.sourceId || undefined,
      ownerId: d.ownerId || undefined,
    },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );

  if (!resultado.ok) return resultado;

  revalidatePath("/oportunidades");
  revalidatePath("/contactos");

  /**
   * Devuelve el resultado en vez de `redirect()`, y esto es deliberado.
   *
   * Un `redirect` del servidor destruye el resultado antes de que el cliente lo
   * vea, y con él la confirmación del folio y la advertencia de compuerta
   * omitida. El aviso tiene que dispararse **antes** de cambiar de pantalla; el
   * `Toaster` vive en el layout del grupo, así que sobrevive a la navegación y
   * sigue visible al llegar al detalle.
   *
   * react-doctor prefiere la navegación del servidor y en general tiene razón.
   * Aquí no: la razón para navegar desde el cliente no es comodidad, es que el
   * usuario se entere de lo que acaba de pasar.
   */
  return ok(resultado.datos);
}
