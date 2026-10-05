import {
  actividadPorVendedor,
  saludMeddic,
  type ActividadHecha,
  type OportunidadAbierta,
} from "@/lib/domain/analisis";
import { StatTile } from "@/components/ui/primitivas";
import { TablaDeAnalisis, type CeldaDeAnalisis } from "./TablaDeAnalisis";
import { Tarjeta } from "./graficas/comun";
import { enElLapso, etiquetaDeLapso, type Lapso } from "@/lib/filters/lapso";
import { abiertasYSinPaso, actividadPorMes, actividadPorTipo, saludPorEtapaGrafica } from "./graficas/datosDeActividad";
import {
  TarjetaDeAbiertasSinPaso,
  TarjetaDeActividadPorMes,
  TarjetaDeActividadPorVendedor,
  TarjetaDeSaludMeddic,
} from "./graficas/TarjetasDeActividad";

/**
 * C · Actividad y MEDDIC: los reportes 8 y 9, en gráficas (decisiones §38).
 *
 * Componente de servidor: recibe lo hecho y lo abierto ya acotados por
 * `lib/scope`, agrega con las funciones puras de `lib/domain/analisis` y
 * convierte con `graficas/datosDeActividad`. Los filtros globales recortan
 * antes de llegar aquí: no hay estado aparte que se desincronice.
 *
 * - Actividad por vendedor (8): las hechas en el año fiscal, por tipo, y
 *   cuántas abiertas de cada quien no tienen siguiente paso (RN-10). Solo
 *   cuenta lo **hecho**: agendar no es trabajar la oportunidad (decisiones §19).
 * - Salud MEDDIC (9): puntaje por etapa contra el mínimo para cierre de la
 *   política comercial (INV-05), componentes sin evidencia (RN-30) y quién
 *   está en una etapa de cierre sin llegar al mínimo. Esa lista sigue siendo
 *   una tabla: es operativa.
 * - Las dos tablas originales se conservan como detalle, con menos jerarquía.
 */
export function PestanaActividad({
  actividades,
  abiertas,
  ahora,
  minimoCierre,
  lapso,
  rango,
}: {
  /** Las hechas dentro del lapso (§45). */
  actividades: ActividadHecha[];
  abiertas: OportunidadAbierta[];
  ahora: Date;
  /** `meddicMinToClosing` de la política comercial (INV-05). */
  minimoCierre: number;
  lapso: Lapso;
  /** Las fechas del lapso: la gráfica por mes dibuja los meses que abarca. */
  rango: { from: Date; to: Date };
}) {
  const actividad = actividadPorVendedor(actividades, abiertas, ahora);
  const salud = saludMeddic(abiertas, minimoCierre);
  const etiqueta = etiquetaDeLapso(lapso);
  const prosa = enElLapso(lapso);

  const hechas = actividad.porVendedor.reduce((a, v) => a + v.hechas, 0);
  const sinSiguientePaso = actividad.porVendedor.reduce((a, v) => a + v.sinSiguientePaso, 0);
  const totalAbiertas = actividad.porVendedor.reduce((a, v) => a + v.abiertas, 0);

  // Cada punto lleva las actividades o las abiertas que lo suman, para el detalle al pulsar (§43).
  const porTipo = actividadPorTipo(actividad, actividades);
  const porMes = actividadPorMes(actividad.porMes, rango, actividades);
  const sinPaso = abiertasYSinPaso(actividad.porVendedor, abiertas);
  const saludGrafica = saludPorEtapaGrafica(salud.porEtapa, minimoCierre, abiertas);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          denso
          etiqueta={`Actividades hechas · ${etiqueta}`}
          valor={String(hechas)}
          subtexto={`${actividad.tipos.length} ${actividad.tipos.length === 1 ? "tipo" : "tipos"} de actividad`}
        />
        <StatTile
          denso
          etiqueta="Sin siguiente paso"
          valor={String(sinSiguientePaso)}
          subtexto="abiertas sin actividad agendada, o con la agendada ya vencida"
          tono={sinSiguientePaso > 0 ? "peligro" : "exito"}
        />
        <StatTile
          denso
          etiqueta="En cierre bajo el mínimo"
          valor={String(salud.enCierreBajoMinimo.length)}
          subtexto={`en etapa de cierre con MEDDIC menor a ${minimoCierre}`}
          tono={salud.enCierreBajoMinimo.length > 0 ? "peligro" : "exito"}
        />
        <StatTile
          denso
          etiqueta="Componentes sin evidencia"
          valor={String(salud.sinEvidencia)}
          subtexto="parciales o confirmados sin nada que lo respalde"
          tono={salud.sinEvidencia > 0 ? "alerta" : "neutro"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TarjetaDeActividadPorVendedor lapso={prosa} series={porTipo.series} filas={porTipo.filas} />
        <TarjetaDeActividadPorMes puntos={porMes} />
        <TarjetaDeAbiertasSinPaso series={sinPaso.series} filas={sinPaso.filas} />
        <TarjetaDeSaludMeddic filas={saludGrafica.filas} referencia={saludGrafica.referencia} />

        <div className="xl:col-span-2">
          <Tarjeta
            titulo="En cierre sin llegar al mínimo"
          >
            <TablaDeAnalisis
              columnas={[{ titulo: "Folio" }, { titulo: "Oportunidad" }, { titulo: "MEDDIC", alineacion: "derecha" }]}
              filas={salud.enCierreBajoMinimo.map((o) => ({
                clave: o.id,
                celdas: [
                  { texto: o.folio, href: `/oportunidades/${o.id}` },
                  o.nombre,
                  o.puntaje === null ? { texto: "sin calificar", tono: "tenue" } : { texto: String(o.puntaje), tono: "peligro", negrita: true },
                ],
              }))}
              vacio={`Ninguna oportunidad en etapa de cierre está por debajo de ${minimoCierre}.`}
            />
          </Tarjeta>
        </div>
      </div>

      <section aria-labelledby="detalle-actividad">
        <h2 id="detalle-actividad" className="eyebrow mb-3">
          Detalle
        </h2>
        <div className="grid gap-4 2xl:grid-cols-2">
          <Detalle titulo="Resumen por vendedor">
            <TablaDeAnalisis
              columnas={[
                { titulo: "Vendedor" },
                { titulo: "Hechas", alineacion: "derecha" },
                ...actividad.tipos.map((t) => ({ titulo: t, alineacion: "derecha" as const })),
                { titulo: "Abiertas", alineacion: "derecha" },
                { titulo: "Sin siguiente paso", alineacion: "derecha" },
              ]}
              filas={actividad.porVendedor.map((v) => ({
                clave: v.clave,
                celdas: [
                  v.etiqueta,
                  { texto: String(v.hechas), negrita: true, barra: hechas === 0 ? 0 : v.hechas / hechas },
                  ...actividad.tipos.map((t): CeldaDeAnalisis => {
                    const n = v.porTipo[t] ?? 0;
                    return n === 0 ? { texto: "0", tono: "tenue" } : String(n);
                  }),
                  String(v.abiertas),
                  v.sinSiguientePaso > 0 ? { texto: String(v.sinSiguientePaso), tono: "peligro", negrita: true } : { texto: "0", tono: "tenue" },
                ],
              }))}
              total={[
                "Total",
                String(hechas),
                ...actividad.tipos.map((t) => String(actividad.porVendedor.reduce((a, v) => a + (v.porTipo[t] ?? 0), 0))),
                String(totalAbiertas),
                String(sinSiguientePaso),
              ]}
              vacio={`Nadie ha marcado actividades como hechas ${prosa} con estos filtros, y no hay abiertas que atender.`}
            />
          </Detalle>
          <Detalle titulo="Salud MEDDIC por etapa">
            <TablaDeAnalisis
              columnas={[
                { titulo: "Etapa" },
                { titulo: "Abiertas", alineacion: "derecha" },
                { titulo: "MEDDIC promedio", alineacion: "derecha" },
                { titulo: "Bajo el mínimo", alineacion: "derecha" },
                { titulo: "Sin calificar", alineacion: "derecha" },
              ]}
              filas={salud.porEtapa.map((e) => ({
                clave: e.clave,
                celdas: [
                  e.etiqueta,
                  String(e.cuantas),
                  e.promedio === null
                    ? { texto: "—", tono: "tenue" }
                    : { texto: String(e.promedio), tono: e.promedio >= minimoCierre ? "exito" : "peligro", negrita: true },
                  e.bajoMinimo > 0 ? { texto: String(e.bajoMinimo), tono: "peligro" } : { texto: "0", tono: "tenue" },
                  e.sinCalificar > 0 ? { texto: String(e.sinCalificar), tono: "tenue" } : { texto: "0", tono: "tenue" },
                ],
              }))}
              vacio="Ninguna oportunidad abierta con estos filtros."
            />
          </Detalle>
        </div>
      </section>
    </>
  );
}

/** Una tabla de detalle: menos jerarquía que una tarjeta de gráfica, sobre superficie sutil. */
function Detalle({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-borde bg-superficie-sutil p-4">
      <h3 className="mb-3 text-xs font-semibold text-texto-cuerpo">{titulo}</h3>
      <div className="rounded-md bg-superficie-tarjeta">{children}</div>
    </section>
  );
}
