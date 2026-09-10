import {
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDeTarjeta,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Organización.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoContactosOrganizacionesId() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Organización" />
      <RegionQueCarga anuncio="Cargando la ficha de la cuenta…">
        <div className="px-8 py-6">
          <EsqueletoDeIndicadores cuantos={4} columnas="lg:grid-cols-4" />

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <EsqueletoDeTarjeta renglones={5} />
              <EsqueletoDeTarjeta renglones={6} />
            </div>
            <EsqueletoDeTarjeta renglones={7} />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
