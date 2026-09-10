import {
  Esqueleto,
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDePestanas,
  EsqueletoDeTarjeta,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Oportunidad.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
export default function CargandoOportunidadesId() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Oportunidad" />
      <RegionQueCarga anuncio="Cargando la oportunidad…">
        <div className="px-8 py-6">
          {/* La barra de etapas: lo primero que se mira al abrir una oportunidad. */}
          <div className="flex gap-[3px]">
            {Array.from({ length: 5 }, (_, i) => (
              <Esqueleto key={i} className="h-9 flex-1 rounded-none first:rounded-l-sm last:rounded-r-sm" />
            ))}
          </div>

          <div className="mt-5">
            <EsqueletoDeIndicadores cuantos={4} columnas="lg:grid-cols-4" />
          </div>

          <div className="mt-6">
            <EsqueletoDePestanas cuantas={6} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <EsqueletoDeTarjeta renglones={6} />
              <EsqueletoDeTarjeta renglones={4} />
            </div>
            <div className="flex flex-col gap-5">
              <EsqueletoDeTarjeta renglones={5} />
              <EsqueletoDeTarjeta renglones={3} />
            </div>
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
