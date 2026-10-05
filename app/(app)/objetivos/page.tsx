import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCountry } from "@/lib/policy";
import { formatUSD, sum, type Money } from "@/lib/money";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import {
  computeCoverage,
  computeCumulativeTrack,
  computePeriodProgress,
  type AvanceDeTrimestre,
} from "@/lib/domain/objectives";
import { aniosConObjetivos, avanceDeObjetivos, type RenglonDeObjetivo } from "@/lib/scope/objetivos";
import { trimestreDe } from "@/lib/filters";
import { iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { ControlSegmentado, EstadoVacio, StatTile } from "@/components/ui/primitivas";
import { TiraDeTrimestres } from "@/components/objetivos/TiraDeTrimestres";
import { TablaDeEquipo, type RenglonDeEquipo } from "@/components/objetivos/TablaDeEquipo";
import { TablaDeObjetivos, type FilaDeObjetivos } from "@/components/objetivos/TablaDeObjetivos";
import { guardarCuotasAccion } from "./acciones";

/**
 * P-08 · Objetivos por trimestre y año.
 *
 * ## Dos vistas
 *
 * **Objetivos** es la hoja del negocio (decisiones §34): una fila por vendedor,
 * Q1 a Q4, total anual y total compañía. Quien fija cuotas teclea ahí; los
 * demás la leen. **Avance** es la medición: la tira de trimestres y la tabla
 * del equipo con cumplimiento, arrastre y cobertura.
 *
 * ## La medición es acumulada
 *
 * El negocio lo pidió así el 14 de septiembre de 2026: un objetivo de 100 por
 * trimestre que no se cumple en el Q1 no se perdona, se arrastra; vender 200 en
 * el Q2 cubre los 100 del Q1 y los 100 del Q2. Lo que se compara entonces no es
 * trimestre contra trimestre, sino **acumulado contra acumulado**.
 *
 * Es una regla que **no está en el spec** —§10.2 medía cada periodo por
 * separado— y queda anotada en `decisiones-pendientes.md` §17.
 *
 * ## Quién ve qué
 *
 * Un vendedor ve **solo su renglón** (§2.3, AC-29): ni la cuota ni el avance de
 * sus compañeros. Lo garantiza `objectiveScope` en la consulta, no esta
 * pantalla. Los cuatro indicadores de arriba se suman **de las filas visibles**
 * (§10.3): para él son los suyos; para gerencia, los de su equipo.
 *
 * La oficina activa de la barra superior manda sobre qué país se mide, dentro
 * del alcance del rol y sin ampliarlo nunca.
 */
const VISTAS = [
  { valor: "objetivos", etiqueta: "Objetivos" },
  { valor: "avance", etiqueta: "Avance" },
] as const;

const METRICAS = [
  { valor: "venta", etiqueta: "Venta" },
  { valor: "utilidad", etiqueta: "Utilidad de venta" },
] as const;

type Vista = (typeof VISTAS)[number]["valor"];
type Metrica = (typeof METRICAS)[number]["valor"];

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const pais = await oficinaActiva(session);
  const configuracion = await getCountry(pais);

  const ahora = new Date();
  const enCurso = trimestreDe(ahora, configuracion.fiscalYearStartMonth);

  const vista: Vista = sp.vista === "avance" ? "avance" : "objetivos";
  const anio = unEntero(sp.fy) ?? enCurso.fiscalYear;
  const trimestre = Math.min(Math.max(unEntero(sp.q) ?? enCurso.quarter, 1), 4);

  /**
   * La utilidad depende de `VER_MARGEN`, no de `VER_COSTO`.
   *
   * INV-02 protege el **costo**: lo que no debe salir del servidor es cuánto
   * paga Avattar a su proveedor. Aquí no se muestra ningún costo ni ninguna
   * línea de cotización: se muestra la utilidad agregada de negocios que quien
   * mira ya ve uno por uno con su margen, y venta × margen **es** esa utilidad.
   * Para un vendedor, entonces, esta columna no revela nada que no tuviera; y
   * §10.3 le promete ver su cuota de utilidad. Razonado en §17.
   */
  const puedeVerUtilidad = can(session, "VER_MARGEN");
  const metrica: Metrica = sp.metrica === "utilidad" && puedeVerUtilidad ? "utilidad" : "venta";
  const verEquipo = can(session, "VER_OBJETIVOS_EQUIPO");
  const puedeFijar = can(session, "EDITAR_CATALOGOS");

  const [renglones, anios, personas] = await Promise.all([
    avanceDeObjetivos(session, {
      fiscalYear: anio,
      pais,
      fiscalYearStartMonth: configuracion.fiscalYearStartMonth,
    }),
    aniosConObjetivos(session, pais, enCurso.fiscalYear),
    puedeFijar ? destinatariosValidos(pais) : Promise.resolve([]),
  ]);

  /** Qué par de columnas se está mirando. La aritmética es la misma para las dos. */
  const cuotaDe = (r: RenglonDeObjetivo) => (metrica === "venta" ? r.cuotaVenta : r.cuotaUtilidad);
  const logradoDe = (r: RenglonDeObjetivo) =>
    metrica === "venta" ? r.logradoVenta : r.logradoUtilidad;
  const cuotaAnualDe = (r: RenglonDeObjetivo) =>
    metrica === "venta" ? r.cuotaAnualVenta : r.cuotaAnualUtilidad;

  const conPista = renglones.map((r) => {
    const pista = computeCumulativeTrack(cuotaDe(r), logradoDe(r));
    const alTrimestre = pista[trimestre - 1]!;
    const delAnio = pista[3]!;

    // §10.1 · «Si coexisten, la suma de los cuatro trimestres debe igualar el
    // anual; el anual manda para el reporte de año» (RN-32). Desde §34 la
    // anual ya no se captura: solo sobrevive en filas fijadas antes.
    const cuotaAnual = cuotaAnualDe(r) ?? delAnio.cuota;
    const anualDesalineado = cuotaAnualDe(r) !== null && !cuotaAnualDe(r)!.equals(delAnio.cuota);

    return {
      renglon: r,
      pista,
      alTrimestre,
      anual: { cuota: cuotaAnual, logrado: delAnio.logrado, pipeline: sum(r.pipelineVenta) },
      anualDesalineado,
    };
  });

  const hayAlgo = conPista.some((c) => c.renglon.tieneCuota || !c.alTrimestre.logrado.isZero());
  const desalineados = conPista.filter((c) => c.anualDesalineado).length;

  const href = (cambio: Record<string, string>) => {
    const p = new URLSearchParams({ vista, fy: String(anio), q: String(trimestre), metrica, ...cambio });
    return `/objetivos?${p.toString()}`;
  };

  // ── Los cuatro indicadores: el año en «Objetivos», el acumulado al Q en «Avance».
  // Se suman de las filas visibles, nunca de una consulta aparte (§10.3).
  const anual = vista === "objetivos";
  const cuota = sum(conPista.map((c) => (anual ? c.anual.cuota : c.alTrimestre.cuota)));
  const logrado = sum(conPista.map((c) => (anual ? c.anual.logrado : c.alTrimestre.logrado)));
  const pipeline = sum(
    conPista.map((c) => (anual ? c.anual.pipeline : c.renglon.pipelineVenta[trimestre - 1]!)),
  );
  const progreso = computePeriodProgress(cuota, logrado);
  const cobertura = computeCoverage(progreso.faltante, pipeline);
  const periodoVisible = anual ? `año ${anio}` : `acumulado al Q${trimestre} ${anio}`;
  const nombreDeMetrica = metrica === "venta" ? "Venta" : "Utilidad de venta";

  const filasDeObjetivos: FilaDeObjetivos[] = conPista.flatMap((c) =>
    c.renglon.tieneCuota
      ? [
          {
            userId: c.renglon.usuario.id,
            nombre: c.renglon.usuario.name,
            iniciales: c.renglon.usuario.initials,
            cuotas: cuotaDe(c.renglon).map((m) => m.toFixed()),
            esQuienMira: c.renglon.usuario.id === session.userId,
          },
        ]
      : [],
  );
  // Tras guardar, la página relee y esta huella cambia: la cuadrícula se remonta
  // con lo guardado como punto de partida, sin arrastrar el borrador anterior.
  const huella = filasDeObjetivos.map((f) => `${f.userId}:${f.cuotas.join(",")}`).join("|");

  return (
    <>
      <BarraSuperior
        titulo="Objetivos"
        subtitulo={`${NOMBRE_PAIS[pais]} · ${nombreDeMetrica.toLocaleLowerCase("es")} · ${periodoVisible}`}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={(v) => href({ vista: v })} />

          {puedeVerUtilidad && (
            <ControlSegmentado
              opciones={METRICAS}
              activa={metrica}
              hrefDe={(v) => href({ metrica: v })}
            />
          )}

          <SelectorDeAnio anios={anios} activo={anio} href={href} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile denso etiqueta="Cuota" valor={formatUSD(cuota)} subtexto={periodoVisible} />
          <StatTile
            denso
            etiqueta="Logrado"
            valor={formatUSD(logrado)}
            subtexto="Ganado con fecha de cierre real en el periodo"
            tono={logrado.isZero() ? "neutro" : "acento"}
          />
          <StatTile
            denso
            etiqueta="Cumplimiento"
            valor={progreso.cumplimiento === null ? "—" : `${Math.round(progreso.cumplimiento * 100)} %`}
            subtexto={
              progreso.cumplimiento === null
                ? "Sin cuota fijada"
                : progreso.faltante.isZero()
                  ? `${formatUSD(progreso.excedente)} arriba de la cuota`
                  : `Faltan ${formatUSD(progreso.faltante)}`
            }
            tono={
              progreso.cumplimiento === null ? "neutro" : progreso.cumplimiento >= 1 ? "exito" : "peligro"
            }
          />
          <StatTile
            denso
            etiqueta="Cobertura"
            valor={cobertura === null ? "Cubierta" : `${cobertura.toFixed(1)} ×`}
            subtexto={
              cobertura === null ? "No hay brecha que cubrir" : "Pipeline abierto del periodo sobre la brecha"
            }
            tono={cobertura !== null && cobertura < 1 ? "peligro" : "exito"}
          />
        </div>

        {vista === "objetivos" ? (
          <div className="mt-5">
            <TablaDeObjetivos
              key={`${pais}-${anio}-${metrica}-${huella}`}
              filas={filasDeObjetivos}
              candidatos={personas.map((p) => ({ id: p.id, nombre: p.name }))}
              puedeFijar={puedeFijar}
              pais={pais}
              anio={anio}
              metrica={metrica === "venta" ? "VENTA" : "UTILIDAD"}
              accion={guardarCuotasAccion}
            />
          </div>
        ) : !hayAlgo ? (
          <div className="mt-6">
            <EstadoVacio
              titulo={`Sin objetivos fijados para ${NOMBRE_PAIS[pais]} en ${anio}`}
              explicacion={
                puedeFijar
                  ? "Captura la cuota de cada vendedor por trimestre en la vista Objetivos. Se mide contra lo que ya cerraron."
                  : "Administración todavía no carga las cuotas de esta oficina para este año fiscal."
              }
              accion={
                puedeFijar ? (
                  <a
                    href={href({ vista: "objetivos" })}
                    className="rounded-sm bg-acento px-3.5 py-2 text-sm font-semibold text-white"
                  >
                    Ir a Objetivos
                  </a>
                ) : (
                  <span className="text-sm text-texto-tenue">Nada que hacer aquí.</span>
                )
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <TiraDeTrimestres
                trimestres={[1, 2, 3, 4].map((q) => {
                  // La tira suma las filas visibles, igual que los indicadores:
                  // para un vendedor es su propio año, para un gerente el de su
                  // equipo (§10.3).
                  const cuotaQ = sum(conPista.map((c) => c.pista[q - 1]!.cuotaDelTrimestre));
                  const logradoQ = sum(conPista.map((c) => c.pista[q - 1]!.logradoDelTrimestre));
                  return {
                    quarter: q,
                    href: href({ q: String(q) }),
                    cuota: formatUSD(cuotaQ),
                    logrado: formatUSD(logradoQ),
                    cumplimiento: cuotaQ.isZero() ? null : logradoQ.div(cuotaQ).toNumber(),
                    esActual: q === trimestre,
                    enCurso: q === enCurso.quarter && anio === enCurso.fiscalYear,
                  };
                })}
              />
            </div>

            {desalineados > 0 && (
              <p className="mt-4 rounded-sm border border-borde-fuerte bg-superficie-tinte px-4 py-2.5 text-xs text-navy-700">
                {desalineados === 1
                  ? "Una persona tiene una cuota anual fijada antes de la cuadrícula que no coincide con la suma de sus trimestres."
                  : `${desalineados} personas tienen una cuota anual fijada antes de la cuadrícula que no coincide con la suma de sus trimestres.`}{" "}
                Para el año manda la anual; volver a guardar sus trimestres en Objetivos la retira.
              </p>
            )}

            {verEquipo && (
              <div className="mt-6">
                <TablaDeEquipo
                  periodo={`acumulada al Q${trimestre} ${anio}`}
                  metrica={nombreDeMetrica}
                  renglones={conPista.map((c): RenglonDeEquipo => {
                    const coberturaQ = computeCoverage(
                      c.alTrimestre.faltante,
                      c.renglon.pipelineVenta[trimestre - 1]!,
                    );
                    return {
                      id: c.renglon.usuario.id,
                      nombre: c.renglon.usuario.name,
                      iniciales: c.renglon.usuario.initials,
                      cuota: formatUSD(c.alTrimestre.cuota),
                      logrado: formatUSD(c.alTrimestre.logrado),
                      cumplimiento: c.alTrimestre.cumplimiento,
                      arrastre: c.alTrimestre.arrastre.isZero() ? "" : conSigno(c.alTrimestre.arrastre),
                      arrastreEsDeuda: c.alTrimestre.arrastre.isNegative(),
                      cobertura: c.alTrimestre.faltante.isZero()
                        ? "Cubierta"
                        : coberturaQ === null
                          ? "—"
                          : `${coberturaQ.toFixed(1)} ×`,
                      coberturaBaja: coberturaQ !== null && coberturaQ < 1,
                      esQuienMira: c.renglon.usuario.id === session.userId,
                    };
                  })}
                  total={totalDelEquipo(conPista)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────── Redacción

function conSigno(v: Money): string {
  return v.isNegative() ? `−${formatUSD(v.negated())}` : `+${formatUSD(v)}`;
}

function unEntero(v: string | string[] | undefined): number | null {
  const uno = Array.isArray(v) ? v[0] : v;
  if (!uno) return null;
  const n = Number.parseInt(uno, 10);
  return Number.isInteger(n) ? n : null;
}

// ─────────────────────────────────────────────────────────── Subcomponentes

function SelectorDeAnio({
  anios,
  activo,
  href,
}: {
  anios: number[];
  activo: number;
  href: (cambio: Record<string, string>) => string;
}) {
  if (anios.length <= 1) {
    return <p className="text-xs text-texto-tenue">Año fiscal {activo}</p>;
  }

  return (
    <ControlSegmentado
      opciones={anios.map((a) => ({ valor: String(a), etiqueta: String(a) }))}
      activa={String(activo)}
      hrefDe={(v) => href({ fy: v })}
    />
  );
}

function totalDelEquipo(
  conPista: { alTrimestre: AvanceDeTrimestre }[],
): { cuota: string; logrado: string; cumplimiento: number | null } {
  const cuota = sum(conPista.map((c) => c.alTrimestre.cuota));
  const logrado = sum(conPista.map((c) => c.alTrimestre.logrado));
  return {
    cuota: formatUSD(cuota),
    logrado: formatUSD(logrado),
    cumplimiento: cuota.isZero() ? null : logrado.div(cuota).toNumber(),
  };
}
