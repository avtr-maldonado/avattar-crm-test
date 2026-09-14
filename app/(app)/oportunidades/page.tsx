import { requireSession } from "@/lib/auth/session";
import { listOpportunities } from "@/lib/scope";
import { listPipelines, pipelinePorOmision } from "@/lib/scope/pipelines";
import { catalogosParaAlta } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { can } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { formatPercent, formatUSD, sum, toClient } from "@/lib/money";
import { openTotal, weightedAmount, weightedTotal } from "@/lib/domain/pipeline";
import { computeRiskFlags } from "@/lib/domain/riskFlags";
import { parseFilters, resolvePeriod, toWhere } from "@/lib/filters";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Boton, ControlSegmentado, StatTile } from "@/components/ui/primitivas";
import { TableroKanban, type ColumnaKanban } from "@/components/pipeline/TableroKanban";
import type { DatosTarjeta } from "@/components/pipeline/TarjetaOportunidad";
import { TablaOportunidades } from "@/components/pipeline/TablaOportunidades";
import { NuevaOportunidad } from "@/components/pipeline/NuevaOportunidad";
import { buscarOrganizacionesAccion, buscarPersonasAccion, crearOportunidadAccion } from "./acciones";
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
 * Lo que falta de E1: el arrastre entre etapas con evaluación de compuertas, la
 * barra de filtros completa, las vistas guardadas y el panel de oportunidades
 * en riesgo para gerencia. El embudo es Fase 2.
 */
const VISTAS = [
  { valor: "kanban", etiqueta: "Kanban" },
  { valor: "tabla", etiqueta: "Tabla" },
  { valor: "embudo", etiqueta: "Embudo", deshabilitada: true },
] as const;

type Vista = "kanban" | "tabla";

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

  const vista: Vista = urlParams.get("vista") === "tabla" ? "tabla" : "kanban";
  const paisActivo = session.countryCodes[0] ?? "MX";

  const puedeAsignar = can(session, "VER_OPORTUNIDADES_OFICINA");
  const filtros = parseFilters(urlParams, session);

  // El país arranca primero porque la lista lo necesita: `toWhere` traduce los
  // preajustes de fecha con el mes de arranque del año fiscal. La lista se
  // encadena a él y corre EN PARALELO con las demás lecturas, en vez de esperar
  // a que terminen las cinco: un viaje menos en serie, ~650 ms desde México
  // (docs/latencia-dev.md, §4).
  const paisPromesa = getCountry(paisActivo);

  const [pipelines, politica, pais, catalogos, propietarios, oportunidades] = await Promise.all([
    listPipelines(session),
    getCommercialPolicy(paisActivo),
    paisPromesa,
    catalogosParaAlta(),
    // Solo si de verdad puede asignar: consultar usuarios para deshabilitar un
    // control sería pagar por una lista que nadie va a poder usar (Q-13).
    puedeAsignar ? destinatariosValidos(paisActivo) : Promise.resolve([]),
    paisPromesa.then((p) =>
      listOpportunities(session, {
        where: toWhere(filtros, session, { fiscalYearStartMonth: p.fiscalYearStartMonth }),
        orderBy: [{ amount: "desc" }],
      }),
    ),
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
      buscarPersonas={buscarPersonasAccion}
      accion={crearOportunidadAccion}
    />
  );

  // El mismo país que la política y el selector del encabezado. Pasarlo
  // explícitamente es lo que impide que el tablero y la política se separen.
  const pipeline = pipelinePorOmision(pipelines, session, paisActivo);

  const ahora = new Date();
  const conBanderas = oportunidades.map((o) => ({
    ...o,
    banderas: computeRiskFlags(o, o.stage, politica, ahora),
  }));

  const abiertas = conBanderas.filter((o) => o.status === "ABIERTA");
  const enRiesgo = conBanderas.filter((o) => o.banderas.length > 0);

  // §10.2 · el cierre del trimestre mira `expectedCloseDate`; el avance de
  // cuota miraría `actualCloseDate`. Mezclarlas produce coberturas absurdas al
  // final del trimestre.
  const trimestre = resolvePeriod("ESTE_TRIMESTRE", pais.fiscalYearStartMonth, ahora)!;
  const cierraEnTrimestre = abiertas.filter(
    (o) =>
      o.expectedCloseDate >= (trimestre.from ?? new Date(0)) &&
      o.expectedCloseDate <= trimestre.to,
  );

  const tarjetas = conBanderas.map(
    (o): DatosTarjeta => ({
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
    }),
  );

  const porId = new Map(tarjetas.map((t) => [t.id, t]));

  // Se agrupa UNA vez por etapa. Filtrar dentro del bucle de columnas recorre
  // la lista completa por cada etapa: con 14 oportunidades da igual, con las
  // 500 del requisito no funcional §13, no.
  const porEtapa = new Map<string, typeof conBanderas>();
  for (const o of conBanderas) {
    const lista = porEtapa.get(o.stage.id);
    if (lista) lista.push(o);
    else porEtapa.set(o.stage.id, [o]);
  }

  // Todas las etapas del pipeline, incluidas las vacías: una columna que
  // desaparece rompe el mapa mental del proceso.
  const columnas: ColumnaKanban[] = (pipeline?.stages ?? []).map((etapa) => {
    const deLaEtapa = porEtapa.get(etapa.id) ?? [];
    return {
      etapaId: etapa.id,
      nombre: etapa.name,
      probabilidad: formatPercent(toClient(etapa.probability), 0),
      total: formatUSD(openTotal(deLaEtapa)),
      ponderado: formatUSD(
        sum(deLaEtapa.map((o) => weightedAmount(o.amount, etapa.probability))),
      ),
      esCierre: etapa.isClosing,
      gateMode: etapa.gateMode,
      oportunidades: deLaEtapa.map((o) => porId.get(o.id)!),
    };
  });

  const hrefVista = (v: string) => {
    const p = new URLSearchParams(urlParams);
    p.set("vista", v);
    return `/oportunidades?${p.toString()}`;
  };

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
        <div className="flex flex-wrap items-center gap-3">
          <ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={hrefVista} />
          <div className="ml-auto">{botonDeAlta}</div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            etiqueta="Valor abierto"
            valor={formatUSD(openTotal(abiertas))}
            subtexto={`${abiertas.length} oportunidades`}
          />
          <StatTile
            etiqueta="Ponderado"
            valor={formatUSD(weightedTotal(abiertas))}
            subtexto="por probabilidad de etapa"
            tono="acento"
          />
          <StatTile
            etiqueta="Cierre del trimestre"
            valor={formatUSD(openTotal(cierraEnTrimestre))}
            subtexto={`${cierraEnTrimestre.length} con cierre estimado`}
          />
          <StatTile
            etiqueta="Piso de margen"
            valor={formatPercent(toClient(politica.marginFloor), 0)}
            subtexto="política del país"
            tono="exito"
          />
          <StatTile
            etiqueta="En riesgo"
            valor={formatUSD(openTotal(enRiesgo))}
            subtexto={`${enRiesgo.length} con bandera activa`}
            tono={enRiesgo.length > 0 ? "peligro" : "neutro"}
          />
        </div>

        <div className="mt-6">
          {vista === "kanban" ? (
            <TableroKanban
              columnas={columnas}
              // Mover desde el tablero es la misma acción que desde el
              // detalle: una sola evaluación de RN-02, un solo camino.
              puedeMover
              accion={cambiarEtapaAccion}
              accionVacio={
                <>
                  <Boton href="/oportunidades" variante="secundario">
                    Limpiar filtros
                  </Boton>
                  {botonDeAlta}
                </>
              }
            />
          ) : (
            <TablaOportunidades
              oportunidades={tarjetas}
              etapaDe={Object.fromEntries(conBanderas.map((o) => [o.id, o.stage.name]))}
            />
          )}
        </div>
      </div>
    </>
  );
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
