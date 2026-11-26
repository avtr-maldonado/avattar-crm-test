import { describe, expect, it } from "vitest";
import { origenPublico } from "./origen";

/**
 * El origen con el que la app arma sus propias URLs · decisiones §70. Detrás del proxy de la VPS,
 * el servidor standalone ve `request.url` como `https://0.0.0.0:3132/…`: el callback de login
 * mandaba ahí al usuario.
 */
describe("origenPublico", () => {
  const detrasDelProxy = new Request("https://0.0.0.0:3132/auth/callback?code=x");

  it("con APP_URL, usa ese origen aunque el request diga otra cosa", () => {
    expect(origenPublico(detrasDelProxy, { APP_URL: "https://crm.avtr.solutions" })).toBe("https://crm.avtr.solutions");
  });

  it("quita la diagonal final y los espacios de APP_URL", () => {
    expect(origenPublico(detrasDelProxy, { APP_URL: " https://crm.avtr.solutions/ " })).toBe("https://crm.avtr.solutions");
  });

  it("sin APP_URL, el origen del request (pnpm dev)", () => {
    expect(origenPublico(new Request("http://localhost:3000/auth/callback"), {})).toBe("http://localhost:3000");
  });

  it("un APP_URL vacío cuenta como ausente", () => {
    expect(origenPublico(new Request("http://localhost:3000/x"), { APP_URL: "  " })).toBe("http://localhost:3000");
  });

  it("no toma el origen de encabezados que manda el cliente", () => {
    const conHostAjeno = new Request("http://localhost:3000/x", { headers: { "x-forwarded-host": "malicioso.example" } });
    expect(origenPublico(conHostAjeno, {})).toBe("http://localhost:3000");
  });
});
