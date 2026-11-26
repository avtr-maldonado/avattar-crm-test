import { describe, expect, it } from "vitest";
import config from "@/next.config";
import { TAMANO_MAXIMO } from "@/lib/domain/document";

/**
 * Un documento de hasta 25 MB tiene que poder llegar a `subirDocumento` · decisiones §70.
 *
 * El archivo viaja en el FormData de una Server Action, y Next pone dos topes antes de que el
 * dominio lo vea: 1 MB para las acciones y 10 MB para lo que pasa por el middleware. Con los de
 * omisión, todo documento de más de 1 MB fallaba con un error que no dice nada del tamaño.
 */
function bytes(valor: string | number | undefined): number {
  if (typeof valor === "number") return valor;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(valor ?? "");
  if (!m) return 0;
  const unidad = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[(m[2] ?? "b").toLowerCase() as "b"];
  return Number(m[1]) * unidad;
}

describe("los topes de Next dejan pasar un documento del tamaño máximo", () => {
  it("las Server Actions aceptan el archivo más el resto del formulario", () => {
    expect(bytes(config.experimental?.serverActions?.bodySizeLimit)).toBeGreaterThan(TAMANO_MAXIMO);
  });

  it("el middleware no recorta el cuerpo antes de que llegue a la acción", () => {
    expect(bytes(config.experimental?.middlewareClientMaxBodySize)).toBeGreaterThan(TAMANO_MAXIMO);
  });
});
