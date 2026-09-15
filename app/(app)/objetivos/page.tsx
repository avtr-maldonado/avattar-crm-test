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
import { PanelDeAvance, type AvanceVisible } from "@/components/objetivos/PanelDeAvance";
import { TiraDeTrimestres } from "@/components/objetivos/TiraDeTrimestres";
import { TablaDeEquipo, type RenglonDeEquipo } from "@/components/objetivos/TablaDeEquipo";
import { FijarObjetivo } from "@/components/objetivos/FijarObjetivo";
import { fijarObjetivoAccion } from "./acciones";

/**
 * P-08 · Objetivos por trimestre y año.
 *
 * ## La medición es acumulada
 *
 * El negocio lo pidió así el 14 de septiembre de 2026: un objetivo de 100 por
 * trimestre que no se cumple en el T1 no se perdona, se arrastra; vender 200 en
 * el T2 cubre los 100 del T1 y los 100 del T2. Lo que se compara entonces no es
 * trimestre contra trimestre, sino **acumulado contra acumulado**, y por eso la
 * cifra grande de esta pantalla es la del año a la fecha, no la del trimestre.
 *
 * Es una regla que **no está en el spec** —§10.2 medía cada periodo por
 * separado— y queda anotada en `decisiones-pendientes.md` §17.
 *
 * ## Quién ve qué
 *
 * Un vendedor ve **solo su renglón** (§2.3, AC-29): ni la cuota ni el avance de
 * sus compañeros. Lo garantiza `objectiveScope` en la consulta, no esta
 * pantalla. Con `VER_OBJETIVOS_EQUIPO` aparece además la tabla del equipo, y su
 * total se suma **de las filas visibles** (§10.3).
 *
 * La oficina activa de la barra superior manda sobre qué país se mide, dentro
 * del alcance del rol y sin ampliarlo nunca.
 */
const PERIODOS = [
  { valor: "trimestre", etiqueta: "Trimestre" },
  { valor: "anio", etiqueta: "Año" },
] as const;

const METRICAS = [
  { valor: "venta", etiqueta: "Venta" },
  { valor: "utilidad", etiqueta: "Utilidad de venta" },
] as const;

type Periodo = (typeof PERIODOS)[number]["valor"];
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

  const periodo: Periodo = sp.periodo === "anio" ? "anio" : "trimestre";
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
  const cuotaDe = (r: RenglonDeObjetivo) =>
    metrica === "venta" ? r.cuotaVenta : r.cuotaUtilidad;
  const logradoDe = (r: RenglonDeObjetivo) =>
    metrica === "venta" ? r.logradoVenta : r.logradoUtilidad;
  const cuotaAnualDe = (r: RenglonDeObjetivo) =>
    metrica === "venta" ? r.cuotaAnualVenta : r.cuotaAnualUtilidad;

  const conPista = renglones.map((r) => {
    const pista = computeCumulativeTrack(cuotaDe(r), logradoDe(r));
    const alTrimestre = pista[trimestre - 1]!;
    const delAnio = pista[3]!;

    // §10.1 · «Si coexisten, la suma de los cuatro trimestres debe igualar el
    // anual; el anual manda para el reporte de año» (RN-32).
    const cuotaAnual = cuotaAnualDe(r) ?? delAnio.cuota;
    const anualDesalineado =
      cuotaAnualDe(r) !== null && !cuotaAnualDe(r)!.equals(delAnio.cuota);

    return {
      renglon: r,
      pista,
      alTrimestre,
      anual: {
        cuota: cuotaAnual,
        logrado: delAnio.logrado,
        ...computePeriodProgress(cuotaAnual, delAnio.logrado),
      },
      anualDesalineado,
    };
  });

  const mio = conPista.find((c) => c.renglon.usuario.id === session.userId);
  const hayAlgo = conPista.some((c) => c.renglon.tieneCuota || !c.alTrimestre.logrado.isZero());

  const etiquetaDePeriodo =
    periodo === "anio" ? `${anio}` : `acumulada al T${trimestre} ${anio}`;

  const href = (cambio: Record<string, string>) => {
    const p = new URLSearchParams({
      periodo,
      fy: String(anio),
      q: String(trimestre),
      metrica,
      ...cambio,
    });
    return `/objetivos?${p.toString()}`;
  };

  const editor = puedeFijar ? (
    <FijarObjetivo
      personas={personas.map((p) => ({ id: p.id, nombre: p.name }))}
      pais={pais}
      anio={anio}
      accion={fijarObjetivoAccion}
    />
  ) : null;

  return (
    <>
      <BarraSuperior
        titulo="Objetivos"
        subtitulo={`${NOMBRE_PAIS[pais]} · año fiscal ${anio} · ${
          periodo === "anio" ? "vista anual" : `acumulado al T${trimestre}`
        }`}
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
          <ControlSegmentado
            opciones={PERIODOS}
            activa={periodo}
            hrefDe={(v) => href({ periodo: v })}
          />

          {puedeVerUtilidad && (
            <ControlSegmentado
              opciones={METRICAS}
              activa={metrica}
              hrefDe={(v) => href({ metrica: v })}
            />
          )}

          <SelectorDeAnio anios={anios} activo={anio} href={href} />

          {editor && <div className="ml-auto">{editor}</div>}
        </div>

        {!hayAlgo ? (
          <div className="mt-6">
            <EstadoVacio
              titulo={`Sin objetivos fijados para ${NOMBRE_PAIS[pais]} en ${anio}`}
              explicacion={
                puedeFijar
                  ? "Fija la cuota de venta y de utilidad de cada persona, por trimestre o por año. Se mide contra lo que ya cerraron."
                  : "Administración todavía no carga las cuotas de esta oficina para este año fiscal."
              }
              accion={editor ?? <span className="text-sm text-texto-tenue">Nada que hacer aquí.</span>}
            />
          </div>
        ) : (
          <>
            {periodo === "trimestre" && (
              <div className="mt-5">
                <TiraDeTrimestres
                  trimestres={[1, 2, 3, 4].map((q) => {
                    // La tira suma las filas visibles, igual que el total: para
                    // un vendedor es su propio año, para un gerente el de su
                    // equipo (§10.3).
                    const cuota = sum(conPista.map((c) => c.pista[q - 1]!.cuotaDelTrimestre));
                    const logrado = sum(conPista.map((c) => c.pista[q - 1]!.logradoDelTrimestre));
                    return {
                      quarter: q,
                      href: href({ q: String(q) }),
                      cuota: formatUSD(cuota),
                      logrado: formatUSD(logrado),
                      cumplimiento: cuota.isZero() ? null : logrado.div(cuota).toNumber(),
                      esActual: q === trimestre,
                      enCurso: q === enCurso.quarter && anio === enCurso.fiscalYear,
                    };
                  })}
                />
              </div>
            )}

            {mio && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <PanelDeAvance
                  avance={
                    periodo === "trimestre"
                      ? avanceTrimestral(mio.alTrimestre, trimestre, metrica)
                      : avanceAnual(mio.anual, anio, metrica)
                  }
                />
                <IndicadoresPersonales
                  pista={mio.alTrimestre}
                  pipeline={mio.renglon.pipelineVenta[trimestre - 1]!}
                  periodo={periodo}
                  anual={mio.anual}
                />
              </div>
            )}

            {mio?.anualDesalineado && (
              <p className="mt-4 rounded-sm border border-borde-fuerte bg-superficie-tinte px-4 py-2.5 text-xs text-navy-700">
                Los cuatro trimestres no suman la cuota anual (RN-32). Para el reporte de año manda
                la anual; la diferencia está en algún trimestre sin cargar.
              </p>
            )}

            {verEquipo && (
              <div className="mt-6">
                <TablaDeEquipo
                  periodo={etiquetaDePeriodo}
                  metrica={metrica === "venta" ? "Venta" : "Utilidad de venta"}
                  renglones={conPista.map((c): RenglonDeEquipo => {
                    const cuota =
                      periodo === "anio" ? c.anual.cuota : c.alTrimestre.cuota;
                    const logrado =
                      periodo === "anio" ? c.anual.logrado : c.alTrimestre.logrado;
                    const faltante =
                      periodo === "anio" ? c.anual.faltante : c.alTrimestre.faltante;
                    const cobertura = computeCoverage(
                      faltante,
                      c.renglon.pipelineVenta[trimestre - 1]!,
                    );

                    return {
                      id: c.renglon.usuario.id,
                      nombre: c.renglon.usuario.name,
                      iniciales: c.renglon.usuario.initials,
                      cuota: formatUSD(cuota),
                      logrado: formatUSD(logrado),
                      cumplimiento: cuota.isZero() ? null : logrado.div(cuota).toNumber(),
                      arrastre:
                        periodo === "anio" || c.alTrimestre.arrastre.isZero()
                          ? ""
                          : conSigno(c.alTrimestre.arrastre),
                      arrastreEsDeuda: c.alTrimestre.arrastre.isNegative(),
                      cobertura: faltante.isZero()
                        ? "Cubierta"
                        : cobertura === null
                          ? "—"
                          : `${cobertura.toFixed(1)} ×`,
                      coberturaBaja: cobertura !== null && cobertura < 1,
                      esQuienMira: c.renglon.usuario.id === session.userId,
                    };
                  })}
                  total={totalDelEquipo(conPista, periodo)}
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

/**
 * El pie del panel acumulado.
 *
 * Es la frase que explica la regla sin enunciarla: «entras al T3 debiendo
 * $120,000» dice más sobre cómo funciona la medición que cualquier leyenda.
 */
function avanceTrimestral(
  a: AvanceDeTrimestre,
  quarter: number,
  metrica: Metrica,
): AvanceVisible {
  const anterior = a.cuota.minus(a.cuotaDelTrimestre);
  const entrada = a.arrastre.isZero()
    ? `Entras al T${quarter} a la par.`
    : a.arrastre.isNegative()
      ? `Entras al T${quarter} debiendo ${formatUSD(a.arrastre.negated())} de los trimestres anteriores.`
      : `Entras al T${quarter} con ${formatUSD(a.arrastre)} de adelanto.`;

  const cierre = a.cuota.isZero()
    ? "No hay cuota fijada para este periodo."
    : a.faltante.isZero()
      ? `Vas ${formatUSD(a.excedente)} arriba del acumulado.`
      : `Faltan ${formatUSD(a.faltante)} para ir a la par.`;

  return {
    titulo: metrica === "venta" ? "Venta acumulada" : "Utilidad acumulada",
    logrado: formatUSD(a.logrado),
    cuota: formatUSD(a.cuota),
    cumplimiento: a.cumplimiento,
    marcaDeArrastre: a.cuota.isZero() ? null : anterior.div(a.cuota).toNumber(),
    pie: `${entrada} ${cierre}`,
  };
}

function avanceAnual(
  a: { cuota: Money; logrado: Money; cumplimiento: number | null; faltante: Money; excedente: Money },
  anio: number,
  metrica: Metrica,
): AvanceVisible {
  return {
    titulo: metrica === "venta" ? `Venta ${anio}` : `Utilidad ${anio}`,
    logrado: formatUSD(a.logrado),
    cuota: formatUSD(a.cuota),
    cumplimiento: a.cumplimiento,
    // El año es el periodo completo: no hay nada anterior que arrastrar.
    marcaDeArrastre: null,
    pie: a.cuota.isZero()
      ? "No hay cuota anual fijada."
      : a.faltante.isZero()
        ? `Cerrado con ${formatUSD(a.excedente)} arriba de la cuota.`
        : `Faltan ${formatUSD(a.faltante)} para cerrar el año.`,
  };
}

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

function IndicadoresPersonales({
  pista,
  pipeline,
  periodo,
  anual,
}: {
  pista: AvanceDeTrimestre;
  pipeline: Money;
  periodo: Periodo;
  anual: { faltante: Money; excedente: Money };
}) {
  const faltante = periodo === "anio" ? anual.faltante : pista.faltante;
  const cobertura = computeCoverage(faltante, pipeline);

  return (
    <div className="grid grid-cols-2 gap-4">
      <StatTile
        etiqueta="Brecha"
        valor={formatUSD(faltante)}
        subtexto={faltante.isZero() ? "cuota cubierta" : "para ir a la par"}
        tono={faltante.isZero() ? "exito" : "peligro"}
      />
      <StatTile
        etiqueta="Cobertura"
        valor={cobertura === null ? "Cubierta" : `${cobertura.toFixed(1)} ×`}
        subtexto={
          cobertura === null ? "no hay brecha que cubrir" : "pipeline del trimestre sobre la brecha"
        }
        tono={cobertura !== null && cobertura < 1 ? "peligro" : "exito"}
      />
    </div>
  );
}

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
  conPista: {
    pista: AvanceDeTrimestre[];
    alTrimestre: AvanceDeTrimestre;
    anual: { cuota: Money; logrado: Money };
  }[],
  periodo: Periodo,
): { cuota: string; logrado: string; cumplimiento: number | null } {
  const cuota = sum(
    conPista.map((c) => (periodo === "anio" ? c.anual.cuota : c.alTrimestre.cuota)),
  );
  const logrado = sum(
    conPista.map((c) => (periodo === "anio" ? c.anual.logrado : c.alTrimestre.logrado)),
  );

  return {
    cuota: formatUSD(cuota),
    logrado: formatUSD(logrado),
    cumplimiento: cuota.isZero() ? null : logrado.div(cuota).toNumber(),
  };
}
