import {
  EsqueletoDeEncabezado,
  EsqueletoDeIndicadores,
  EsqueletoDeTabla,
  RegionQueCarga,
} from "@/components/ui/esqueleto";

/**
 * Estado de carga de Actividades.
 *
 * Next envuelve el segmento en Suspense por su cuenta al encontrar este
 * archivo: aparece al navegar hacia aquí y se va solo cuando el Server
 * Component termina. No hay estado que manejar ni consulta que tocar.
 *
 * El título se pinta de una vez porque no depende de ninguna consulta. Lo que
 * espera es lo que sale de la base: los conteos del subtítulo, las cifras y las
 * filas.
 */
const LISTAS = [
  { titulo: "Vencidas", filas: 4 },
  { titulo: "Hoy", filas: 3 },
  { titulo: "Oportunidades sin próximo paso", filas: 3 },
];

export default function CargandoActividades() {
  return (
    <div className="flex h-full flex-col">
      <EsqueletoDeEncabezado titulo="Actividades" />
      <RegionQueCarga anuncio="Cargando tu agenda…">
        <div className="px-8 py-6">
          <EsqueletoDeIndicadores cuantos={3} columnas="lg:grid-cols-3" />

          {/*
            Las tres listas de §12.4. Sus títulos no dependen de ninguna
            consulta —siempre son estos tres—, así que se pintan de verdad en
            vez de en gris: quien llega ya sabe qué va a encontrar en cada una.
          */}
          <div className="mt-6 flex flex-col gap-6">
            {LISTAS.map((lista) => (
              <div key={lista.titulo}>
                <h2 className="mb-3 text-sm font-semibold text-texto-titulo">{lista.titulo}</h2>
                <EsqueletoDeTabla
                  filas={lista.filas}
                  anchos={["w-64", "w-32", "w-24", "w-20"]}
                />
              </div>
            ))}
          </div>
        </div>
      </RegionQueCarga>
    </div>
  );
}
