import {
  actividadPorVendedor,
  saludMeddic,
  type ActividadHecha,
  type OportunidadAbierta,
} from "@/lib/domain/analisis";
import { StatTile } from "@/components/ui/primitivas";
import { Reporte, TablaDeAnalisis, type CeldaDeAnalisis } from "./TablaDeAnalisis";

/**
 * C · Actividad y MEDDIC: los reportes 8 y 9, tal cual se propusieron.
 *
 * - Actividad por vendedor (8): las hechas en el año fiscal, por tipo, y
 *   cuántas abiertas de cada quien no tienen siguiente paso (RN-10). Solo
 *   cuenta lo **hecho**: agendar no es trabajar la oportunidad (decisiones §19).
 * - Salud MEDDIC (9): puntaje por etapa contra el mínimo para cierre de la
 *   política comercial (INV-05), componentes sin evidencia (RN-30) y quién
 *   está en una etapa de cierre sin llegar al mínimo.
 */
export function PestanaActividad({
  actividades,
  abiertas,
  ahora,
  minimoCierre,
  anio,
}: {
  actividades: ActividadHecha[];
  abiertas: OportunidadAbierta[];
  ahora: Date;
  /** `meddicMinToClosing` de la política comercial (INV-05). */
  minimoCierre: number;
  anio: number;
}) {
  const actividad = actividadPorVendedor(actividades, abiertas, ahora);
  const salud = saludMeddic(abiertas, minimoCierre);

  const hechas = actividad.porVendedor.reduce((a, v) => a + v.hechas, 0);
  const sinSiguientePaso = actividad.porVendedor.reduce((a, v) => a + v.sinSiguientePaso, 0);
  const masHechas = Math.max(0, ...actividad.porMes.map((m) => m.hechas));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          etiqueta={`Actividades hechas en ${anio}`}
          valor={String(hechas)}
          subtexto={`${actividad.tipos.length} ${actividad.tipos.length === 1 ? "tipo" : "tipos"} de actividad`}
        />
        <StatTile
          etiqueta="Sin siguiente paso"
          valor={String(sinSiguientePaso)}
          subtexto="abiertas sin actividad agendada, o con la agendada ya vencida"
          tono={sinSiguientePaso > 0 ? "peligro" : "exito"}
        />
        <StatTile
          etiqueta="En cierre bajo el mínimo"
          valor={String(salud.enCierreBajoMinimo.length)}
          subtexto={`en etapa de cierre con MEDDIC menor a ${minimoCierre}`}
          tono={salud.enCierreBajoMinimo.length > 0 ? "peligro" : "exito"}
        />
        <StatTile
          etiqueta="Componentes sin evidencia"
          valor={String(salud.sinEvidencia)}
          subtexto="parciales o confirmados sin nada que lo respalde"
          tono={salud.sinEvidencia > 0 ? "alerta" : "neutro"}
        />
      </div>

      <Reporte
        titulo="Actividad por vendedor"
        fechaQueManda={`Actividades marcadas como hechas en el año fiscal ${anio}, por quien las hizo. Las abiertas y su siguiente paso se miden hoy.`}
      >
        <div className="grid items-start gap-4 xl:grid-cols-[3fr_1fr]">
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
                v.sinSiguientePaso > 0
                  ? { texto: String(v.sinSiguientePaso), tono: "peligro", negrita: true }
                  : { texto: "0", tono: "tenue" },
              ],
            }))}
            total={[
              "Total",
              String(hechas),
              ...actividad.tipos.map((t) => String(actividad.porVendedor.reduce((a, v) => a + (v.porTipo[t] ?? 0), 0))),
              String(actividad.porVendedor.reduce((a, v) => a + v.abiertas, 0)),
              String(sinSiguientePaso),
            ]}
            vacio={`Nadie ha marcado actividades como hechas en ${anio} con estos filtros, y no hay abiertas que atender.`}
          />
          <TablaDeAnalisis
            columnas={[{ titulo: "Mes" }, { titulo: "Hechas", alineacion: "derecha" }]}
            filas={actividad.porMes.map((m) => ({
              clave: m.clave,
              celdas: [m.etiqueta, { texto: String(m.hechas), barra: masHechas === 0 ? 0 : m.hechas / masHechas }],
            }))}
            vacio="Sin actividades hechas."
          />
        </div>
      </Reporte>

      <Reporte
        titulo="Salud MEDDIC"
        fechaQueManda={`Abiertas, hoy. El mínimo para avanzar a cierre es ${minimoCierre}; el puntaje gatea, no pondera (RN-01).`}
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
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
          <div>
            <TablaDeAnalisis
              columnas={[
                { titulo: "Folio" },
                { titulo: "En cierre sin llegar al mínimo" },
                { titulo: "MEDDIC", alineacion: "derecha" },
              ]}
              filas={salud.enCierreBajoMinimo.map((o) => ({
                clave: o.id,
                celdas: [
                  { texto: o.folio, href: `/oportunidades/${o.id}` },
                  o.nombre,
                  o.puntaje === null
                    ? { texto: "sin calificar", tono: "tenue" }
                    : { texto: String(o.puntaje), tono: "peligro", negrita: true },
                ],
              }))}
              vacio={`Ninguna oportunidad en etapa de cierre está por debajo de ${minimoCierre}.`}
            />
            {salud.enCierreBajoMinimo.length > 0 ? (
              <p className="mt-2 text-xs text-texto-tenue">
                Llegaron a cierre antes de que el mínimo se exigiera, o el mínimo subió después. La compuerta de ganar (≥ 80 y E, I, C confirmados) sigue aplicando.
              </p>
            ) : null}
          </div>
        </div>
      </Reporte>
    </>
  );
}
