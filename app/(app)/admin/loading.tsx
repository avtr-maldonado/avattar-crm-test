import {
  EsqueletoDeEncabezado,
  EsqueletoDePestanas,
  EsqueletoDeTarjeta,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Administración.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoAdmin() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Administración" />
      <RegionQueCarga anuncio="Cargando la configuración…">
        <div className="px-8 py-6">
          <EsqueletoDePestanas cuantas={4} />

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <EsqueletoDeTarjeta renglones={7} />
            <EsqueletoDeTarjeta renglones={7} />
            <EsqueletoDeTarjeta renglones={5} />
            <EsqueletoDeTarjeta renglones={5} />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
