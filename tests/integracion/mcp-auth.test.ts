import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { desafioDeBearer, verificarPortador } from "@/lib/mcp/auth";
import { firmarToken, jwkPublica } from "./mcp-tokens";

/**
 * El bearer del MCP · decisiones §61: un JWT de Supabase emitido por OAuth
 * (`client_id`), verificado con el JWKS, resuelto al perfil de `public.users`.
 */
let keys: JsonWebKey[];
let correo: string;

beforeAll(async () => {
  keys = [await jwkPublica()];
  correo = (await prisma.user.findUniqueOrThrow({ where: { email: "jm@avattar.com" }, select: { email: true } })).email;
});

function peticion(token?: string): Request {
  return new Request("https://crm.ejemplo.com/mcp", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("verificarPortador", () => {
  it("sin bearer: 401 con el desafío que apunta a los metadatos del recurso", async () => {
    const r = await verificarPortador(peticion(), { keys });
    expect(r).toMatchObject({ ok: false, estado: 401 });
  });

  it("firma inválida o token alterado: 401", async () => {
    const bueno = await firmarToken({ sub: "x", email: correo, client_id: "c1" });
    const alterado = bueno.slice(0, -4) + "AAAA";
    const r = await verificarPortador(peticion(alterado), { keys });
    expect(r).toMatchObject({ ok: false, estado: 401 });
  });

  it("vencido: 401", async () => {
    const vencido = await firmarToken({ sub: "x", email: correo, client_id: "c1", exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await verificarPortador(peticion(vencido), { keys })).toMatchObject({ ok: false, estado: 401 });
  });

  it("un token de sesión del navegador (sin client_id) no entra por aquí: 401", async () => {
    const deNavegador = await firmarToken({ sub: "x", email: correo });
    const r = await verificarPortador(peticion(deNavegador), { keys });
    expect(r).toMatchObject({ ok: false, estado: 401 });
    expect(!r.ok && r.mensaje).toMatch(/OAuth/);
  });

  it("autenticado pero sin perfil en el CRM: 403", async () => {
    const sinPerfil = await firmarToken({ sub: "nadie", email: "nadie@avattar.com", client_id: "c1" });
    expect(await verificarPortador(peticion(sinPerfil), { keys })).toMatchObject({ ok: false, estado: 403 });
  });

  it("token bueno: la sesión del usuario, el cliente y los alcances del claim scope", async () => {
    const bueno = await firmarToken({ sub: "x", email: correo, client_id: "c1", scope: "openid crm:read crm:write" });
    const r = await verificarPortador(peticion(bueno), { keys });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sesion.session.email).toBe(correo);
    expect(r.sesion.session.permissions.size).toBeGreaterThan(0);
    expect(r.sesion.clientId).toBe("c1");
    expect(r.sesion.scopes).toEqual(["crm:read", "crm:write"]);
  });

  it("sin claim scope, la lista de alcances queda vacía y se decide por la matriz", async () => {
    const bueno = await firmarToken({ sub: "x", email: correo, client_id: "c1" });
    const r = await verificarPortador(peticion(bueno), { keys });
    expect(r.ok && r.sesion.scopes).toEqual([]);
  });
});

describe("desafioDeBearer", () => {
  it("apunta a los metadatos del recurso y nombra los alcances", () => {
    expect(desafioDeBearer("https://crm.ejemplo.com")).toBe(
      'Bearer resource_metadata="https://crm.ejemplo.com/.well-known/oauth-protected-resource", scope="openid email"',
    );
    expect(desafioDeBearer("https://crm.ejemplo.com", "crm:write", "insufficient_scope")).toBe(
      'Bearer error="insufficient_scope", resource_metadata="https://crm.ejemplo.com/.well-known/oauth-protected-resource", scope="crm:write"',
    );
  });
});
