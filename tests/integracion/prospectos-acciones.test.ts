import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PermissionCode, Session } from "@/lib/auth/permissions";

/**
 * Las Server Actions de Prospectos con el `FormData` que manda la pantalla ·
 * decisiones §58. Las pruebas del dominio pasaban y la pantalla no creaba ni
 * importaba: lo que faltaba probar era justo la capa de en medio, con los
 * campos tal como viajan desde el formulario (cadenas vacías incluidas).
 */
let sesion: Session;
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async () => sesion }));

const { convertirProspectoAccion, crearProspectoAccion, importarProspectosAccion, previsualizarImportacionAccion } = await import("@/app/(app)/prospectos/acciones");

const GESTION: PermissionCode[] = ["VER_PROSPECTOS", "GESTIONAR_PROSPECTOS"];
let canal: { id: string; name: string };
const creados: string[] = [];

beforeAll(async () => {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "as@avattar.com" }, select: { id: true, email: true, name: true, role: true, countryCodes: true } });
  sesion = { userId: u.id, email: u.email, name: u.name, role: u.role, countryCodes: u.countryCodes, permissions: new Set(GESTION), limits: {} };
  canal = await prisma.leadChannel.findFirstOrThrow({ select: { id: true, name: true } });
});

afterAll(async () => {
  if (creados.length === 0) return;
  await prisma.leadStageTransition.deleteMany({ where: { leadId: { in: creados } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: creados } } });
  await prisma.lead.deleteMany({ where: { id: { in: creados } } });
});

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("crearProspectoAccion · con el FormData del formulario", () => {
  it("crea con solo lo obligatorio y los demás campos vacíos, como los manda la pantalla", async () => {
    const r = await crearProspectoAccion(
      null,
      formulario({
        contactName: "Prueba Acción",
        jobTitle: "",
        email: "",
        phone: "",
        companyName: "Acción S.A.",
        companyIndustry: "",
        countryCode: "MX",
        channelId: canal.id,
        campaignId: "",
        score: "",
        assignedToId: "",
        notes: "",
      }),
    );
    expect(r).toMatchObject({ ok: true });
    if (r.ok) creados.push(r.datos.id);
  });

  it("señala el campo que falta sin tumbar la acción", async () => {
    const r = await crearProspectoAccion(null, formulario({ contactName: "X", companyName: "Y", countryCode: "MX", channelId: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("VALIDACION");
  });
});

describe("importar · previsualizar con un archivo y luego crear las válidas", () => {
  it("lee el CSV de la plantilla y crea la fila válida", async () => {
    const csv = `﻿Contacto,Correo,Teléfono,Cargo,Empresa,Giro,País,Canal,Campaña,Puntaje,Notas\r\nImportada Acción,imp.${Date.now()}@accion.test,,,Importadora Acción,,MX,${canal.name},,70,\r\nSin Canal,,,,Empresa,,MX,Fax,,,\r\n`;
    const f = new FormData();
    f.set("archivo", new File([csv], "prospectos.csv", { type: "text/csv" }));
    const vista = await previsualizarImportacionAccion(null, f);
    expect(vista).toMatchObject({ ok: true });
    if (!vista.ok) return;
    expect(vista.datos.filas).toHaveLength(2);
    expect(vista.datos.filas[0]!.datos).toBeDefined();
    expect(vista.datos.filas[1]!.problemas.join(" ")).toMatch(/canal/i);

    const r = await importarProspectosAccion(null, formulario({ filas: JSON.stringify(vista.datos.filas.filter((x) => x.datos).map((x) => x.datos)) }));
    expect(r).toMatchObject({ ok: true, datos: { creados: 1 } });
    if (r.ok) creados.push(...r.datos.ids);
  });
});

describe("convertirProspectoAccion · cuenta y persona explícitas desde el FormData (§59)", () => {
  const cuentas: string[] = [];
  const oportunidades: string[] = [];
  afterAll(async () => {
    if (oportunidades.length) {
      await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: oportunidades } } });
      await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: oportunidades } } });
      await prisma.lead.updateMany({ where: { opportunityId: { in: oportunidades } }, data: { opportunityId: null, personId: null, organizationId: null } });
      await prisma.opportunity.deleteMany({ where: { id: { in: oportunidades } } });
    }
    if (cuentas.length) {
      await prisma.person.deleteMany({ where: { organizationId: { in: cuentas } } });
      await prisma.organization.deleteMany({ where: { id: { in: cuentas } } });
    }
  });

  it("con cuenta nueva y contacto nuevo prellenados crea los tres; sin nombre de cuenta señala el campo", async () => {
    sesion = { ...sesion, permissions: new Set([...GESTION, "CONVERTIR_PROSPECTO", "CREAR_OPORTUNIDAD", "VER_OPORTUNIDADES_OFICINA"]) };
    const empresa = `Acción Convertida ${Date.now()}`;
    const vendedora = await prisma.user.findUniqueOrThrow({ where: { email: "pe@avattar.com" }, select: { id: true } });
    const alta = await crearProspectoAccion(null, formulario({ contactName: "Contacto Acción", email: `c.${Date.now()}@accion.test`, companyName: empresa, countryCode: "MX", channelId: canal.id, assignedToId: vendedora.id }));
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;
    creados.push(alta.datos.id);
    const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { countryCode: "MX", active: true }, select: { id: true } });

    const sinCuenta = await convertirProspectoAccion(null, formulario({ leadId: alta.datos.id, organizationId: "", organizacionNombre: "", personaNombre: "Contacto Acción", name: `${empresa} · CRM`, pipelineId: pipeline.id, estimatedAmount: "1000", expectedCloseDate: "2027-03-15", businessType: "NUEVO" }));
    expect(sinCuenta).toMatchObject({ ok: false, motivo: "VALIDACION", problemas: [{ campo: "organizacionNombre" }] });

    const r = await convertirProspectoAccion(
      null,
      formulario({
        leadId: alta.datos.id,
        organizationId: "",
        organizacionNombre: empresa,
        organizacionTipo: "PROSPECTO",
        organizacionGiro: "Servicios",
        organizacionCiudad: "",
        primaryPersonId: "",
        personaNombre: "Contacto Acción",
        personaCargo: "Director",
        personaCorreo: "",
        personaTelefono: "",
        personaRolComiteId: "",
        name: `${empresa} · CRM`,
        pipelineId: pipeline.id,
        estimatedAmount: "150,000",
        expectedCloseDate: "2027-03-15",
        businessType: "NUEVO",
        ownerId: "",
      }),
    );
    expect(r).toMatchObject({ ok: true, datos: { cuentaReutilizada: false, personaReutilizada: false } });
    if (!r.ok) return;
    oportunidades.push(r.datos.opportunityId);
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: alta.datos.id }, select: { stage: true, organizationId: true, personId: true } });
    expect(fila.stage).toBe("CONVERTIDO");
    cuentas.push(fila.organizationId!);
    const persona = await prisma.person.findUniqueOrThrow({ where: { id: fila.personId! }, select: { jobTitle: true, email: true } });
    expect(persona).toEqual({ jobTitle: "Director", email: null });
  });
});
