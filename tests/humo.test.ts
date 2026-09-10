import { describe, expect, it } from "vitest";

describe("cadena de herramientas", () => {
  it("vitest corre y el alias @ resuelve", async () => {
    const { default: pkg } = await import("@/package.json");
    expect(pkg.name).toBe("avattar-crm");
  });
});
