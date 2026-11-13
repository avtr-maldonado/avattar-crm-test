import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { SesionMcp } from "./auth";
import { crearServidorMcp } from "./servidor";

/**
 * Lo que el cliente de IA ve de cada herramienta · decisiones §61 y §64.
 *
 * El SDK deriva el JSON Schema de Zod y, cuando un mismo esquema aparece dos
 * veces, escribe la segunda como `$ref` a la primera. Hay clientes que no
 * resuelven esas referencias: ven `riesgos` sin forma y el CRM les rechaza lo
 * que mandan. Cada cuadrante tiene que publicarse completo.
 */
async function herramientas() {
  // Listar no toca la sesión: basta con una de forma válida.
  const servidor = crearServidorMcp({ session: { userId: "u" }, clientId: "c", alcances: null } as unknown as SesionMcp);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "prueba", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  return (await cliente.listTools()).tools;
}

describe("esquemas publicados por el servidor MCP", () => {
  it("ninguna herramienta publica referencias $ref", async () => {
    for (const t of await herramientas()) {
      expect(JSON.stringify(t.inputSchema), `entrada de ${t.name}`).not.toContain("$ref");
      expect(JSON.stringify(t.outputSchema ?? {}), `salida de ${t.name}`).not.toContain("$ref");
    }
  });

  it("guardar_recomendacion publica los cuatro cuadrantes con descripción y fuente", async () => {
    const guardar = (await herramientas()).find((t) => t.name === "guardar_recomendacion")!;
    const props = guardar.inputSchema.properties as Record<string, { items: { properties: Record<string, unknown>; required: string[] } }>;
    for (const cuadrante of ["fortalezas", "riesgos", "siguientes_pasos"]) {
      expect(Object.keys(props[cuadrante].items.properties), cuadrante).toEqual(["descripcion", "fuente"]);
      expect(props[cuadrante].items.required, cuadrante).toEqual(["descripcion", "fuente"]);
    }
    expect(Object.keys(props.recomendaciones.items.properties)).toEqual(["descripcion", "fuente"]);
  });
});
