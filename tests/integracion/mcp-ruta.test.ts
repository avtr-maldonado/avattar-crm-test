import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getCommercialPolicy } from "@/lib/policy";
import { crearOportunidad } from "@/lib/domain/opportunity";
import { POST } from "@/app/mcp/route";
import { GET as metadatos } from "@/app/.well-known/oauth-protected-resource/route";
import { usarLlavesDePrueba } from "@/lib/mcp/auth";
import { firmarToken, jwkPublica } from "./mcp-tokens";

/**
 * La ruta del MCP de punta a punta, sin servidor: JSON-RPC contra `POST` con
 * tokens firmados en la prueba. Lo que un cliente de IA haría.
 */
let keys: JsonWebKey[];
let jorge: { id: string; email: string };
let otroVendedor: { id: string; email: string };
const creadas: string[] = [];

beforeAll(async () => {
  keys = [await jwkPublica()];
  usarLlavesDePrueba(keys);
  jorge = await prisma.user.findUniqueOrThrow({ where: { email: "jm@avattar.com" }, select: { id: true, email: true } });
  otroVendedor = await prisma.user.findFirstOrThrow({
    where: { role: "VENDEDOR", active: true, deletedAt: null, email: { not: "jm@avattar.com" } },
    select: { id: true, email: true },
  });
});

afterAll(async () => {
  usarLlavesDePrueba(null);
  await prisma.mcpToolCall.deleteMany({ where: { clientId: "cliente_de_prueba" } });
  if (!creadas.length) return;
  await prisma.opportunityInsight.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.activity.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Opportunity", entityId: { in: creadas } } });
  await prisma.stageTransition.deleteMany({ where: { opportunityId: { in: creadas } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: creadas } } });
});

async function token(email: string, scope = "crm:read crm:write") {
  return firmarToken({ sub: "x", email, client_id: "cliente_de_prueba", scope });
}

let contador = 0;
async function rpc(tok: string | null, method: string, params: unknown = {}) {
  const req = new Request("https://crm.ejemplo.com/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++contador, method, params }),
  });
  const res = await POST(req);
  const cuerpo = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  return { estado: res.status, cabeceras: res.headers, cuerpo };
}

async function unaOportunidad(nombre: string) {
  const [sesionJorge, organizacion, pipeline, politica] = await Promise.all([
    sesionDe(jorge.email),
    prisma.organization.findFirstOrThrow({ where: { countryCode: "MX", deletedAt: null }, select: { id: true } }),
    prisma.pipeline.findFirstOrThrow({ where: { name: "Ventas México" }, select: { id: true } }),
    getCommercialPolicy("MX"),
  ]);
  const r = await crearOportunidad(
    sesionJorge,
    { name: nombre, organizationId: organizacion.id, pipelineId: pipeline.id, estimatedAmount: "80000.0000", expectedCloseDate: new Date("2026-12-20"), businessType: "NUEVO" },
    { meddicMinToClosing: Number(politica.meddicMinToClosing) },
  );
  if (!r.ok) throw new Error("no se pudo preparar la oportunidad");
  creadas.push(r.datos.id);
  return r.datos;
}

async function sesionDe(correo: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: correo }, select: { id: true, email: true, name: true, role: true, countryCodes: true } });
  const permisos = await prisma.rolePermission.findMany({ where: { role: u.role, granted: true }, select: { limitValue: true, permission: { select: { code: true } } } });
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    countryCodes: u.countryCodes,
    permissions: new Set(permisos.map((p) => p.permission.code)),
    limits: Object.fromEntries(permisos.map((p) => [p.permission.code, p.limitValue?.toString() ?? null])),
  };
}

describe("POST /mcp", () => {
  it("sin bearer responde 401 con WWW-Authenticate hacia los metadatos del recurso", async () => {
    const r = await rpc(null, "tools/list");
    expect(r.estado).toBe(401);
    expect(r.cabeceras.get("www-authenticate")).toContain('resource_metadata="https://crm.ejemplo.com/.well-known/oauth-protected-resource"');
  });

  it("tools/list ofrece las cinco herramientas con su JSON Schema derivado de Zod", async () => {
    const r = await rpc(await token(jorge.email), "tools/list");
    expect(r.estado).toBe(200);
    const herramientas = r.cuerpo.result.tools as { name: string; description: string; inputSchema: { properties: Record<string, unknown>; required?: string[] } }[];
    expect(herramientas.map((t) => t.name).sort()).toEqual(
      ["buscar_oportunidades", "guardar_recomendacion", "listar_actividades", "obtener_nota", "obtener_oportunidad"],
    );
    const guardar = herramientas.find((t) => t.name === "guardar_recomendacion")!;
    expect(guardar.description).toMatch(/obtener_nota/);
    expect(Object.keys(guardar.inputSchema.properties).sort()).toEqual(["acciones", "estado", "huecos", "model", "opportunity_id", "riesgos"]);
    expect(guardar.inputSchema.required).toEqual(expect.arrayContaining(["opportunity_id", "estado", "riesgos", "acciones", "huecos"]));
  });

  it("obtener_nota de la actividad de otro: isError, y la llamada queda registrada como RECHAZADO", async () => {
    const o = await unaOportunidad("MCP ruta · nota ajena");
    const tipo = await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const a = await prisma.activity.create({
      data: { typeId: tipo.id, subject: "Llamada", startsAt: new Date(), opportunityId: o.id, userId: jorge.id, notes: "secreto" },
      select: { id: true },
    });
    const r = await rpc(await token(otroVendedor.email), "tools/call", { name: "obtener_nota", arguments: { activity_id: a.id } });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.result.isError).toBe(true);
    expect(r.cuerpo.result.content[0].text).toMatch(/no existe o no está a tu alcance/);
    expect(r.cuerpo.result.content[0].text).not.toContain("secreto");

    const registro = await prisma.mcpToolCall.findFirst({
      where: { clientId: "cliente_de_prueba", tool: "obtener_nota", userId: otroVendedor.id },
      orderBy: { at: "desc" },
    });
    expect(registro).toMatchObject({ result: "RECHAZADO", params: { activity_id: a.id } });
  });

  it("con solo crm:read, guardar_recomendacion pide crm:write y no toca la base", async () => {
    const o = await unaOportunidad("MCP ruta · solo lectura");
    const r = await rpc(await token(jorge.email, "crm:read"), "tools/call", {
      name: "guardar_recomendacion",
      arguments: { opportunity_id: o.id, estado: { etiqueta: "SALUDABLE", resumen: "Todo bien, sin riesgos visibles." }, riesgos: [], acciones: [{ descripcion: "Seguir", fuente: { activity_id: "x", cita: "nada" } }], huecos: [] },
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.result.isError).toBe(true);
    expect(r.cuerpo.result.content[0].text).toMatch(/crm:write/);
    expect(await prisma.opportunityInsight.count({ where: { opportunityId: o.id } })).toBe(0);
  });

  it("el flujo completo: obtener_oportunidad, listar_actividades, obtener_nota y guardar_recomendacion", async () => {
    const o = await unaOportunidad("MCP ruta · flujo");
    const tipo = await prisma.activityType.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const a = await prisma.activity.create({
      data: { typeId: tipo.id, subject: "Llamada", startsAt: new Date(), completedAt: new Date(), opportunityId: o.id, userId: jorge.id, transcript: "Cliente: Aprobado para Q1, sin fecha de firma." },
      select: { id: true },
    });
    const tok = await token(jorge.email);

    const ficha = await rpc(tok, "tools/call", { name: "obtener_oportunidad", arguments: { opportunity_id: o.id } });
    expect(ficha.cuerpo.result.isError, ficha.cuerpo.result.content?.[0]?.text).toBeUndefined();
    expect(ficha.cuerpo.result.structuredContent).toMatchObject({ folio: o.folio, total_de_actividades: 1, recomendaciones_previas: [] });
    expect(JSON.stringify(ficha.cuerpo.result.structuredContent)).not.toMatch(/grossProfit|totalCost|grossMargin/);

    const lista = await rpc(tok, "tools/call", { name: "listar_actividades", arguments: { opportunity_id: o.id } });
    expect(lista.cuerpo.result.structuredContent.actividades[0]).toMatchObject({ activity_id: a.id, tiene_transcripcion: true });
    expect(lista.cuerpo.result.structuredContent.actividades[0]).not.toHaveProperty("transcripcion");

    const nota = await rpc(tok, "tools/call", { name: "obtener_nota", arguments: { activity_id: a.id } });
    expect(nota.cuerpo.result.structuredContent.transcripcion).toContain("sin fecha de firma");

    const guardada = await rpc(tok, "tools/call", {
      name: "guardar_recomendacion",
      arguments: {
        opportunity_id: o.id,
        estado: { etiqueta: "EN_RIESGO", resumen: "Presupuesto aprobado, pero sin fecha de firma." },
        riesgos: [{ descripcion: "Sin fecha de firma", fuente: { activity_id: a.id, cita: "sin fecha de firma" } }],
        acciones: [{ descripcion: "Pedir fecha", fuente: { activity_id: a.id, cita: "Aprobado para Q1" } }],
        huecos: [],
        model: "claude-fable-5-1",
      },
    });
    expect(guardada.cuerpo.result.isError).toBeUndefined();
    expect(guardada.cuerpo.result.structuredContent).toMatchObject({ version: 1 });

    const registros = await prisma.mcpToolCall.findMany({ where: { clientId: "cliente_de_prueba", opportunityId: o.id }, select: { tool: true, result: true } });
    // obtener_nota también anota la oportunidad de la actividad leída.
    expect(registros.map((r) => r.tool).sort()).toEqual(["guardar_recomendacion", "listar_actividades", "obtener_nota", "obtener_oportunidad"]);
    expect(registros.every((r) => r.result === "OK")).toBe(true);
  });

  it("buscar_oportunidades con fechas sin campo se rechaza con el mensaje del esquema", async () => {
    const r = await rpc(await token(jorge.email), "tools/call", { name: "buscar_oportunidades", arguments: { desde: "2026-10-01" } });
    const texto = JSON.stringify(r.cuerpo);
    expect(texto).toMatch(/campo_fecha/);
    expect(texto).toMatch(/CIERRE_ESTIMADO/);
  });
});

describe("GET /.well-known/oauth-protected-resource", () => {
  it("publica el recurso, el servidor de autorización y solo alcances que Supabase emite", async () => {
    const res = await metadatos(new Request("https://crm.ejemplo.com/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({
      resource: "https://crm.ejemplo.com/mcp",
      scopes_supported: ["openid", "email"],
      bearer_methods_supported: ["header"],
    });
    // Supabase rechaza alcances propios («unsupported scope: crm:read», 10-nov-2026):
    // anunciarlos haría fallar la autorización de todo cliente que los pida.
    expect(cuerpo.scopes_supported.some((s: string) => s.startsWith("crm:"))).toBe(false);
    expect(cuerpo.authorization_servers[0]).toMatch(/\/auth\/v1$/);
  });
});
