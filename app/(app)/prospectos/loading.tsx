import { Esqueleto, EsqueletoDeEncabezado, EsqueletoDeIndicadores, EsqueletoDeTabla, RegionQueCarga } from "@/components/ui/esqueleto";

/** Estado de carga de Prospectos: el título de una vez; lo demás espera a la base. */
export default function CargandoProspectos() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Prospectos" />
      <RegionQueCarga anuncio="Cargando los prospectos…">
        <div className="px-8 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Esqueleto className="h-9 w-40 rounded-sm" />
            <Esqueleto className="h-9 w-44 rounded-sm" />
            <Esqueleto className="h-9 w-9 rounded-sm" />
            <Esqueleto className="ml-auto h-9 w-40 rounded-sm" />
          </div>
          <div className="mt-4">
            <Esqueleto className="h-9 w-80 rounded-sm" />
          </div>
          <div className="mt-4">
            <EsqueletoDeIndicadores cuantos={5} columnas="lg:grid-cols-5" denso />
          </div>
          <div className="mt-6">
            <EsqueletoDeTabla filas={8} />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
