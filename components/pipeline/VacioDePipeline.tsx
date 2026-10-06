import { EstadoVacio } from "@/components/ui/primitivas";

/**
 * Lo que las cuatro vistas del pipeline pintan cuando no hay nada que mostrar
 * (decisiones §46). Hay dos vacíos distintos y antes se confundían:
 *
 * - **No hay oportunidades que esta persona pueda ver en la oficina**: el
 *   pipeline está por estrenar, o nada se le ha asignado. «Limpiar filtros» no
 *   arregla nada; la salida es dar de alta, o esperar a que le asignen.
 * - **Los filtros dejaron fuera todo**: cada vista dice lo suyo y ofrece
 *   limpiar los filtros.
 *
 * La página decide cuál es (cuenta sin filtros, dentro del alcance y la
 * oficina) y qué acción cabe; las vistas solo ponen su texto de «filtrado».
 */
export type VacioDePipeline = {
  /** Cierto cuando, sin filtro alguno, no hay ninguna oportunidad al alcance en la oficina. */
  sinOportunidades: boolean;
  /** Lo que se ofrece en cada caso: alta o «ir a…» cuando no hay nada; limpiar filtros (+ alta) cuando sí hay. */
  accion: React.ReactNode;
};

export function EstadoVacioDePipeline({
  vacio,
  filtrado,
}: {
  vacio: VacioDePipeline;
  /** El texto de la vista cuando los filtros dejaron fuera todo. */
  filtrado: { titulo: string; explicacion: string };
}) {
  if (vacio.sinOportunidades) {
    return (
      <EstadoVacio
        titulo="Todavía no hay oportunidades en esta oficina"
        explicacion="Aquí aparecerán las que des de alta o las que te asignen."
        accion={vacio.accion}
      />
    );
  }
  return <EstadoVacio titulo={filtrado.titulo} explicacion={filtrado.explicacion} accion={vacio.accion} />;
}
