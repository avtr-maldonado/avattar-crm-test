import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { listActivities } from "@/lib/scope";
import {
  contextoDeCompuerta,
  getOpportunityDetail,
  type DetalleOportunidad,
} from "@/lib/scope/opportunityDetail";
import { getCommercialPolicy } from "@/lib/policy";
import { getCotizacion, listCotizaciones } from "@/lib/scope/cotizaciones";
import { listProductos } from "@/lib/scope/productos";
import { calcularLinea, lineasBajoElPiso } from "@/lib/domain/quote";
import { TablaDeCotizacion, type LineaCalculada } from "@/components/cotizacion/TablaDeCotizacion";
import { AbrirCotizacion } from "@/components/cotizacion/AbrirCotizacion";
import { PanelMeddic, type ComponenteMeddic } from "@/components/oportunidad/PanelMeddic";
import { PanelHitos, type HitoDeLista } from "@/components/oportunidad/PanelHitos";
import { PanelDocumentos, type DocumentoDeLista } from "@/components/oportunidad/PanelDocumentos";
import { NOMBRE_COMPONENTE } from "@/lib/domain/meddic";
import { cuadreDeHitos, porcentajeDelNeto } from "@/lib/domain/milestone";
import { sum } from "@/lib/money";
import {
  descargarDocumentoAccion,
  guardarHitoAccion,
  guardarMeddicAccion,
  marcarHitoAccion,
  quitarDocumentoAccion,
  quitarHitoAccion,
  subirDocumentoAccion,
} from "./tabs.acciones";
import {
  abrirCotizacionAccion,
  congelarAccion,
  guardarLineaAccion,
  nuevaVersionAccion,
  quitarLineaAccion,
} from "./cotizacion.acciones";
import { formatPercent, formatUSD, money, toClient } from "@/lib/money";
import { weightedAmount } from "@/lib/domain/pipeline";
import { computeRiskFlags } from "@/lib/domain/riskFlags";
import { evaluateGate, type GateRequirement } from "@/lib/domain/stageGate";
import { ETIQUETA_BANDERA, ETIQUETA_ESTATUS, iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Avatar, Boton, EstadoVacio, Pastilla, StatTile } from "@/components/ui/primitivas";
import { Pestanas, type Pestana } from "@/components/oportunidad/Pestanas";
import { ListaDeRequisitos } from "@/components/oportunidad/ListaDeRequisitos";
import { CambioDeEtapa } from "@/components/oportunidad/CambioDeEtapa";
import { RegistrarActividad } from "@/components/oportunidad/RegistrarActividad";
import { EditarPersona } from "@/components/contactos/EditarPersona";
import { crearPersonaAccion, editarPersonaAccion } from "../../contactos/acciones";
import { EditarOportunidad } from "@/components/oportunidad/EditarOportunidad";
import { catalogosParaAlta, tiposDeActividad } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { can, type Session } from "@/lib/auth/permissions";
import {
  cambiarEtapaAccion,
  editarOportunidadAccion,
  registrarActividadAccion,
} from "./acciones";

/**
 * La política, derivada de su lector.
 *
 * Así la pantalla tiene el tipo exacto sin importar `@prisma/client`, que la
 * regla de frontera prohíbe en `app/**` (INV-01), y sin repetir a mano una
 * forma que se desincronizaría al agregar un umbral.
 */
type Politica = Awaited<ReturnType<typeof getCommercialPolicy>>;

/**
 * P-02 · Detalle de oportunidad.
 *
 * En E1 llegan las pestañas Resumen y Actividades; Cotización, MEDDIC, Hitos y
 * Documentos se ven marcadas con el incremento en que aterrizan (E2 y E3).
 *
 * Lo que ya gobierna proceso, y no solo muestra datos: la lista de requisitos
 * para avanzar de etapa, que evalúa `RN-02` con el evaluador genérico y dice
 * exactamente qué falta, con la cifra concreta cuando aplica.
 */
export default async function DetalleOportunidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Los tres son independientes entre sí: `requireSession` es un viaje a la base
  // y no depende de los parámetros de la ruta. En secuencia se paga de más
  // (docs/latencia.md).
  const [session, { id }, sp] = await Promise.all([
    requireSession(),
    params,
    searchParams,
  ]);

  const oportunidad = await getOpportunityDetail(session, id);

  // 404 tanto si no existe como si no la alcanza: distinguirlas le confirmaría
  // a un vendedor que la oportunidad de su compañero existe.
  if (!oportunidad) notFound();

  // Las dos dependen de la oportunidad, pero no entre sí. En secuencia costaban
  // dos viajes; medido contra us-east-1, cada uno son ~287 ms de pura red
  // (docs/latencia.md).
  const puedeReasignar = can(session, "VER_OPORTUNIDADES_OFICINA");
  // Q-13 · el propietario o quien tenga alcance de oficina. Una cerrada no se
  // toca: reabrirla es de Administración (RN-18).
  const puedeEditarDetalle =
    oportunidad.status === "ABIERTA" &&
    (oportunidad.owner.id === session.userId || puedeReasignar);

  const [politica, actividades, catalogos, tiposActividad, propietarios, cotizaciones] = await Promise.all([
    getCommercialPolicy(oportunidad.pipeline.countryCode),
    listActivities(session, { where: { opportunityId: oportunidad.id }, take: 30 }),
    catalogosParaAlta(),
    tiposDeActividad(),
    // Solo si de verdad puede reasignar: pedir la lista para deshabilitar un
    // control sería pagar por algo que nadie va a poder usar (Q-13).
    puedeReasignar
      ? destinatariosValidos(oportunidad.organization.countryCode)
      : Promise.resolve([]),
    listCotizaciones(session, oportunidad.id),
  ]);

  const pestanaActiva = typeof sp.p === "string" ? sp.p : "resumen";
  const hrefDe = (clave: string) => `/oportunidades/${oportunidad.id}?p=${clave}`;

  const pestanas: Pestana[] = [
    { clave: "resumen", etiqueta: "Resumen" },
    { clave: "actividades", etiqueta: "Actividades", contador: actividades.length },
    { clave: "cotizacion", etiqueta: "Cotización", contador: cotizaciones.length },
    {
      clave: "meddic",
      etiqueta: "MEDDIC",
      // Cuántos de los seis están evaluados, NO el puntaje: en el resto de la
      // aplicación esta píldora cuenta cosas, y «84» ahí se leería como 84
      // elementos. El puntaje se muestra grande y con color dentro de la
      // pestaña, que es donde significa algo.
      contador: oportunidad.meddic.filter((m) => m.status !== "NO_EVALUADO").length,
    },
    { clave: "hitos", etiqueta: "Hitos", contador: oportunidad.milestones.length },
    { clave: "documentos", etiqueta: "Documentos", contador: oportunidad.documents.length },
  ];

  const banderas = computeRiskFlags(oportunidad, oportunidad.stage, politica, new Date());
  const congelada = oportunidad.quotes[0];

  return (
    <>
      <BarraSuperior
        titulo={oportunidad.name}
        subtitulo={`${oportunidad.folio} · ${oportunidad.organization.name}`}
        usuario={{
          nombre: session.name,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Encabezado
          o={oportunidad}
          banderas={banderas}
          politica={politica}
          sesion={session}
          puedeReasignar={puedeReasignar}
          origenes={catalogos.origenes}
          propietarios={propietarios.map((u) => ({ id: u.id, name: u.name }))}
        />

        <div className="mt-6">
          <Pestanas pestanas={pestanas} activa={pestanaActiva} hrefDe={hrefDe} />
        </div>

        <div className="mt-6">
          {pestanaActiva === "meddic" ? (
            <TabMeddic o={oportunidad} politica={politica} puedeEditar={puedeEditarDetalle} />
          ) : pestanaActiva === "hitos" ? (
            <TabHitos o={oportunidad} puedeEditar={puedeEditarDetalle} />
          ) : pestanaActiva === "documentos" ? (
            <TabDocumentos
              o={oportunidad}
              tipos={catalogos.tiposDocumento}
              puedeEditar={puedeEditarDetalle}
            />
          ) : pestanaActiva === "cotizacion" ? (
            <TabCotizacion
              session={session}
              oportunidad={oportunidad}
              cotizaciones={cotizaciones}
              politica={politica}
            />
          ) : pestanaActiva === "actividades" ? (
            <TabActividades
              actividades={actividades}
              acciones={
                oportunidad.status === "ABIERTA" ? (
                  <RegistrarActividad
                    opportunityId={oportunidad.id}
                    tipos={tiposActividad}
                    accion={registrarActividadAccion}
                  />
                ) : null
              }
            />
          ) : (
            <TabResumen
              o={oportunidad}
              politica={politica}
              congeladaExiste={congelada != null}
              rolesDeComite={catalogos.rolesComite}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────── Encabezado

function Encabezado({
  o,
  banderas,
  politica,
  sesion,
  puedeReasignar,
  origenes,
  propietarios,
}: {
  o: DetalleOportunidad;
  banderas: ReturnType<typeof computeRiskFlags>;
  politica: Politica;
  sesion: Session;
  puedeReasignar: boolean;
  origenes: { id: string; name: string }[];
  propietarios: { id: string; name: string }[];
}) {
  const etapas = o.pipeline.stages.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    probabilidad: formatPercent(toClient(e.probability), 0),
    gateMode: e.gateMode,
  }));

  // Q-13 · el propietario o quien tenga alcance de oficina. La pantalla lo
  // pregunta para no ofrecer un botón que el servidor va a rechazar; la
  // autorización de verdad vive en `lib/domain`.
  const puedeEditar = o.status === "ABIERTA" && (o.owner.id === sesion.userId || puedeReasignar);

  const congelada = o.quotes[0];
  // `grossMargin` solo viene si el usuario tiene VER_MARGEN: el selector lo
  // omite del `select`, no lo oculta después (INV-02).
  const margen = "grossMargin" in o ? o.grossMargin : null;
  const margenBajoElPiso = margen ? margen.lt(politica.marginFloor) : false;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <Pastilla tono={o.status === "GANADA" ? "exito" : o.status === "PERDIDA" ? "neutro" : "acento"}>
          {ETIQUETA_ESTATUS[o.status]}
        </Pastilla>
        <Pastilla>{o.pipeline.name}</Pastilla>
        {o.organization.isStrategic && <Pastilla tono="acento">Cuenta estratégica</Pastilla>}
        {banderas.map((b) => (
          <Pastilla key={b} tono={b === "MARGEN_BAJO" ? "peligro" : "alerta"}>
            {ETIQUETA_BANDERA[b]}
          </Pastilla>
        ))}

        <div className="ml-auto flex gap-2">
          {/* Marcar ganada y marcar perdida llegan con E3: dependen del cuadre
              de hitos (AC-18) y de los mínimos MEDDIC (AC-14, AC-20). Ponerlas
              hoy sería poner botones que siempre se niegan. */}
          <Boton variante="secundario" href={`/contactos/organizaciones/${o.organization.id}`}>
            Ver cuenta
          </Boton>
          {puedeEditar && (
            <EditarOportunidad
              datos={{
                id: o.id,
                name: o.name,
                primaryPersonId: o.primaryPerson?.id ?? null,
                estimatedAmount: toClient(o.estimatedAmount),
                expectedCloseDate: o.expectedCloseDate.toISOString().slice(0, 10),
                businessType: o.businessType,
                forecastCategory: o.forecastCategory,
                sourceId: o.source?.id ?? null,
                ownerId: o.owner.id,
                tieneCotizacionCongelada: o.quotes.length > 0,
                meddicScore: o.meddicScore,
              }}
              personas={o.organization.people.map((p) => ({
                id: p.id,
                name: p.name,
                jobTitle: p.jobTitle,
              }))}
              origenes={origenes}
              propietarios={propietarios}
              puedeReasignar={puedeReasignar}
              minimoParaCompromiso={Number(politica.meddicMinToCommit)}
              accion={editarOportunidadAccion}
            />
          )}
        </div>
      </div>

      {/*
        La línea de contexto: de quién es la cuenta, con quién se habla y quién
        la lleva. Es lo que alguien necesita antes de tocar nada.
      */}
      <p className="mt-3 text-sm text-texto-tenue">
        <span className="[font-variant-numeric:tabular-nums]">{o.folio}</span> ·{" "}
        {o.organization.name}
        {o.primaryPerson && (
          <>
            {" · "}
            {o.primaryPerson.name}
            {o.primaryPerson.jobTitle ? ` (${o.primaryPerson.jobTitle})` : ""}
          </>
        )}
        {" · "}
        {o.owner.name} · USD
      </p>

      <div className="mt-5">
        <CambioDeEtapa
          opportunityId={o.id}
          etapas={etapas}
          etapaActualId={o.stage.id}
          cerrada={o.status === "ABIERTA" ? undefined : o.status}
          puedeMover={puedeEditar}
          accion={cambiarEtapaAccion}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          etiqueta={congelada ? "Valor neto" : "Valor estimado"}
          valor={formatUSD(congelada?.netSubtotal ?? o.amount)}
          subtexto={congelada ? `Cotización v${congelada.version}` : "Sin cotización congelada"}
        />
        <StatTile
          etiqueta="Ponderado"
          valor={formatUSD(weightedAmount(o.amount, o.stage.probability))}
          subtexto={`${formatPercent(toClient(o.stage.probability), 0)} · ${o.stage.name}`}
          tono="acento"
        />
        {margen ? (
          <StatTile
            etiqueta="Margen"
            valor={formatPercent(toClient(margen))}
            subtexto={`Piso ${formatPercent(toClient(politica.marginFloor), 0)}`}
            tono={margenBajoElPiso ? "peligro" : "exito"}
          />
        ) : (
          <StatTile
            etiqueta="Margen"
            valor="—"
            subtexto="Aún sin cotizar"
          />
        )}
        <StatTile
          etiqueta="MEDDIC"
          valor={o.meddicScore === null ? "—" : String(o.meddicScore)}
          subtexto={`Mínimo de cierre ${politica.meddicMinToClosing}`}
          tono={
            o.meddicScore === null
              ? "neutro"
              : o.meddicScore >= politica.meddicMinToClosing
                ? "exito"
                : "peligro"
          }
        />
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────── Tab Resumen

function TabResumen({
  o,
  politica,
  congeladaExiste,
  rolesDeComite,
}: {
  o: DetalleOportunidad;
  politica: Politica;
  congeladaExiste: boolean;
  rolesDeComite: { id: string; name: string }[];
}) {
  // La etapa siguiente es la accionable: los requisitos de la actual ya se
  // cumplieron al entrar (§8.3).
  const siguiente = o.pipeline.stages.find((e) => e.position === o.stage.position + 1);
  const requisitos = (siguiente?.gateRequires ?? []) as GateRequirement[];
  const evaluacion = evaluateGate(requisitos, contextoDeCompuerta(o, politica));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Tarjeta titulo="Datos de la oportunidad">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Dato etiqueta="Folio" valor={o.folio} mono />
            <Dato etiqueta="Cuenta" valor={o.organization.name} />
            <Dato etiqueta="Tipo de negocio" valor={ETIQUETA_TIPO[o.businessType]} />
            <Dato etiqueta="Pronóstico" valor={ETIQUETA_PRONOSTICO[o.forecastCategory]} />
            <Dato
              etiqueta="Cierre estimado"
              valor={FECHA.format(o.expectedCloseDate)}
              tabular
            />
            <Dato etiqueta="Origen" valor={o.source?.name ?? "Sin registrar"} />
            <Dato etiqueta="Propietario" valor={o.owner.name} />
            <Dato etiqueta="Creada por" valor={o.createdBy.name} />
            <Dato etiqueta="En esta etapa desde" valor={FECHA.format(o.stageEnteredAt)} tabular />
          </dl>
        </Tarjeta>

        <Tarjeta
          titulo="Comité de compra"
          accion={
            // Q-15 · capturar al contacto que acabas de conocer es parte de
            // trabajar la oportunidad, así que basta con alcanzar la cuenta.
            <EditarPersona
              organizationId={o.organization.id}
              rolesDeComite={rolesDeComite}
              accion={crearPersonaAccion}
              etiquetaBoton="Agregar"
              variante="fantasma"
            />
          }
        >
          {o.organization.people.length === 0 ? (
            <p className="text-sm text-texto-tenue">
              La cuenta todavía no tiene personas registradas. El comité de compra es
              lo que ancla el decisor económico y el campeón en MEDDIC.
            </p>
          ) : (
            <ul className="space-y-3">
              {o.organization.people.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar iniciales={p.initials} titulo={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-texto-titulo">
                      {p.name}
                      {p.id === o.primaryPerson?.id && (
                        <span className="ml-2 text-xs font-normal text-texto-tenue">
                          contacto principal
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-texto-tenue">
                      {[p.jobTitle, p.committeeRole?.name].filter(Boolean).join(" · ") ||
                        "Sin rol declarado"}
                    </p>
                  </div>
                  {/* Aquí es donde se descubre que el cargo cambió, así que
                      aquí tiene que poder corregirse. */}
                  <EditarPersona
                    persona={{
                      id: p.id,
                      name: p.name,
                      jobTitle: p.jobTitle,
                      email: p.email ?? null,
                      phone: null,
                      committeeRoleId: p.committeeRole?.id ?? null,
                    }}
                    rolesDeComite={rolesDeComite}
                    accion={editarPersonaAccion}
                    variante="fantasma"
                  />
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="space-y-6">
        <Tarjeta titulo={null}>
          {siguiente ? (
            <ListaDeRequisitos
              etapaDestino={siguiente.name}
              requisitos={requisitos}
              faltantes={evaluacion.missing}
              modo={siguiente.gateMode}
            />
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-texto-titulo">Última etapa</h3>
              <p className="mt-2 text-sm text-texto-tenue">
                Desde aquí la oportunidad se marca ganada o perdida. Las condiciones
                de cierre —hitos cuadrados, MEDDIC sobre el mínimo y documento de
                respaldo— se validan al marcarla, y llegan con E3.
              </p>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Historial de etapas">
          {o.stageHistory.length === 0 ? (
            <p className="text-sm text-texto-tenue">
              Sin transiciones registradas. Se anotan a partir del primer cambio de
              etapa hecho desde el sistema.
            </p>
          ) : (
            <ol className="space-y-3">
              {o.stageHistory.map((t) => (
                <li key={t.id} className="text-sm">
                  <p className="text-texto-cuerpo">
                    {t.fromStage ? `${t.fromStage.name} → ` : ""}
                    <span className="font-medium">{t.toStage.name}</span>
                    {t.gateOverride && (
                      <span className="ml-2">
                        <Pastilla tono="alerta">Avanzó con advertencia</Pastilla>
                      </span>
                    )}
                  </p>
                  <p className="tabular text-xs text-texto-tenue">
                    {FECHA.format(t.atDate)} · {t.byUser.name}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        {!congeladaExiste && (
          <p className="text-xs text-texto-tenue">
            El importe mostrado es el estimado. Se reemplaza por el neto de la
            cotización cuando exista una congelada.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── Tab Actividades

// ───────────────────────────────────────────────────────────── Cotización

/**
 * La pestaña de cotización · E2.
 *
 * Carga la versión vigente —el borrador si lo hay, si no la última congelada—
 * y **formatea aquí** cada cifra. El componente cliente recibe cadenas ya
 * hechas: la aritmética de dinero es `Decimal` del lado del servidor (INV-03),
 * y lo que cruza la frontera no es un número, es un texto.
 */
async function TabCotizacion({
  session,
  oportunidad,
  cotizaciones,
  politica,
}: {
  session: Session;
  oportunidad: DetalleOportunidad;
  cotizaciones: Awaited<ReturnType<typeof listCotizaciones>>;
  politica: Politica;
}) {
  const verCosto = can(session, "VER_COSTO");
  const verMargen = can(session, "VER_MARGEN");
  const puedeEditar =
    oportunidad.status === "ABIERTA" &&
    (oportunidad.owner.id === session.userId || can(session, "VER_OPORTUNIDADES_OFICINA"));

  // La vigente: el borrador si existe, si no la última —congelada o no—.
  const vigente = cotizaciones.find((c) => c.status === "BORRADOR") ?? cotizaciones[0];

  if (!vigente) {
    return (
      <EstadoVacio
        titulo="Sin cotización"
        explicacion="La cotización es lo que convierte una oportunidad en una promesa con cifras: fija el neto, el margen y lo que se puede descontar."
        accion={
          puedeEditar ? (
            <AbrirCotizacion opportunityId={oportunidad.id} accion={abrirCotizacionAccion} />
          ) : (
            <Boton variante="secundario" href={`/oportunidades/${oportunidad.id}`}>
              Volver al resumen
            </Boton>
          )
        }
      />
    );
  }

  const cotizacion = await getCotizacion(session, vigente.id);
  if (!cotizacion) notFound();

  const productos = puedeEditar ? await listProductos(session) : [];

  // Las líneas, calculadas con Decimal y formateadas antes de cruzar.
  const paraElPiso = cotizacion.lines.map((l) => ({
    descripcion: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountRate: l.discountRate,
    // Sin VER_COSTO el costo no viene (INV-02), y sin costo no hay margen que
    // comparar contra el piso: la franja simplemente no señala nada.
    unitCost: "unitCost" in l ? l.unitCost : money(0),
  }));
  const bajas = new Set(
    verCosto ? lineasBajoElPiso(paraElPiso, politica.lineMarginFloor).map((b) => b.descripcion) : [],
  );

  const lineas: LineaCalculada[] = cotizacion.lines.map((l, i) => {
    const calculo = calcularLinea(paraElPiso[i]!);
    return {
      id: l.id,
      descripcion: l.description,
      unidad: l.unit,
      cantidad: toClient(l.quantity),
      precioLista: formatUSD(l.unitPrice),
      descuentoPct: l.discountRate.times(100).toFixed(2).replace(/\.?0+$/, ""),
      precioNeto: formatUSD(calculo.neto),
      importe: formatUSD(calculo.importe),
      ...(verCosto && "unitCost" in l
        ? { costoUnitario: formatUSD(l.unitCost), utilidad: formatUSD(calculo.utilidad) }
        : {}),
      ...(verMargen ? { margen: formatPercent(toClient(calculo.margen)) } : {}),
      bajoElPiso: bajas.has(l.description),
    };
  });

  return (
    <div className="space-y-4">
      {cotizaciones.length > 1 && (
        <p className="text-xs text-texto-tenue">
          {cotizaciones.length} versiones ·{" "}
          {cotizaciones
            .map((c) => `v${c.version} ${ETIQUETA_ESTADO_COTIZACION[c.status]}`)
            .join(" · ")}
        </p>
      )}

      <TablaDeCotizacion
        quoteId={cotizacion.id}
        version={cotizacion.version}
        status={cotizacion.status}
        congeladaEl={cotizacion.frozenAt ? FECHA.format(cotizacion.frozenAt) : null}
        lineas={lineas}
        totales={{
          grossSubtotal: formatUSD(cotizacion.grossSubtotal),
          descuento: formatUSD(cotizacion.grossSubtotal.minus(cotizacion.netSubtotal)),
          descuentoPct: formatPercent(toClient(cotizacion.discountRate)),
          netSubtotal: formatUSD(cotizacion.netSubtotal),
          taxPct: formatPercent(toClient(cotizacion.taxRate), 0),
          taxAmount: formatUSD(cotizacion.taxAmount),
          total: formatUSD(cotizacion.total),
          ...(verCosto && "totalCost" in cotizacion
            ? {
                totalCost: formatUSD(cotizacion.totalCost),
                grossProfit: formatUSD(cotizacion.grossProfit),
              }
            : {}),
          ...(verMargen && "grossMargin" in cotizacion
            ? { grossMargin: formatPercent(toClient(cotizacion.grossMargin)) }
            : {}),
        }}
        productos={productos.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
        verCosto={verCosto}
        verMargen={verMargen}
        puedeEditar={puedeEditar}
        pisoDeLinea={formatPercent(toClient(politica.lineMarginFloor), 0)}
        acciones={{
          guardarLinea: guardarLineaAccion,
          quitarLinea: quitarLineaAccion,
          congelar: congelarAccion,
          nuevaVersion: nuevaVersionAccion,
        }}
      />
    </div>
  );
}

const ETIQUETA_ESTADO_COTIZACION: Record<string, string> = {
  BORRADOR: "borrador",
  CONGELADA: "congelada",
  REEMPLAZADA: "reemplazada",
};

// ───────────────────────────────────────────────────────────────── MEDDIC

/** §2.1 · solo estos dos se anclan a una persona real del comité. */
const ANCLAN_PERSONA = new Set(["DECISOR_ECONOMICO", "CAMPEON"]);

const ORDEN_MEDDIC = [
  "METRICAS",
  "DECISOR_ECONOMICO",
  "CRITERIOS_DECISION",
  "PROCESO_DECISION",
  "DOLOR_IDENTIFICADO",
  "CAMPEON",
] as const;

function TabMeddic({
  o,
  politica,
  puedeEditar,
}: {
  o: DetalleOportunidad;
  politica: Politica;
  puedeEditar: boolean;
}) {
  const porComponente = new Map(o.meddic.map((m) => [m.component, m]));

  const componentes: ComponenteMeddic[] = ORDEN_MEDDIC.map((clave) => {
    const guardado = porComponente.get(clave);
    return {
      clave,
      nombre: NOMBRE_COMPONENTE[clave],
      estado: guardado?.status ?? "NO_EVALUADO",
      evidencia: guardado?.evidence ?? null,
      personaId: guardado?.person?.id ?? null,
      personaNombre: guardado?.person?.name ?? null,
      anclaPersona: ANCLAN_PERSONA.has(clave),
    };
  });

  return (
    <PanelMeddic
      opportunityId={o.id}
      puntaje={o.meddicScore ?? 0}
      componentes={componentes}
      personas={o.organization.people.map((p) => ({
        id: p.id,
        name: p.name,
        jobTitle: p.jobTitle,
      }))}
      minimos={{
        cierre: Number(politica.meddicMinToClosing),
        ganada: Number(politica.meddicMinToWin),
        compromiso: Number(politica.meddicMinToCommit),
      }}
      puedeEditar={puedeEditar}
      accion={guardarMeddicAccion}
    />
  );
}

// ────────────────────────────────────────────────────────────────── Hitos

function TabHitos({ o, puedeEditar }: { o: DetalleOportunidad; puedeEditar: boolean }) {
  // RN-06 · se cuadra contra el neto de la cotización CONGELADA. Sin ella no
  // hay total que repartir, y eso es distinto de «cuadra en cero».
  const congelada = o.quotes[0];
  const neto = congelada?.netSubtotal ?? null;

  const montos = o.milestones.map((h) => h.amount);
  const r = cuadreDeHitos(montos, neto);
  const asignado = sum(montos);

  const hitos: HitoDeLista[] = o.milestones.map((h) => ({
    id: h.id,
    descripcion: h.description,
    vence: FECHA.format(h.dueDate),
    venceISO: h.dueDate.toISOString().slice(0, 10),
    monto: toClient(h.amount),
    montoFormateado: formatUSD(h.amount),
    porcentaje: neto ? `${porcentajeDelNeto(h.amount, neto).toFixed(1)} %` : "—",
    cumplido: h.status === "CUMPLIDO",
  }));

  return (
    <PanelHitos
      opportunityId={o.id}
      hitos={hitos}
      neto={neto ? toClient(neto) : null}
      netoFormateado={neto ? formatUSD(neto) : null}
      cuadre={{
        cuadra: r.cuadra,
        mensaje: r.mensaje,
        asignado: formatUSD(asignado),
        porcentaje: neto && !neto.isZero() ? Number(asignado.div(neto).times(100)) : 0,
      }}
      puedeEditar={puedeEditar}
      acciones={{
        guardar: guardarHitoAccion,
        quitar: quitarHitoAccion,
        marcar: marcarHitoAccion,
      }}
    />
  );
}

// ───────────────────────────────────────────────────────────── Documentos

/** Bytes a algo legible. 1 048 576 no le dice nada a nadie. */
function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TabDocumentos({
  o,
  tipos,
  puedeEditar,
}: {
  o: DetalleOportunidad;
  tipos: { id: string; name: string }[];
  puedeEditar: boolean;
}) {
  const documentos: DocumentoDeLista[] = o.documents.map((d) => ({
    id: d.id,
    nombre: d.name,
    tipo: d.type.name,
    esContrato: d.type.isContract,
    version: d.version,
    tamano: tamanoLegible(d.sizeBytes),
    subidoPor: d.uploadedBy.name,
    cuando: FECHA.format(d.createdAt),
  }));

  return (
    <PanelDocumentos
      opportunityId={o.id}
      documentos={documentos}
      tipos={tipos}
      puedeEditar={puedeEditar}
      acciones={{
        subir: subirDocumentoAccion,
        descargar: descargarDocumentoAccion,
        quitar: quitarDocumentoAccion,
      }}
    />
  );
}

function TabActividades({
  actividades,
  acciones,
}: {
  actividades: Awaited<ReturnType<typeof listActivities>>;
  /** El botón de registrar, cuando la oportunidad admite escritura. */
  acciones: React.ReactNode;
}) {
  if (actividades.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin actividades registradas"
        explicacion="Toda oportunidad abierta debería tener una próxima actividad agendada. Sin ella, el negocio depende de que alguien se acuerde."
        accion={
          acciones ?? (
            <Boton variante="secundario" href="/actividades">
              Ir a la agenda
            </Boton>
          )
        }
      />
    );
  }

  return (
    <>
      {acciones && <div className="mb-4 flex justify-end">{acciones}</div>}
      <ol className="space-y-3">
      {actividades.map((a) => (
        <li
          key={a.id}
          className="rounded-md border border-borde bg-superficie-tarjeta p-4"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <Pastilla>{a.type.name}</Pastilla>
            <p className="text-sm font-medium text-texto-titulo">{a.subject}</p>
            <span className="tabular ml-auto text-xs text-texto-tenue">
              {FECHA.format(a.startsAt)}
            </span>
          </div>
          {a.notes && <p className="mt-2 text-sm text-texto-cuerpo">{a.notes}</p>}
          <p className="mt-2 text-xs text-texto-tenue">
            {a.user.name}
            {a.completedAt ? " · realizada" : " · pendiente"}
          </p>
        </li>
        ))}
      </ol>
    </>
  );
}

// ──────────────────────────────────────────────────────────────── Auxiliares

function Tarjeta({
  titulo,
  children,
  accion,
}: {
  titulo: string | null;
  children: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
      {(titulo || accion) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  mono = false,
  tabular = false,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  tabular?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow">{etiqueta}</dt>
      <dd
        className={`mt-0.5 text-sm text-texto-cuerpo ${mono ? "font-mono text-xs" : ""} ${tabular ? "tabular" : ""}`}
      >
        {valor}
      </dd>
    </div>
  );
}

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const ETIQUETA_TIPO: Record<string, string> = {
  NUEVO: "Cliente nuevo",
  EXPANSION: "Expansión",
  RENOVACION: "Renovación",
};

const ETIQUETA_PRONOSTICO: Record<string, string> = {
  PIPELINE: "Pipeline",
  MEJOR_CASO: "Mejor caso",
  COMPROMISO: "Compromiso",
  OMITIDA: "Omitida",
};
