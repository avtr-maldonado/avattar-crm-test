import { describe, expect, it } from "vitest";
import { opcionesDeCliente } from "./cliente";

/**
 * Una llave de organización (sin workspace) exige el encabezado
 * `anthropic-workspace-id` en cada llamada · decisiones §62.
 */
describe("opcionesDeCliente", () => {
  it("sin ANTHROPIC_WORKSPACE_ID no agrega encabezados", () => {
    expect(opcionesDeCliente({})).toEqual({});
  });

  it("con ANTHROPIC_WORKSPACE_ID manda anthropic-workspace-id, sin espacios", () => {
    expect(opcionesDeCliente({ ANTHROPIC_WORKSPACE_ID: " wrkspc_123 " })).toEqual({
      defaultHeaders: { "anthropic-workspace-id": "wrkspc_123" },
    });
  });

  it("una variable vacía cuenta como ausente", () => {
    expect(opcionesDeCliente({ ANTHROPIC_WORKSPACE_ID: "  " })).toEqual({});
  });
});
