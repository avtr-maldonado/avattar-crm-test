import { describe, expect, it } from "vitest";
import { falla, ok } from "@/lib/acciones";
import { respuestaDeHerramienta, textoDeFalla } from "./resultado";

/** Lo que el agente lee cuando el CRM dice que no: qué falló y qué hacer distinto (§61). */
describe("textoDeFalla", () => {
  it("un problema por línea, con su campo, y cierra con qué hacer", () => {
    const texto = textoDeFalla(
      falla(
        "VALIDACION",
        { campo: "riesgos.2.fuente.activity_id", mensaje: "«act_x» no existe o no está a tu alcance." },
        { campo: "acciones", mensaje: "al menos una acción." },
      ),
    );
    const lineas = texto.split("\n");
    expect(lineas[0]).toMatch(/rechaz/i);
    expect(lineas).toContain("- riesgos.2.fuente.activity_id: «act_x» no existe o no está a tu alcance.");
    expect(lineas).toContain("- acciones: al menos una acción.");
    expect(lineas.at(-1)).toMatch(/vuelve a llamar/i);
  });

  it("sin acceso dice que no insista con los mismos datos", () => {
    const texto = textoDeFalla(falla("AUTORIZACION", "La oportunidad «opp_1» no existe o no está a tu alcance."));
    expect(texto).toMatch(/^Sin acceso/);
    expect(texto).toMatch(/buscar_oportunidades/);
  });
});

describe("respuestaDeHerramienta", () => {
  it("un resultado bueno va como contenido estructurado y como texto", () => {
    const r = respuestaDeHerramienta(ok({ insight_id: "i1", version: 2 }));
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ insight_id: "i1", version: 2 });
    expect(r.content[0]).toEqual({ type: "text", text: JSON.stringify({ insight_id: "i1", version: 2 }) });
  });

  it("una falla va con isError y el texto de la falla", () => {
    const r = respuestaDeHerramienta(falla("CONFLICTO", "Ya existe."));
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    expect(r.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Ya existe.") });
  });
});
