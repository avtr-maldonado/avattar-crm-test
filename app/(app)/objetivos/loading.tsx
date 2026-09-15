import {
  Esqueleto,
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDeTabla,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Objetivos.
 *
 * Imita lo que va a llegar: la tira de cuatro trimestres, los dos paneles de
 * avance y la tabla del equipo. Un esqueleto que no coincide con la pantalla
 * final produce un salto al resolverse, que es peor que no tener esqueleto.
 */
export default function CargandoObjetivos() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Objetivos" />
      <RegionQueCarga anuncio="Cargando el avance contra objetivos…">
        <div className="px-8 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Esqueleto className="h-9 w-48 rounded-sm" />
            <Esqueleto className="h-9 w-60 rounded-sm" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-24 rounded-md" />
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Esqueleto className="h-36 rounded-md" />
            <EsqueletoDeIndicadores cuantos={2} columnas="grid-cols-2" />
          </div>

          <div className="mt-6">
            <EsqueletoDeTabla filas={5} anchos={["w-40", "w-24", "w-24", "w-20", "w-20", "w-16"]} />
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
