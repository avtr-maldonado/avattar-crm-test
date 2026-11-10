import { describe, expect, it } from "vitest";
import { alcancesPedidos, etiquetaDeAlcance } from "./alcances";

/** Lo que la pantalla de consentimiento le dice al usuario de cada alcance (§61). */
describe("alcances", () => {
  it("cada alcance del CRM tiene su explicación en español", () => {
    expect(etiquetaDeAlcance("crm:read")).toEqual({
      alcance: "crm:read",
      titulo: "Consultar tus oportunidades",
      detalle: "Ver tus oportunidades, sus actividades, notas y transcripciones. Nunca costo ni utilidad.",
    });
    expect(etiquetaDeAlcance("crm:write").titulo).toBe("Guardar recomendaciones");
  });

  it("un alcance estándar de OAuth se explica sin inventar", () => {
    expect(etiquetaDeAlcance("openid").titulo).toBe("Saber quién eres");
    expect(etiquetaDeAlcance("email").titulo).toBe("Ver tu correo");
  });

  it("un alcance desconocido se muestra tal cual, marcado", () => {
    expect(etiquetaDeAlcance("files:write")).toEqual({ alcance: "files:write", titulo: "files:write", detalle: "Alcance que el CRM no reconoce." });
  });

  it("la cadena de alcances se separa por espacios, sin vacíos ni repetidos", () => {
    expect(alcancesPedidos(" openid  crm:read crm:read ")).toEqual(["openid", "crm:read"]);
    expect(alcancesPedidos("")).toEqual([]);
  });
});
