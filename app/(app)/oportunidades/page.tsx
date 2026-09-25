import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { listOpportunities, listOrganizations } from "@/lib/scope";
import { listPipelines, pipelinePorOmision } from "@/lib/scope/pipelines";
import { catalogosParaAlta } from "@/lib/scope/configuracion";
import { historiasDeEtapas } from "@/lib/scope/funnel";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { can } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { formatPercent, formatUSD, sum, toClient, type Money } from "@/lib/money";
import { openTotal, ordenarPorEstatus, weightedAmount, weightedTotal, wonInPeriod } from "@/lib/domain/pipeline";
import { explainRiskFlags } from "@/lib/domain/riskFlags";
import { buildFunnel } from "@/lib/domain/funnel";
import {
  buildForecast,
  type ColumnaDeForecast,
  type ResultadoDeForecast,
} from "@/lib/domain/forecast";
import {
  ETIQUETA_CAMPO,
  ETIQUETA_PREAJUSTE,
  parseFilters,
  resolvePeriod,
  toWhere,
  trimestreDe,
} from "@/lib/filters";
import { ETIQUETA_CATEGORIA, etiquetaDeMes, fraseDeRiesgo, iniciales, tonoDeRiesgo } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Boton, ControlSegmentado, StatTile } from "@/components/ui/primitivas";
import { TableroKanban, type ColumnaKanban } from "@/components/pipeline/TableroKanban";
import type { DatosTarjeta } from "@/components/pipeline/TarjetaOportunidad";
import { TablaOportunidades } from "@/components/pipeline/TablaOportunidades";
import { NuevaOportunidad } from "@/components/pipeline/NuevaOportunidad";
import { Embudo, type RiesgoVisible } from "@/components/pipeline/Embudo";
import { Forecast, type ColumnaVisible } from "@/components/pipeline/Forecast";
import { BarraDeFiltros } from "@/components/pipeline/BarraDeFiltros";
import { BarraDeHerramientas } from "@/components/pipeline/BarraDeHerramientas";
import { buscarOrganizacionesAccion, personasDeOrganizacionAccion, crearOportunidadAccion } from "./acciones";
import { cambiarEtapaAccion } from "./[id]/acciones";

/**
 * P-01 · Pipeline de oportunidades.
 *
 * La pantalla principal del sistema: la primera pregunta que un vendedor y un
 * gerente se hacen todos los días.
 *
 * Lo que ya cumple y no debe perderse:
 *
 *   - Los datos llegan por `lib/scope` (INV-01) y los filtros se componen
 *     DESPUÉS del alcance, nunca antes (AC-25).
 *   - Los indicadores se calculan sobre el conjunto ya acotado. Para un
 *     Vendedor son los suyos: nunca ve el total de la oficina, ni por
 *     agregación (§2.3).
 *   - Las banderas se calculan, no se leen de un campo (INV-11).
 *   - La vista vive en la URL (INV-10): la pantalla es compartible y el botón
 *     de regresar funciona.
 *
 * Cuatro vistas de los mismos datos: **Kanban** para trabajar el día, **Tabla**
 * para comparar renglón a renglón, **Embudo** para preguntar por el proceso y
 * **Forecast** para ver cuándo cae el dinero, por mes o por trimestre fiscal.
 * Las cuatro salen de la misma consulta; cambiar de vista no vuelve a la base.
 *
 * Lo que falta de E1: marcar ganada y perdida, las vistas guardadas de §9.5 y
 * las autorizaciones de descuento, fuera de este alcance por decisión del
 * negocio.
 */
const VISTAS = [
  { valor: "kanban", etiqueta: "Kanban" },
  { valor: "tabla", etiqueta: "Tabla" },
  { valor: "embudo", etiqueta: "Embudo" },
  // «Forecast» y no «Pronóstico»: es la palabra con que el equipo comercial
  // nombra esta vista, y el nombre de una pantalla es de quien la usa (INV-14
  // pide español en la interfaz; este es un préstamo asentado en ventas).
  { valor: "forecast", etiqueta: "Forecast" },
] as const;

type Vista = (typeof VISTAS)[number]["valor"];
type Agrupacion = "mes" | "trimestre";

/**
 * La ventana de la tasa de paso.
 *
 * No es un umbral de negocio (INV-05): nada se decide con ella y nada cambia de
 * veredicto al moverla. Es el tamaño de la muestra con que se mide el
 * movimiento, y noventa días son un trimestre comercial, que es la unidad en
 * que esta empresa piensa.
 */
const VENTANA_DE_PASO_EN_DIAS = 90;

function esVista(valor: string | null): valor is Vista {
  return VISTAS.some((v) => v.valor === valor);
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Independientes: `requireSession` es un viaje a la base y no depende de los
  // parámetros de la URL (docs/latencia.md).
  const [session, params] = await Promise.all([requireSession(), searchParams]);

  // Los filtros viven en la URL. Se normalizan a `URLSearchParams` porque es lo
  // que `lib/filters` consume, y porque un parámetro repetido —dos etapas, tres
  // vendedores— llega como arreglo.
  const urlParams = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    for (const uno of Array.isArray(valor) ? valor : valor ? [valor] : []) {
      urlParams.append(clave, uno);
    }
  }

  const enUrl = urlParams.get("vista");
  const vista: Vista = esVista(enUrl) ? enUrl : "kanban";
  // Cómo agrupa el forecast. Meses por omisión: es la unidad en que se
  // persigue un cierre; el trimestre es la unidad en que se rinde cuentas.
  // `desde` desplaza la ventana hacia adelante; nunca hacia atrás (el pasado
  // del forecast es la columna de vencidas).
  const agrupar: Agrupacion = urlParams.get("agrupar") === "trimestre" ? "trimestre" : "mes";
  const desde = Math.max(0, Number.parseInt(urlParams.get("desde") ?? "0", 10) || 0);
  // La oficina elegida en la barra superior. Manda sobre el pipeline, la
  // política, la lista y las métricas: las cuatro leen el mismo país.
  const paisActivo = await oficinaActiva(session);

  const puedeAsignar = can(session, "VER_OPORTUNIDADES_OFICINA");
  const filtros = parseFilters(urlParams, session);
  // §25 · sin estatus en la URL se ven las abiertas, como pedía §9.2; la barra
  // lo hace visible. La consulta NO recorta por estatus: las cerradas hacen
  // falta para «Ganado» aunque no se pinten. El recorte va en memoria, después
  // del alcance, así que sigue sin ampliar nada (AC-25).
  const estadosMostrados = new Set<string>(filtros.status.length ? filtros.status : ["ABIERTA"]);
  // Para el punto del botón de filtros cuando la fila está oculta: hay recorte.
  const hayFiltrosActivos =
    filtros.org.length > 0 ||
    filtros.owner.length > 0 ||
    filtros.pipeline !== null ||
    filtros.atRisk ||
    filtros.period !== "PERSONALIZADO" ||
    filtros.from !== null ||
    filtros.to !== null ||
    filtros.forecast.length > 0 ||
    !(estadosMostrados.size === 1 && estadosMostrados.has("ABIERTA"));

  const ahora = new Date();
  const desdeLaVentana = new Date(ahora.getTime() - VENTANA_DE_PASO_EN_DIAS * 86_400_000);
  const deLaOficina = { countryCode: paisActivo };

  // El país arranca primero porque la lista lo necesita: `toWhere` traduce los
  // preajustes de fecha con el mes de arranque del año fiscal. La lista se
  // encadena a él y corre EN PARALELO con las demás lecturas, en vez de esperar
  // a que terminen las cinco: un viaje menos en serie, ~650 ms desde México
  // (docs/latencia-dev.md, §4).
  const paisPromesa = getCountry(paisActivo);

  const [
    pipelines,
    politica,
    pais,
    catalogos,
    propietarios,
    cuentas,
    oportunidades,
    historias,
  ] = await Promise.all([
    listPipelines(session),
    getCommercialPolicy(paisActivo),
    paisPromesa,
    catalogosParaAlta(),
    // Solo si de verdad puede asignar: consultar usuarios para deshabilitar un
    // control sería pagar por una lista que nadie va a poder usar (Q-13).
    puedeAsignar ? destinatariosValidos(paisActivo) : Promise.resolve([]),
    // Las opciones del filtro «Cliente», ya acotadas por alcance: un vendedor
    // solo puede filtrar por las cuentas que alcanza. Sin recorte por oficina:
    // las cuentas no son de un país (decisiones §18).
    listOrganizations(session),
    paisPromesa.then((p) =>
      listOpportunities(session, {
        // La oficina activa va DESPUÉS del alcance y de los filtros, con AND:
        // recorta, nunca amplía (AC-25). Sin ella, el tablero pintaba las
        // columnas del pipeline de un país y las métricas sumaban las
        // oportunidades de todos: las de otros países caían en etapas que no
        // estaban en pantalla y desaparecían del tablero, no de los totales.
        where: {
          AND: [
            toWhere({ ...filtros, status: [] }, session, { fiscalYearStartMonth: p.fiscalYearStartMonth }),
            deLaOficina,
          ],
        },
        orderBy: [{ amount: "desc" }],
      }),
    ),
    // El movimiento entre etapas, para la tasa de paso. A propósito NO lo
    // recortan los filtros del usuario: «¿el proceso mueve?» es una pregunta
    // sobre el proceso, no sobre el subconjunto que se esté mirando.
    historiasDeEtapas(session, { desde: desdeLaVentana, where: deLaOficina }),
  ]);

  /**
   * El alta necesita las etapas con su cuenta de requisitos, para poder decir
   * «2 requisitos de entrada» ANTES de enviar. Enterarse al guardar es
   * enterarse tarde.
   */
  const pipelinesParaAlta = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    countryCode: p.countryCode,
    stages: p.stages.map((e) => ({
      id: e.id,
      name: e.name,
      position: e.position,
      probability: toClient(e.probability),
      requisitos: e.gateRequires.length,
      gateMode: e.gateMode,
    })),
  }));

  const botonDeAlta = (
    <NuevaOportunidad
      pipelines={pipelinesParaAlta}
      origenes={catalogos.origenes}
      rolesDeComite={catalogos.rolesComite}
      propietarios={propietarios.map((u) => ({ id: u.id, name: u.name }))}
      usuarioActual={{ id: session.userId, name: session.name }}
      puedeAsignar={puedeAsignar}
      buscarOrganizaciones={buscarOrganizacionesAccion}
      cargarPersonas={personasDeOrganizacionAccion}
      accion={crearOportunidadAccion}
    />
  );

  // El mismo país que la política y el selector del encabezado. Pasarlo
  // explícitamente es lo que impide que el tablero y la política se separen.
  const pipeline = pipelinePorOmision(pipelines, session, paisActivo, filtros.pipeline);

  const conEvidencia = oportunidades.map((o) => {
    const evidencia = explainRiskFlags(o, o.stage, ahora);
    return { ...o, evidencia, banderas: evidencia.map((e) => e.flag) };
  });

  /**
   * `atRisk` es el único filtro que se aplica en memoria.
   *
   * §9.1 los quiere en la consulta, y este no puede: las banderas se calculan y
   * no se guardan (INV-11), así que no hay columna que consultar. Se recorta
   * **después** del alcance y de los demás filtros, nunca antes, así que sigue
   * sin poder ampliar nada (AC-25).
   */
  const visibles = filtros.atRisk
    ? conEvidencia.filter((o) => o.banderas.length > 0)
    : conEvidencia;

  const abiertas = visibles.filter((o) => o.status === "ABIERTA");
  // Una cerrada ya no corre riesgo: las banderas son de lo que se trabaja.
  const enRiesgo = abiertas.filter((o) => o.banderas.length > 0);
  // Lo que se pinta en los tableros: abiertas, ganadas y perdidas, en ese
  // orden (§25). Los indicadores siguen sobre `visibles` y `abiertas`.
  const mostradas = ordenarPorEstatus(visibles.filter((o) => estadosMostrados.has(o.status)));

  // §10.2 · el cierre del trimestre mira `expectedCloseDate`; lo ganado mira
  // `actualCloseDate`. Mezclarlas produce cifras absurdas al final del
  // trimestre.
  const trimestre = resolvePeriod("ESTE_TRIMESTRE", pais.fiscalYearStartMonth, ahora)!;
  const cierraEnTrimestre = abiertas.filter(
    (o) =>
      o.expectedCloseDate >= (trimestre.from ?? new Date(0)) &&
      o.expectedCloseDate <= trimestre.to,
  );

  // Ganado · lo cerrado como GANADA en el año fiscal en curso, sobre el mismo
  // conjunto acotado que los demás indicadores (§2.3): para un vendedor, lo
  // suyo. Año y no trimestre porque la cuota se mide acumulada (decisiones §17).
  const anioFiscal = resolvePeriod("ESTE_ANIO", pais.fiscalYearStartMonth, ahora)!;
  const ganadas = wonInPeriod(visibles, { from: anioFiscal.from ?? null, to: anioFiscal.to });
  const { fiscalYear } = trimestreDe(ahora, pais.fiscalYearStartMonth);

  const tarjetas = mostradas.map((o) => aTarjeta(o, politica));
  const columnas = columnasDelTablero(pipeline?.stages ?? [], mostradas, tarjetas);
  // La tabla muestra la etapa como columna; la tarjeta no la lleva porque en el
  // kanban ya la dice la columna donde está.
  const etapaDe = Object.fromEntries(mostradas.map((o) => [o.id, o.stage.name]));

  // El embudo mide sobre lo abierto: una etapa no «tiene» las que ya cerraron.
  const etapasDelEmbudo = buildFunnel(pipeline?.stages ?? [], abiertas, historias).map((e) => ({
    nombre: e.nombre,
    valor: formatUSD(e.valor),
    cuantas: e.cuantas,
    fraccionDeBarra: e.fraccionDeBarra,
    tasaDePaso: e.tasaDePaso,
    base: e.base,
    pasaron: e.tasaDePaso === null ? 0 : Math.round(e.tasaDePaso * e.base),
    vieneDe: e.vieneDe,
    esCierre: e.esCierre,
  }));

  /**
   * La cola de riesgo, ordenada por valor · por valor y no por antigüedad:
   * con tiempo para atender tres cosas, se atienden las tres que más dinero
   * mueven. De cada oportunidad se escribe **una** bandera, la más grave: el
   * renglón tiene una línea, y repetir las tres haría un muro.
   */
  // Sin `sort`: la consulta ya pidió `amount: "desc"` y `filter` conserva el
  // orden. Reordenar aquí sería recorrer la lista otra vez para dejarla igual.
  const riesgos: RiesgoVisible[] = enRiesgo.map((o) => {
    // Sin actividad pesa más que estancada: la primera es que nadie la sigue.
    const peor = o.evidencia.find((e) => e.flag === "SIN_ACTIVIDAD") ?? o.evidencia[0]!;

    return {
      id: o.id,
      folio: o.folio,
      nombre: o.name,
      motivo: fraseDeRiesgo(peor, { etapa: o.stage.name }),
      importe: formatUSD(o.amount),
      propietario: o.owner.name,
      tono: tonoDeRiesgo(peor.flag),
    };
  });

  const hrefVista = (v: string) => {
    const p = new URLSearchParams(urlParams);
    p.set("vista", v);
    return `/oportunidades?${p.toString()}`;
  };
  // Cambiar de agrupación vuelve al periodo en curso: un desplazamiento en
  // meses no significa nada en trimestres.
  const hrefDeForecast = (cambio: { agrupar?: Agrupacion; desde?: number }) => {
    const p = new URLSearchParams(urlParams);
    p.set("vista", "forecast");
    p.set("agrupar", cambio.agrupar ?? agrupar);
    const d = cambio.desde ?? desde;
    if (d > 0) p.set("desde", String(d));
    else p.delete("desde");
    return `/oportunidades?${p.toString()}`;
  };

  // El forecast acomoda lo mostrado por su cierre estimado, en meses o en
  // trimestres fiscales del país; las cerradas se ven pero no suman (RN-12).
  // Se formatea aquí; el componente solo pinta.
  const forecast = buildForecast(mostradas, {
    agrupar,
    fiscalYearStartMonth: pais.fiscalYearStartMonth,
    ahora,
    desplazamiento: desde,
  });
  const columnasDeForecast = vistaDeForecast(forecast, tarjetas);

  const accionVacio = (
    <>
      <Boton href="/oportunidades" variante="secundario">
        Limpiar filtros
      </Boton>
      {botonDeAlta}
    </>
  );

  return (
    <>
      <BarraSuperior
        titulo={pipeline ? `Pipeline · ${pipeline.name}` : "Pipeline"}
        subtitulo={[
          `${abiertas.length} abiertas`,
          formatUSD(openTotal(abiertas)),
          `ponderado ${formatUSD(weightedTotal(abiertas))}`,
        ].join(" · ")}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Dos filas: arriba qué vista, si se ven los filtros y el alta; abajo
            los filtros, que se pueden ocultar (BarraDeHerramientas). */}
        <BarraDeHerramientas
          vistas={<ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={hrefVista} />}
          filtros={
              <BarraDeFiltros
                ruta="/oportunidades"
                visibles={filtros.visibles}
                activos={{
                  org: filtros.org,
                  owner: filtros.owner,
                  pipeline: filtros.pipeline,
                  dateField: filtros.dateField,
                  period: filtros.period,
                  from: filtros.from,
                  to: filtros.to,
                  atRisk: filtros.atRisk,
                  status: [...estadosMostrados],
                  forecast: filtros.forecast,
                }}
                catalogos={catalogosDeFiltro(cuentas, propietarios, pipelines, paisActivo)}
              />
          }
          alta={botonDeAlta}
          hayFiltrosActivos={hayFiltrosActivos}
        />

        <div className="mt-4">
          <Indicadores
            abiertas={abiertas}
            cierraEnTrimestre={cierraEnTrimestre}
            enRiesgo={enRiesgo}
            ganadas={{ lista: ganadas, anioFiscal: fiscalYear }}
          />
        </div>

        <div className="mt-6">
          {vista === "kanban" && (
            <TableroKanban
              columnas={columnas}
              // Mover desde el tablero es la misma acción que desde el
              // detalle: una sola evaluación de RN-02, un solo camino.
              puedeMover
              accion={cambiarEtapaAccion}
              accionVacio={accionVacio}
            />
          )}

          {vista === "tabla" && (
            <TablaOportunidades oportunidades={tarjetas} etapaDe={etapaDe} />
          )}

          {vista === "embudo" && (
            <Embudo
              etapas={etapasDelEmbudo}
              riesgos={riesgos}
              ventanaEnDias={VENTANA_DE_PASO_EN_DIAS}
              accionVacio={accionVacio}
            />
          )}

          {vista === "forecast" && (
            <Forecast
              columnas={columnasDeForecast}
              agrupar={agrupar}
              desplazamiento={forecast.desplazamiento}
              fueraDeVentana={forecast.fueraDeVentana}
              hrefDe={hrefDeForecast}
              accionVacio={accionVacio}
            />
          )}
        </div>
      </div>
    </>
  );
}

type Oportunidad = Awaited<ReturnType<typeof listOpportunities>>[number] & {
  banderas: ReturnType<typeof explainRiskFlags>[number]["flag"][];
};

/** El renglón de la tabla y la tarjeta del kanban son el mismo objeto. */
function aTarjeta(o: Oportunidad, politica: { marginFloor: Money }): DatosTarjeta {
  return {
    id: o.id,
    folio: o.folio,
    nombre: o.name,
    organizacion: o.organization.name,
    importe: formatUSD(o.amount),
    margen: o.grossMargin ? formatPercent(toClient(o.grossMargin)) : null,
    margenBajoElPiso: o.grossMargin ? o.grossMargin.lt(politica.marginFloor) : false,
    meddicScore: o.meddicScore,
    cierre: FORMATO_FECHA.format(o.expectedCloseDate),
    propietario: { nombre: o.owner.name, iniciales: o.owner.initials },
    banderas: o.banderas,
    estatus: o.status,
  };
}

/**
 * Las columnas del tablero · una por etapa del pipeline, incluidas las vacías.
 *
 * Una columna que desaparece cuando se queda sin oportunidades rompe el mapa
 * mental del proceso: el kanban deja de ser el proceso y pasa a ser la lista.
 *
 * Se agrupa **una vez** por etapa. Filtrar dentro del bucle de columnas recorre
 * la lista completa por cada etapa: con catorce oportunidades da igual, con las
 * quinientas del requisito no funcional §13, no.
 */
function columnasDelTablero(
  etapas: {
    id: string;
    name: string;
    probability: Money;
    isClosing: boolean;
    gateMode: ColumnaKanban["gateMode"];
  }[],
  oportunidades: Oportunidad[],
  tarjetas: DatosTarjeta[],
): ColumnaKanban[] {
  const porId = new Map(tarjetas.map((t) => [t.id, t]));

  const porEtapa = new Map<string, Oportunidad[]>();
  for (const o of oportunidades) {
    const lista = porEtapa.get(o.stage.id);
    if (lista) lista.push(o);
    else porEtapa.set(o.stage.id, [o]);
  }

  return etapas.map((etapa) => {
    const deLaEtapa = porEtapa.get(etapa.id) ?? [];
    // RN-12 · las cerradas se ven en su columna, pero solo lo abierto suma.
    const abiertasDeLaEtapa = deLaEtapa.filter((o) => o.status === "ABIERTA");
    return {
      etapaId: etapa.id,
      nombre: etapa.name,
      probabilidad: formatPercent(toClient(etapa.probability), 0),
      total: formatUSD(openTotal(abiertasDeLaEtapa)),
      ponderado: formatUSD(
        sum(abiertasDeLaEtapa.map((o) => weightedAmount(o.amount, etapa.probability))),
      ),
      esCierre: etapa.isClosing,
      gateMode: etapa.gateMode,
      oportunidades: deLaEtapa.map((o) => porId.get(o.id)!),
    };
  });
}

/**
 * Las columnas del forecast, formateadas para pintar.
 *
 * La barra de cada cabecera es la mezcla de **esa** columna por categoría, sin
 * lo omitido: dice qué tan firme es el dinero del periodo, no cuánto hay
 * comparado con otro periodo; para comparar están las cifras. Las tarjetas son
 * las mismas del kanban: una oportunidad se ve igual en cualquier tablero.
 */
function vistaDeForecast(
  resultado: ResultadoDeForecast<Oportunidad>,
  tarjetas: DatosTarjeta[],
): ColumnaVisible[] {
  const tarjetaDe = new Map(tarjetas.map((t) => [t.id, t]));

  return resultado.columnas.map((c): ColumnaVisible => {
    const pronosticado = c.total.minus(c.porCategoria.OMITIDA);
    const fraccion = (v: Money) => (pronosticado.isZero() ? 0 : v.div(pronosticado).toNumber());

    return {
      clave: c.clave,
      etiqueta: etiquetaDePeriodo(c.periodo),
      nota:
        c.periodo.tipo === "vencidas" ? "cierre estimado ya pasado" : c.esActual ? "en curso" : null,
      cuantas: c.oportunidades.length,
      total: formatUSD(c.total),
      ponderado: formatUSD(c.ponderado),
      barra: {
        compromiso: fraccion(c.porCategoria.COMPROMISO),
        mejorCaso: fraccion(c.porCategoria.MEJOR_CASO),
        pipeline: fraccion(c.porCategoria.PIPELINE),
      },
      desglose: [
        `Compromiso ${formatUSD(c.porCategoria.COMPROMISO)}`,
        `Mejor caso ${formatUSD(c.porCategoria.MEJOR_CASO)}`,
        `Pipeline ${formatUSD(c.porCategoria.PIPELINE)}`,
        `Omitida ${formatUSD(c.porCategoria.OMITIDA)}`,
      ].join(" · "),
      esVencidas: c.periodo.tipo === "vencidas",
      esActual: c.esActual,
      oportunidades: c.oportunidades.map((o) => tarjetaDe.get(o.id)!),
    };
  });
}

function etiquetaDePeriodo(p: ColumnaDeForecast<Oportunidad>["periodo"]): string {
  switch (p.tipo) {
    case "vencidas":
      return "Vencidas";
    case "mes":
      return etiquetaDeMes(p.anio, p.mes);
    case "trimestre":
      // Q1–Q4, como lo dice el negocio, aunque el año sea fiscal (§25).
      return `Q${p.quarter} ${p.fiscalYear}`;
  }
}

/**
 * Las opciones de cada desplegable, ya acotadas por alcance.
 *
 * Las listas vienen de `lib/scope`, así que un vendedor solo puede filtrar por
 * cuentas que alcanza; y «Vendedor» ni siquiera se le ofrece (AC-24). Lo que
 * esta función hace es traducirlas a pares valor/etiqueta: ninguna decisión de
 * visibilidad vive aquí.
 */
function catalogosDeFiltro(
  cuentas: { id: string; name: string }[],
  propietarios: { id: string; name: string }[],
  pipelines: { id: string; name: string; countryCode: string }[],
  paisActivo: string,
) {
  const paresDe = (mapa: Record<string, string>) =>
    Object.entries(mapa).map(([valor, etiqueta]) => ({ valor, etiqueta }));

  // Un recorrido, no filtrar y luego mapear: solo los de la oficina activa, y
  // se arma el par en el mismo paso.
  const deLaOficina = [];
  for (const p of pipelines) {
    if (p.countryCode === paisActivo) deLaOficina.push({ valor: p.id, etiqueta: p.name });
  }

  return {
    org: cuentas.map((c) => ({ valor: c.id, etiqueta: c.name })),
    owner: propietarios.map((u) => ({ valor: u.id, etiqueta: u.name })),
    pipeline: deLaOficina,
    camposDeFecha: paresDe(ETIQUETA_CAMPO),
    preajustes: paresDe(ETIQUETA_PREAJUSTE),
    // RN-15 · el juicio del vendedor, en el orden de certeza.
    pronostico: paresDe(ETIQUETA_CATEGORIA),
  };
}

/**
 * Los cinco indicadores del encabezado · §11.
 *
 * Se calculan sobre el conjunto **ya acotado** que recibe: para un vendedor son
 * los suyos, nunca el total de la oficina ni por agregación (§2.3).
 *
 * «Ganado» ocupa el lugar que tuvo «Cobertura» (pedido del negocio del
 * 23-sep-2026): lo que ya cerró en el año fiscal, medido con el cierre real
 * (§10.2). La cobertura contra la cuota sigue en P-08, que es donde se decide.
 */
function Indicadores({
  abiertas,
  cierraEnTrimestre,
  enRiesgo,
  ganadas,
}: {
  abiertas: { amount: Money; stage: { probability: Money } }[];
  cierraEnTrimestre: { amount: Money }[];
  enRiesgo: { amount: Money }[];
  ganadas: { lista: { amount: Money }[]; anioFiscal: number };
}) {
  const n = ganadas.lista.length;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile
        denso
        etiqueta="Valor abierto"
        valor={formatUSD(openTotal(abiertas))}
        subtexto={`${abiertas.length} oportunidades`}
      />
      <StatTile
        denso
        etiqueta="Ponderado"
        valor={formatUSD(weightedTotal(abiertas))}
        subtexto="por probabilidad de etapa"
        tono="acento"
      />
      <StatTile
        denso
        etiqueta="Cierre del trimestre"
        valor={formatUSD(openTotal(cierraEnTrimestre))}
        subtexto={`${cierraEnTrimestre.length} con cierre estimado`}
      />
      <StatTile
        denso
        etiqueta="Ganado"
        valor={formatUSD(openTotal(ganadas.lista))}
        subtexto={`${n} ${n === 1 ? "ganada" : "ganadas"} · año fiscal ${ganadas.anioFiscal}`}
        tono={n > 0 ? "exito" : "neutro"}
      />
      <StatTile
        denso
        etiqueta="En riesgo"
        valor={formatUSD(openTotal(enRiesgo))}
        subtexto={`${enRiesgo.length} con bandera activa`}
        tono={enRiesgo.length > 0 ? "peligro" : "neutro"}
      />
    </div>
  );
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
