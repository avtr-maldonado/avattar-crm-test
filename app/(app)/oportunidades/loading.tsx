import {
  Esqueleto,
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDeKanban,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Oportunidades.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoOportunidades() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Oportunidades" />
      <RegionQueCarga anuncio="Cargando el pipeline…">
        <div className="px-8 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Esqueleto className="h-9 w-56 rounded-sm" />
            <span aria-hidden className="hidden h-6 w-px bg-borde sm:block" />
            {/* Las pastillas de filtro, en anchos desiguales como los reales. */}
            <Esqueleto className="h-7 w-36 rounded-pill" />
            <Esqueleto className="h-7 w-32 rounded-pill" />
            <Esqueleto className="h-7 w-28 rounded-pill" />
            <Esqueleto className="h-7 w-52 rounded-pill" />
            <Esqueleto className="ml-auto h-9 w-40 rounded-sm" />
          </div>

          <div className="mt-4">
            <EsqueletoDeIndicadores cuantos={5} columnas="lg:grid-cols-5" denso />
          </div>

          <div className="mt-6">
            <EsqueletoDeKanban />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
