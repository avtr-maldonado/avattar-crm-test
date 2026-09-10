import {
  EsqueletoDeEncabezado,
  EsqueletoDeTarjeta,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Análisis.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoAnalisis() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Análisis" />
      <RegionQueCarga anuncio="Cargando análisis…">
        <div className="px-8 py-6">
          <EsqueletoDeTarjeta renglones={6} />
        </div>
      </RegionQueCarga>
    </div>
  );
}
