import type { BusinessType, CountryCode, LeadStage, OrganizationType, Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { LeadDetail } from "@/lib/scope/leads";
import { iniciales } from "@/lib/etiquetas";
import type { RegistroDeActividad, EdicionDeActividad } from "./activity";
import { convierteProspecto, decideComoVentas, gestionaProspecto } from "./leadAccess";
import { crearOportunidad } from "./opportunity";
import { nextFolioDeProspecto } from "./leadFolio";
import { venceEn } from "./leadSla";
import { esTerminal, ETIQUETA_DE_ETAPA, puedeTransitar } from "./leadStages";

/**
 * Prospectos · decisiones §58. Los servicios que mutan un prospecto.
 *
 * Mismo contrato que `opportunity.ts`: reciben la sesión y el detalle que el
 * lector ya acotó, deciden con las reglas puras (`leadStages`, `leadAccess`),
 * escriben en una transacción y dejan `AuditLog` en lo sensible (INV-09):
 * crear, asignar, descartar, convertir, importar. Cambiar de etapa deja su
 * transición, que es su propio registro, como en las oportunidades.
 */
const SIN_GESTION = "Gestionar prospectos es de Marketing o Gerencia, en sus países.";
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AltaDeProspecto = {
  contactName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  companyName: string;
  companyIndustry?: string | null;
  countryCode: CountryCode;
  channelId: string;
  campaignId?: string | null;
  score?: number | null;
  notes?: string | null;
  assignedToId?: string | null;
};

export type PoliticaDeProspectos = { leadFirstContactSlaHours: number };

type Problema = { campo: string; mensaje: string };

function limpiar(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Los datos del prospecto; todos los problemas de una vez, no solo el primero. */
function validar(d: Partial<AltaDeProspecto>): Problema[] {
  const problemas: Problema[] = [];
  if (d.contactName !== undefined && (d.contactName?.trim().length ?? 0) < 2) problemas.push({ campo: "contactName", mensaje: "Escribe el nombre del contacto." });
  if (d.companyName !== undefined && (d.companyName?.trim().length ?? 0) < 2) problemas.push({ campo: "companyName", mensaje: "Escribe la empresa." });
  if (limpiar(d.email) && !FORMA_DE_CORREO.test(d.email!.trim())) problemas.push({ campo: "email", mensaje: "Ese correo no tiene forma de correo." });
  if (d.score != null && (!Number.isInteger(d.score) || d.score < 0 || d.score > 100)) problemas.push({ campo: "score", mensaje: "El puntaje va de 0 a 100." });
  return problemas;
}

async function catalogosValidos(d: { channelId?: string; campaignId?: string | null }): Promise<Problema[]> {
  const problemas: Problema[] = [];
  if (d.channelId !== undefined) {
    const canal = await prisma.leadChannel.findFirst({ where: { id: d.channelId, active: true }, select: { id: true } });
    if (!canal) problemas.push({ campo: "channelId", mensaje: "Elige el canal." });
  }
  if (d.campaignId) {
    const campana = await prisma.leadCampaign.findFirst({ where: { id: d.campaignId, active: true }, select: { id: true } });
    if (!campana) problemas.push({ campo: "campaignId", mensaje: "Esa campaña no existe o está inactiva." });
  }
  return problemas;
}

/** El vendedor debe estar activo y operar en el país del prospecto (AC-05). */
async function vendedorValido(userId: string, countryCode: CountryCode): Promise<ResultadoAccion<{ id: string; name: string }>> {
  const u = await prisma.user.findFirst({
    where: { id: userId, active: true, deletedAt: null, countryCodes: { has: countryCode }, role: { in: ["VENDEDOR", "GERENTE_PAIS"] } },
    select: { id: true, name: true },
  });
  return u ? ok(u) : falla("VALIDACION", { campo: "assignedToId", mensaje: `Ese usuario no es vendedor activo en ${countryCode}.` });
}

export async function crearProspecto(
  session: Session,
  input: AltaDeProspecto,
  politica: PoliticaDeProspectos,
): Promise<ResultadoAccion<{ id: string; folio: string }>> {
  if (!gestionaProspecto(session, { countryCode: input.countryCode, assignedToId: null })) return falla("AUTORIZACION", SIN_GESTION);

  const problemas = [...validar(input), ...(await catalogosValidos(input))];
  if (problemas.length > 0) return falla("VALIDACION", ...problemas);

  let vendedor: { id: string } | null = null;
  if (input.assignedToId) {
    const v = await vendedorValido(input.assignedToId, input.countryCode);
    if (!v.ok) return v;
    vendedor = v.datos;
  }

  const ahora = new Date();
  const etapa: LeadStage = vendedor ? "ASIGNADO" : "NUEVO";

  const creado = await auditedTransaction(async (tx, audit) => {
    const folio = await nextFolioDeProspecto(tx, ahora.getUTCFullYear());
    const l = await tx.lead.create({
      data: {
        folio,
        contactName: input.contactName.trim(),
        email: limpiar(input.email)?.toLowerCase() ?? null,
        phone: limpiar(input.phone),
        jobTitle: limpiar(input.jobTitle),
        companyName: input.companyName.trim(),
        companyIndustry: limpiar(input.companyIndustry),
        countryCode: input.countryCode,
        channelId: input.channelId,
        campaignId: input.campaignId || null,
        stage: etapa,
        score: input.score ?? null,
        notes: limpiar(input.notes),
        assignedToId: vendedor?.id ?? null,
        createdById: session.userId,
        // El mismo instante para el alta y el plazo: el SLA se mide desde aquí, no desde el reloj de la base.
        createdAt: ahora,
        stageEnteredAt: ahora,
        firstContactDueAt: venceEn(ahora, politica.leadFirstContactSlaHours),
      },
      select: { id: true, folio: true },
    });
    await tx.leadStageTransition.create({ data: { leadId: l.id, fromStage: null, toStage: etapa, byUserId: session.userId, atDate: ahora } });
    await audit({ entity: "Lead", entityId: l.id, action: "CREAR_PROSPECTO", byUserId: session.userId, after: { folio: l.folio, channelId: input.channelId, assignedToId: vendedor?.id ?? null } });
    return l;
  });

  return ok(creado);
}

export async function editarProspecto(session: Session, lead: LeadDetail, cambios: Partial<AltaDeProspecto>): Promise<ResultadoAccion> {
  if (!gestionaProspecto(session, lead)) return falla("AUTORIZACION", SIN_GESTION);
  if (esTerminal(lead.stage)) return falla("AUTORIZACION", `Un prospecto ${ETIQUETA_DE_ETAPA[lead.stage].toLowerCase()} ya no se edita.`);
  if (cambios.countryCode !== undefined && cambios.countryCode !== lead.countryCode) {
    return falla("VALIDACION", { campo: "countryCode", mensaje: "El país no se cambia: decide alcance y vendedores. Descártalo y vuelve a darlo de alta." });
  }

  const problemas = [...validar(cambios), ...(await catalogosValidos(cambios))];
  if (problemas.length > 0) return falla("VALIDACION", ...problemas);

  const datos: Prisma.LeadUncheckedUpdateInput = {};
  if (cambios.contactName !== undefined) datos.contactName = cambios.contactName.trim();
  if (cambios.email !== undefined) datos.email = limpiar(cambios.email)?.toLowerCase() ?? null;
  if (cambios.phone !== undefined) datos.phone = limpiar(cambios.phone);
  if (cambios.jobTitle !== undefined) datos.jobTitle = limpiar(cambios.jobTitle);
  if (cambios.companyName !== undefined) datos.companyName = cambios.companyName.trim();
  if (cambios.companyIndustry !== undefined) datos.companyIndustry = limpiar(cambios.companyIndustry);
  if (cambios.channelId !== undefined) datos.channelId = cambios.channelId;
  if (cambios.campaignId !== undefined) datos.campaignId = cambios.campaignId || null;
  if (cambios.score !== undefined) datos.score = cambios.score ?? null;
  if (cambios.notes !== undefined) datos.notes = limpiar(cambios.notes);
  if (Object.keys(datos).length === 0) return ok(null);

  await prisma.lead.update({ where: { id: lead.id }, data: datos });
  return ok(null);
}

/**
 * Mueve de etapa por mano (kanban, botones). La tabla de `leadStages` decide;
 * convertir y descartar tienen su servicio. Llegar a Contactado por primera
 * vez sella `contactedAt`, que es lo que apaga el SLA.
 */
export async function cambiarEtapaDeProspecto(session: Session, lead: LeadDetail, a: LeadStage): Promise<ResultadoAccion<{ etapa: string }>> {
  const actor = { gestiona: gestionaProspecto(session, lead), esAsignado: lead.assignedToId === session.userId };
  if (!actor.gestiona && !actor.esAsignado) return falla("AUTORIZACION", "Ese prospecto no está a tu cargo.");
  const puede = puedeTransitar(lead.stage, a, actor, lead.assignedToId !== null);
  if (!puede.ok) return falla("VALIDACION", { campo: "stage", mensaje: puede.mensaje });

  const ahora = new Date();
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { stage: a, stageEnteredAt: ahora, ...(a === "CONTACTADO" && !lead.contactedAt ? { contactedAt: ahora } : {}) },
    }),
    prisma.leadStageTransition.create({ data: { leadId: lead.id, fromStage: lead.stage, toStage: a, byUserId: session.userId, atDate: ahora } }),
  ]);
  return ok({ etapa: ETIQUETA_DE_ETAPA[a] });
}

/**
 * Asigna uno o varios a un vendedor. Los que estaban antes de Asignado pasan a
 * Asignado; uno ya aceptado conserva su etapa y solo cambia de manos. Cada uno
 * deja `ASIGNAR_PROSPECTO` con quién tenía y quién tiene (INV-09).
 */
export async function asignarProspectos(session: Session, leads: LeadDetail[], vendedorId: string): Promise<ResultadoAccion<{ asignados: number }>> {
  if (leads.length === 0) return falla("VALIDACION", { campo: "ids", mensaje: "Elige al menos un prospecto." });
  for (const l of leads) {
    if (!gestionaProspecto(session, l)) return falla("AUTORIZACION", SIN_GESTION);
    if (esTerminal(l.stage)) return falla("VALIDACION", { campo: "ids", mensaje: `${l.folio} ya está ${ETIQUETA_DE_ETAPA[l.stage].toLowerCase()}.` });
  }
  const paises = new Set(leads.map((l) => l.countryCode));
  for (const pais of paises) {
    const v = await vendedorValido(vendedorId, pais);
    if (!v.ok) return v;
  }

  const ahora = new Date();
  await auditedTransaction(async (tx, audit) => {
    await Promise.all(
      leads.map(async (l) => {
        // Antes de Asignado —o devuelto por ventas— pasa a Asignado; después, solo cambia de manos.
        const pasaAAsignado = l.stage === "NUEVO" || l.stage === "EN_VALIDACION" || l.stage === "CONTACTADO" || l.stage === "CALIFICADO" || l.stage === "RECHAZADO";
        await tx.lead.update({
          where: { id: l.id },
          data: { assignedToId: vendedorId, ...(pasaAAsignado ? { stage: "ASIGNADO", stageEnteredAt: ahora } : {}) },
        });
        if (pasaAAsignado) {
          await tx.leadStageTransition.create({ data: { leadId: l.id, fromStage: l.stage, toStage: "ASIGNADO", byUserId: session.userId, atDate: ahora } });
        }
        await audit({
          entity: "Lead",
          entityId: l.id,
          action: "ASIGNAR_PROSPECTO",
          byUserId: session.userId,
          before: { assignedToId: l.assignedToId, stage: l.stage },
          after: { assignedToId: vendedorId, stage: pasaAAsignado ? "ASIGNADO" : l.stage },
        });
      }),
    );
  });
  return ok({ asignados: leads.length });
}

/** Descarta con motivo del catálogo. Terminal: no se vuelve a mover. */
export async function descartarProspecto(session: Session, lead: LeadDetail, motivoId: string): Promise<ResultadoAccion> {
  if (!gestionaProspecto(session, lead) && !decideComoVentas(session, lead)) return falla("AUTORIZACION", "Ese prospecto no está a tu cargo.");
  if (esTerminal(lead.stage)) return falla("VALIDACION", { campo: "stage", mensaje: `Ya está ${ETIQUETA_DE_ETAPA[lead.stage].toLowerCase()}.` });
  if (!motivoId) return falla("VALIDACION", { campo: "discardReasonId", mensaje: "Elige el motivo del descarte." });
  const motivo = await prisma.leadDiscardReason.findFirst({ where: { id: motivoId, active: true }, select: { id: true, name: true } });
  if (!motivo) return falla("VALIDACION", { campo: "discardReasonId", mensaje: "Ese motivo no existe o está inactivo." });

  const ahora = new Date();
  await auditedTransaction(async (tx, audit) => {
    await tx.lead.update({ where: { id: lead.id }, data: { stage: "DESCARTADO", stageEnteredAt: ahora, discardReasonId: motivo.id } });
    await tx.leadStageTransition.create({ data: { leadId: lead.id, fromStage: lead.stage, toStage: "DESCARTADO", byUserId: session.userId, atDate: ahora } });
    await audit({ entity: "Lead", entityId: lead.id, action: "DESCARTAR_PROSPECTO", byUserId: session.userId, before: { stage: lead.stage }, after: { stage: "DESCARTADO", motivo: motivo.name } });
  });
  return ok(null);
}

// ────────────────────────────────────────────────────────────── Importación

/**
 * Importa las filas que la previsualización dejó limpias · decisiones §58.
 * Todas o ninguna, en una transacción: cada una con su folio y el SLA de su
 * país (por parámetro, INV-05), y una sola entrada de bitácora con el conteo,
 * colgada del primer prospecto creado. Un país fuera del alcance tumba el lote:
 * un archivo a medias es peor que uno que hay que corregir.
 */
export async function importarProspectos(
  session: Session,
  filas: readonly AltaDeProspecto[],
  slaPorPais: Partial<Record<CountryCode, number>>,
): Promise<ResultadoAccion<{ creados: number; ids: string[] }>> {
  if (filas.length === 0) return falla("VALIDACION", { campo: "filas", mensaje: "No hay filas válidas que importar." });
  for (const f of filas) {
    if (!gestionaProspecto(session, { countryCode: f.countryCode, assignedToId: null })) return falla("AUTORIZACION", SIN_GESTION);
    const problemas = validar(f);
    if (problemas.length > 0) return falla("VALIDACION", ...problemas);
    if (slaPorPais[f.countryCode] === undefined) return falla("VALIDACION", { campo: "countryCode", mensaje: `Sin política comercial para ${f.countryCode}.` });
  }

  const ahora = new Date();
  const ids = await auditedTransaction(async (tx, audit) => {
    const creados: string[] = [];
    // En serie a propósito: el contador del folio es una fila que se actualiza.
    for (const f of filas) {
      const folio = await nextFolioDeProspecto(tx, ahora.getUTCFullYear());
      const l = await tx.lead.create({
        data: {
          folio,
          contactName: f.contactName.trim(),
          email: limpiar(f.email)?.toLowerCase() ?? null,
          phone: limpiar(f.phone),
          jobTitle: limpiar(f.jobTitle),
          companyName: f.companyName.trim(),
          companyIndustry: limpiar(f.companyIndustry),
          countryCode: f.countryCode,
          channelId: f.channelId,
          campaignId: f.campaignId || null,
          stage: "NUEVO",
          score: f.score ?? null,
          notes: limpiar(f.notes),
          createdById: session.userId,
          createdAt: ahora,
          stageEnteredAt: ahora,
          firstContactDueAt: venceEn(ahora, slaPorPais[f.countryCode]!),
        },
        select: { id: true },
      });
      await tx.leadStageTransition.create({ data: { leadId: l.id, fromStage: null, toStage: "NUEVO", byUserId: session.userId, atDate: ahora } });
      creados.push(l.id);
    }
    await audit({ entity: "Lead", entityId: creados[0]!, action: "IMPORTAR_PROSPECTOS", byUserId: session.userId, after: { creados: creados.length, ids: creados } });
    return creados;
  });
  return ok({ creados: ids.length, ids });
}

// ─────────────────────────────────────────────────────────────── Conversión

/** La cuenta de la conversión: una existente, o los datos para crearla. */
export type CuentaDeConversion = { id: string } | { nueva: { name: string; type: OrganizationType; industry?: string | null; city?: string | null } };
/** La persona principal: una existente de esa cuenta, o los datos para crearla. */
export type PersonaDeConversion = { id: string } | { nueva: { name: string; jobTitle?: string | null; email?: string | null; phone?: string | null; committeeRoleId?: string | null } };

export type ConversionDeProspecto = {
  cuenta: CuentaDeConversion;
  persona: PersonaDeConversion;
  name: string;
  pipelineId: string;
  stageId?: string;
  estimatedAmount: string;
  expectedCloseDate: Date;
  businessType: BusinessType;
  /** El propietario de la oportunidad; por omisión el vendedor asignado. */
  ownerId?: string;
};

/**
 * Convertir · decisiones §58, enmendado en §59. Cuatro pasos:
 *
 * 1. La cuenta: la existente que eligió quien convierte, o una nueva con sede en
 *    el país del prospecto y el vendedor como propietario. El panel propone la
 *    homónima (`coincidenciasParaConvertir`); aquí se vuelve a comprobar: una
 *    nueva con el nombre de una que existe se rechaza, como en §29.
 * 2. La persona: la existente de esa cuenta que eligió, o una nueva, del
 *    vendedor, con los datos que el prospecto traía y los que completó.
 * 3. La oportunidad, con `crearOportunidad`: mismo folio, misma compuerta, mismas
 *    reglas; la persona como principal y el origen que coincida con el canal.
 * 4. Las actividades del prospecto reciben la oportunidad y conservan `leadId`;
 *    el prospecto queda Convertido con las tres referencias y su bitácora.
 *
 * Los pasos 1-2 y 4 van en transacciones propias; el 3 trae la suya. Si el 4
 * fallara, la oportunidad existiría sin el prospecto marcado: fallo de base, no
 * de regla, y el segundo intento encontraría cuenta y persona ya hechas.
 *
 * Desde Aceptado lo convierte el asignado o quien gestiona; desde Calificado o
 * Asignado solo quien gestiona, saltándose la aceptación de ventas.
 */
export async function convertirProspecto(
  session: Session,
  lead: LeadDetail,
  input: ConversionDeProspecto,
  umbrales: { meddicMinToClosing: number },
): Promise<ResultadoAccion<{ opportunityId: string; folio: string; cuentaReutilizada: boolean; personaReutilizada: boolean }>> {
  if (!convierteProspecto(session, lead)) return falla("AUTORIZACION", "Convertir es del vendedor asignado o de Gerencia, con el permiso.");
  if (esTerminal(lead.stage)) return falla("VALIDACION", { campo: "stage", mensaje: `Ya está ${ETIQUETA_DE_ETAPA[lead.stage].toLowerCase()}.` });
  const gestiona = gestionaProspecto(session, lead);
  const desdePermitido = lead.stage === "ACEPTADO" || (gestiona && (lead.stage === "CALIFICADO" || lead.stage === "ASIGNADO"));
  if (!desdePermitido) {
    return falla("VALIDACION", {
      campo: "stage",
      mensaje: gestiona
        ? `Se convierte desde Calificado, Asignado o Aceptado; está en ${ETIQUETA_DE_ETAPA[lead.stage]}.`
        : `Se convierte desde Aceptado; está en ${ETIQUETA_DE_ETAPA[lead.stage]}.`,
    });
  }
  if (input.name.trim().length < 3) return falla("VALIDACION", { campo: "name", mensaje: "Ponle nombre a la oportunidad." });
  if ("nueva" in input.cuenta && input.cuenta.nueva.name.trim().length < 2) return falla("VALIDACION", { campo: "organizacionNombre", mensaje: "Escribe el nombre de la cuenta." });
  if ("nueva" in input.persona && input.persona.nueva.name.trim().length < 2) return falla("VALIDACION", { campo: "personaNombre", mensaje: "Escribe el nombre del contacto." });

  const vendedorId = input.ownerId ?? lead.assignedToId ?? session.userId;

  // Cuenta y persona se comprueban antes de escribir nada: lo que el panel
  // propuso pudo cambiar entre que abrió y que se envió.
  const cuentaElegida = "id" in input.cuenta ? await prisma.organization.findFirst({ where: { id: input.cuenta.id, deletedAt: null }, select: { id: true } }) : null;
  if ("id" in input.cuenta && !cuentaElegida) return falla("VALIDACION", { campo: "organizacionNombre", mensaje: "Esa cuenta ya no existe: elige otra o créala." });
  if ("nueva" in input.cuenta) {
    const homonima = await prisma.organization.findFirst({ where: { name: { equals: input.cuenta.nueva.name.trim(), mode: "insensitive" }, deletedAt: null }, select: { name: true } });
    if (homonima) return falla("VALIDACION", { campo: "organizacionNombre", mensaje: `Ya existe la cuenta «${homonima.name}»: elígela en lugar de crearla.` });
  }
  if ("id" in input.persona) {
    const dentro = cuentaElegida ? await prisma.person.findFirst({ where: { id: input.persona.id, organizationId: cuentaElegida.id, deletedAt: null }, select: { id: true } }) : null;
    if (!dentro) return falla("VALIDACION", { campo: "persona", mensaje: "Ese contacto no es de la cuenta elegida." });
  } else if (input.persona.nueva.committeeRoleId) {
    const rol = await prisma.committeeRole.findFirst({ where: { id: input.persona.nueva.committeeRoleId, active: true }, select: { id: true } });
    if (!rol) return falla("VALIDACION", { campo: "personaRolComiteId", mensaje: "Ese rol del comité no está en el catálogo." });
  }

  const { cuenta, persona } = input;
  const { organizationId, personId } = await prisma.$transaction(async (tx) => {
    const organizationId =
      "id" in cuenta
        ? cuenta.id
        : (
            await tx.organization.create({
              data: { name: cuenta.nueva.name.trim(), type: cuenta.nueva.type, industry: cuenta.nueva.industry || null, city: cuenta.nueva.city || null, countryCode: lead.countryCode, ownerId: vendedorId },
              select: { id: true },
            })
          ).id;
    const personId =
      "id" in persona
        ? persona.id
        : (
            await tx.person.create({
              data: {
                organizationId,
                name: persona.nueva.name.trim(),
                initials: iniciales(persona.nueva.name.trim()),
                jobTitle: persona.nueva.jobTitle || null,
                email: persona.nueva.email || null,
                phone: persona.nueva.phone || null,
                committeeRoleId: persona.nueva.committeeRoleId || null,
                ownerId: vendedorId,
              },
              select: { id: true },
            })
          ).id;
    return { organizationId, personId };
  });
  const cuentaReutilizada = "id" in cuenta;
  const personaReutilizada = "id" in persona;

  // El origen de la oportunidad, si el catálogo tiene uno con el nombre del canal.
  const origen = await prisma.opportunitySource.findFirst({ where: { name: { equals: lead.channel.name, mode: "insensitive" }, active: true }, select: { id: true } });

  const alta = await crearOportunidad(
    session,
    {
      organizationId,
      primaryPersonId: personId,
      name: input.name.trim(),
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      estimatedAmount: input.estimatedAmount,
      expectedCloseDate: input.expectedCloseDate,
      businessType: input.businessType,
      sourceId: origen?.id,
      ownerId: vendedorId,
    },
    umbrales,
  );
  if (!alta.ok) return alta;

  const ahora = new Date();
  await auditedTransaction(async (tx, audit) => {
    await tx.activity.updateMany({ where: { leadId: lead.id, deletedAt: null }, data: { opportunityId: alta.datos.id, organizationId } });
    await tx.opportunity.update({ where: { id: alta.datos.id }, data: { lastActivityAt: lead.lastActivityAt, nextActivityAt: lead.nextActivityAt } });
    await tx.lead.update({
      where: { id: lead.id },
      data: { stage: "CONVERTIDO", stageEnteredAt: ahora, organizationId, personId, opportunityId: alta.datos.id, assignedToId: vendedorId },
    });
    await tx.leadStageTransition.create({ data: { leadId: lead.id, fromStage: lead.stage, toStage: "CONVERTIDO", byUserId: session.userId, atDate: ahora } });
    await audit({
      entity: "Lead",
      entityId: lead.id,
      action: "CONVERTIR_PROSPECTO",
      byUserId: session.userId,
      before: { stage: lead.stage },
      after: { stage: "CONVERTIDO", opportunityId: alta.datos.id, folio: alta.datos.folio, organizationId, personId, cuentaReutilizada, personaReutilizada },
    });
  });

  return ok({ opportunityId: alta.datos.id, folio: alta.datos.folio, cuentaReutilizada, personaReutilizada });
}

// ───────────────────────────────────────────────────────────── Actividades

const ASUNTO_MINIMO = 3;

async function responsableValido(userId: string, countryCode: CountryCode): Promise<ResultadoAccion<{ id: string }>> {
  const u = await prisma.user.findFirst({ where: { id: userId, active: true, deletedAt: null, countryCodes: { has: countryCode } }, select: { id: true } });
  return u ? ok(u) : falla("VALIDACION", { campo: "userId", mensaje: `Ese usuario no está activo o no opera en ${countryCode}.` });
}

type Tx = Prisma.TransactionClient;

/** Recalcula los acumulados del prospecto desde lo que hay, dentro de la transacción. */
async function recalcularAgenda(tx: Tx, lead: LeadDetail, byUserId: string) {
  const [ultimaHecha, proxima] = await Promise.all([
    tx.activity.findFirst({ where: { leadId: lead.id, deletedAt: null, completedAt: { not: null } }, select: { completedAt: true }, orderBy: { completedAt: "desc" } }),
    tx.activity.findFirst({ where: { leadId: lead.id, deletedAt: null, completedAt: null }, select: { startsAt: true }, orderBy: { startsAt: "asc" } }),
  ]);
  const contactado = lead.contactedAt ?? ultimaHecha?.completedAt ?? null;
  // Una actividad hecha es el primer contacto: si todavía estaba en Nuevo o En
  // validación, pasa a Contactado con su transición.
  const pasaAContactado = ultimaHecha !== null && (lead.stage === "NUEVO" || lead.stage === "EN_VALIDACION");
  const ahora = new Date();
  await tx.lead.update({
    where: { id: lead.id },
    data: {
      lastActivityAt: ultimaHecha?.completedAt ?? null,
      nextActivityAt: proxima?.startsAt ?? null,
      contactedAt: contactado,
      ...(pasaAContactado ? { stage: "CONTACTADO", stageEnteredAt: ahora } : {}),
    },
  });
  if (pasaAContactado) {
    await tx.leadStageTransition.create({ data: { leadId: lead.id, fromStage: lead.stage, toStage: "CONTACTADO", byUserId, atDate: ahora } });
  }
}

function puedeTocarActividades(session: Session, lead: LeadDetail): boolean {
  return gestionaProspecto(session, lead) || decideComoVentas(session, lead);
}

/**
 * Registra o agenda una actividad del prospecto. Sin calendario de Microsoft
 * en esta entrega (el adaptador recibe una oportunidad; pendiente en §58). Sin
 * la pregunta de §12.4: un prospecto sin siguiente paso no es una oportunidad
 * abandonada, y la lista «sin seguimiento» ya lo muestra.
 */
export async function registrarActividadDeProspecto(session: Session, lead: LeadDetail, input: RegistroDeActividad): Promise<ResultadoAccion<{ id: string }>> {
  if (!puedeTocarActividades(session, lead)) return falla("AUTORIZACION", "Ese prospecto no está a tu cargo.");
  if (esTerminal(lead.stage)) return falla("AUTORIZACION", `Un prospecto ${ETIQUETA_DE_ETAPA[lead.stage].toLowerCase()} ya no lleva actividades.`);
  const subject = input.subject.trim();
  if (subject.length < ASUNTO_MINIMO) return falla("VALIDACION", { campo: "subject", mensaje: "Escribe de qué se trata la actividad." });
  if (input.durationMin != null && input.durationMin <= 0) return falla("VALIDACION", { campo: "fin", mensaje: "La hora de fin tiene que ser posterior a la de inicio." });
  const responsable = await responsableValido(input.userId ?? session.userId, lead.countryCode);
  if (!responsable.ok) return responsable;

  const hecha = input.hecha ?? true;
  const cuando = input.cuando ?? new Date();
  const id = await prisma.$transaction(async (tx) => {
    const a = await tx.activity.create({
      data: {
        typeId: input.typeId,
        subject,
        notes: input.notes?.trim() || null,
        outcome: input.outcome?.trim() || null,
        startsAt: cuando,
        durationMin: input.durationMin ?? null,
        completedAt: hecha ? cuando : null,
        leadId: lead.id,
        userId: responsable.datos.id,
      },
      select: { id: true },
    });
    await recalcularAgenda(tx, lead, session.userId);
    return a.id;
  });
  return ok({ id });
}

export async function editarActividadDeProspecto(session: Session, lead: LeadDetail, activityId: string, cambios: EdicionDeActividad): Promise<ResultadoAccion<{ id: string }>> {
  if (!puedeTocarActividades(session, lead)) return falla("AUTORIZACION", "Ese prospecto no está a tu cargo.");
  const actual = await prisma.activity.findFirst({ where: { id: activityId, leadId: lead.id, deletedAt: null }, select: { id: true, completedAt: true, startsAt: true } });
  if (!actual) return falla("AUTORIZACION", "No encontramos esa actividad en este prospecto.");
  if (cambios.subject !== undefined && cambios.subject.trim().length < ASUNTO_MINIMO) return falla("VALIDACION", { campo: "subject", mensaje: "Escribe de qué se trata la actividad." });
  if (cambios.userId) {
    const r = await responsableValido(cambios.userId, lead.countryCode);
    if (!r.ok) return r;
  }
  const cuando = cambios.cuando ?? actual.startsAt;
  const hecha = cambios.hecha ?? actual.completedAt !== null;
  await prisma.$transaction(async (tx) => {
    await tx.activity.update({
      where: { id: actual.id },
      data: {
        ...(cambios.typeId !== undefined ? { typeId: cambios.typeId } : {}),
        ...(cambios.subject !== undefined ? { subject: cambios.subject.trim() } : {}),
        ...(cambios.notes !== undefined ? { notes: cambios.notes?.trim() || null } : {}),
        ...(cambios.outcome !== undefined ? { outcome: cambios.outcome?.trim() || null } : {}),
        ...(cambios.durationMin !== undefined ? { durationMin: cambios.durationMin } : {}),
        ...(cambios.userId ? { userId: cambios.userId } : {}),
        startsAt: cuando,
        completedAt: hecha ? (actual.completedAt ?? cuando) : null,
      },
    });
    await recalcularAgenda(tx, lead, session.userId);
  });
  return ok({ id: actual.id });
}
