import {
  Esqueleto,
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDeTabla,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Contactos.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoContactos() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Contactos" />
      <RegionQueCarga anuncio="Cargando contactos…">
        <div className="px-8 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Esqueleto className="h-9 w-64 rounded-sm" />
            <Esqueleto className="ml-auto h-9 w-44 rounded-sm" />
          </div>

          <div className="mt-5">
            <EsqueletoDeIndicadores cuantos={4} columnas="lg:grid-cols-4" denso />
          </div>

          <div className="mt-6">
            <EsqueletoDeTabla filas={9} anchos={["w-56", "w-32", "w-28", "w-24", "w-20"]} />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
