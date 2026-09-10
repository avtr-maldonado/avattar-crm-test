import { Boton } from "@/components/ui/primitivas";

/**
 * 403 · lo que ve quien alcanza una ruta que su rol no permite.
 *
 * Next la renderiza con estatus 403 real cuando algo llama a `forbidden()`.
 * Eso es lo que AC-02 pide: no basta con enseñar un mensaje, la respuesta tiene
 * que decir 403, o un cliente de API vería un 200 con texto de error.
 *
 * §13.5 · el mensaje dice qué falta y a quién pedirlo. Un «acceso denegado»
 * seco deja al usuario sin siguiente paso.
 */
export default function Forbidden() {
  return (
    <div className="grid flex-1 place-items-center px-8 py-16">
      <div className="max-w-md text-center">
        <p className="eyebrow">Error 403</p>
        <h1 className="mt-2 text-h4 font-semibold text-texto-titulo">
          Tu rol no tiene acceso a esta pantalla
        </h1>
        <p className="mt-3 text-sm text-texto-cuerpo">
          No es una falla: el alcance de cada rol está definido en la matriz de
          permisos. Si necesitas entrar, pide a Administración que revise tu rol
          o el permiso que le corresponde.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Boton href="/oportunidades" variante="secundario">
            Ir al pipeline
          </Boton>
        </div>
      </div>
    </div>
  );
}
