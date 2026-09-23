import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { listActivities } from "@/lib/scope";
import {
  contextoDeCompuerta,
  cotizacionConLineas,
  getOpportunityDetail,
  type DetalleOportunidad,
} from "@/lib/scope/opportunityDetail";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { configurado as calendarioConfigurado } from "@/lib/graph/token";
import { ciudadDe, etiquetaDeDuracion, fechaCortaEn, horaEn } from "@/lib/tiempo";
import { cotizacionVigente } from "@/lib/scope/cotizaciones";
import { bitacoraDeOportunidad } from "@/lib/scope/bitacora";
import { listProductos } from "@/lib/scope/productos";
import { calcularLinea, lineasBajoElPiso } from "@/lib/domain/quote";
import {
  TablaDeCotizacion,
  type LineaCalculada,
  type ProductoElegible,
} from "@/components/cotizacion/TablaDeCotizacion";
import { Bitacora } from "@/components/oportunidad/Bitacora";
import { AbrirCotizacion } from "@/components/cotizacion/AbrirCotizacion";
import { PanelMeddic, type ComponenteMeddic } from "@/components/oportunidad/PanelMeddic";
import { PanelHitos, type HitoDeLista } from "@/components/oportunidad/PanelHitos";
import { PanelDocumentos, type DocumentoDeLista } from "@/components/oportunidad/PanelDocumentos";
import { DESCRIPCION_COMPONENTE, NOMBRE_COMPONENTE } from "@/lib/domain/meddic";
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
  guardarCotizacionAccion,
  guardarLineaAccion,
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
import {
  ComposerDeActividad,
  type ActividadEditable,
} from "@/components/oportunidad/ComposerDeActividad";
import { DatoEditable } from "@/components/oportunidad/DatoEditable";
import { EditarPersona } from "@/components/contactos/EditarPersona";
import { crearPersonaAccion, editarPersonaAccion } from "../../contactos/acciones";
import { EditarOportunidad } from "@/components/oportunidad/EditarOportunidad";
import { catalogosParaAlta, tiposDeActividad } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { can, type Session } from "@/lib/auth/permissions";
import {
  cambiarEtapaAccion,
  editarCampoAccion,
  editarOportunidadAccion,
  guardarActividadAccion,
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

  const [politica, pais, actividades, catalogos, tiposActividad, propietarios, cotizacion, bitacora] =
    await Promise.all([
      getCommercialPolicy(oportunidad.pipeline.countryCode),
      // La zona horaria de la oportunidad: las actividades se capturan y se
      // leen como hora de pared de esa ciudad.
      getCountry(oportunidad.countryCode),
      listActivities(session, { where: { opportunityId: oportunidad.id }, take: 30 }),
      catalogosParaAlta(),
      tiposDeActividad(),
      // Siempre, no solo para quien reasigna: el composer de actividad ofrece
      // al responsable entre quienes operan en el país, sin puerta por rol
      // (decisiones §20). Reasignar la oportunidad sigue gateado más abajo.
      destinatariosValidos(oportunidad.countryCode),
      cotizacionVigente(session, oportunidad.id),
      bitacoraDeOportunidad(session, oportunidad),
    ]);

  const composer = {
    opportunityId: oportunidad.id,
    tipos: tiposActividad,
    usuarios: propietarios.map((u) => ({ id: u.id, name: u.name })),
    usuarioActual: session.userId,
    zona: pais.timezone,
    zonaEtiqueta: ciudadDe(pais.timezone),
    calendarioConfigurado: calendarioConfigurado(),
    accion: guardarActividadAccion,
  };

  const pestanaActiva = typeof sp.p === "string" ? sp.p : "resumen";
  const hrefDe = (clave: string) => `/oportunidades/${oportunidad.id}?p=${clave}`;

  const pestanas: Pestana[] = [
    { clave: "resumen", etiqueta: "Resumen" },
    { clave: "actividades", etiqueta: "Actividades", contador: actividades.length },
    { clave: "cotizacion", etiqueta: "Cotización", contador: cotizacion?.lines.length ?? 0 },
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
    { clave: "bitacora", etiqueta: "Bitácora", contador: bitacora.length },
  ];

  const banderas = computeRiskFlags(oportunidad, oportunidad.stage, politica, new Date());
  const conCotizacion = cotizacionConLineas(oportunidad) != null;

  return (
    <>
      <BarraSuperior
        titulo={oportunidad.name}
        subtitulo={`${oportunidad.folio} · ${oportunidad.organization.name}`}
        usuario={{
          nombre: session.name,
          correo: session.email,
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
              cotizacion={cotizacion}
              politica={politica}
            />
          ) : pestanaActiva === "bitacora" ? (
            <Bitacora
              eventos={bitacora}
              filtro={typeof sp.f === "string" ? sp.f : "todo"}
              zona={pais.timezone}
              hrefDe={(f) => `/oportunidades/${oportunidad.id}?p=bitacora&f=${f}`}
            />
          ) : pestanaActiva === "actividades" ? (
            <TabActividades
              actividades={actividades}
              zona={pais.timezone}
              composer={oportunidad.status === "ABIERTA" ? composer : null}
            />
          ) : (
            <TabResumen
              o={oportunidad}
              politica={politica}
              conCotizacion={conCotizacion}
              rolesDeComite={catalogos.rolesComite}
              origenes={catalogos.origenes}
              propietarios={propietarios.map((u) => ({ id: u.id, name: u.name }))}
              puedeEditar={puedeEditarDetalle}
              puedeReasignar={puedeReasignar}
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

  const cotizacion = cotizacionConLineas(o);
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
                tieneCotizacion: cotizacionConLineas(o) != null,
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

      {/* Sin línea de contexto aquí: el folio y la cuenta ya están en la barra
          superior, y la persona y el propietario viven en el resumen. Repetirlos
          encima de las etapas era una fila que no decía nada nuevo. */}
      <div className="mt-4">
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
        <StatTile denso
          etiqueta={cotizacion ? "Valor neto" : "Valor estimado"}
          valor={formatUSD(cotizacion?.netSubtotal ?? o.amount)}
          subtexto={cotizacion ? "Neto de la cotización" : "Sin cotización con líneas"}
        />
        <StatTile denso
          etiqueta="Ponderado"
          valor={formatUSD(weightedAmount(o.amount, o.stage.probability))}
          subtexto={`${formatPercent(toClient(o.stage.probability), 0)} · ${o.stage.name}`}
          tono="acento"
        />
        {margen ? (
          <StatTile denso
            etiqueta="Margen"
            valor={formatPercent(toClient(margen))}
            subtexto={`Piso ${formatPercent(toClient(politica.marginFloor), 0)}`}
            tono={margenBajoElPiso ? "peligro" : "exito"}
          />
        ) : (
          <StatTile denso
            etiqueta="Margen"
            valor="—"
            subtexto="Aún sin cotizar"
          />
        )}
        <StatTile denso
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
  conCotizacion,
  rolesDeComite,
  origenes,
  propietarios,
  puedeEditar,
  puedeReasignar,
}: {
  o: DetalleOportunidad;
  politica: Politica;
  conCotizacion: boolean;
  rolesDeComite: { id: string; name: string }[];
  origenes: { id: string; name: string }[];
  propietarios: { id: string; name: string }[];
  puedeEditar: boolean;
  puedeReasignar: boolean;
}) {
  // La oportunidad viaja atada a la acción una sola vez, aquí: cada dato
  // editable solo manda su campo y su valor.
  const guardarCampo = editarCampoAccion.bind(null, o.id);

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
            {/* Los cinco que se corrigen sin abrir nada. El panel completo del
                encabezado sigue para el nombre, el importe y la persona. */}
            <DatoEditable
              etiqueta="Tipo de negocio"
              campo="businessType"
              valor={o.businessType}
              texto={ETIQUETA_TIPO[o.businessType] ?? o.businessType}
              opciones={opcionesDe(ETIQUETA_TIPO)}
              editable={puedeEditar}
              guardar={guardarCampo}
            />
            <DatoEditable
              etiqueta="Pronóstico"
              campo="forecastCategory"
              valor={o.forecastCategory}
              texto={ETIQUETA_PRONOSTICO[o.forecastCategory] ?? o.forecastCategory}
              // RN-29 · «Compromiso» se ofrece deshabilitada mientras el puntaje
              // no llegue: esconderla dejaría sin respuesta a quien la busca.
              opciones={opcionesDe(ETIQUETA_PRONOSTICO).map((c) => ({
                ...c,
                deshabilitada:
                  c.valor === "COMPROMISO" &&
                  (o.meddicScore ?? 0) < Number(politica.meddicMinToCommit),
              }))}
              editable={puedeEditar}
              guardar={guardarCampo}
            />
            <DatoEditable
              etiqueta="Cierre estimado"
              campo="expectedCloseDate"
              tipo="date"
              valor={o.expectedCloseDate.toISOString().slice(0, 10)}
              texto={FECHA.format(o.expectedCloseDate)}
              editable={puedeEditar}
              guardar={guardarCampo}
            />
            <DatoEditable
              etiqueta="Origen"
              campo="sourceId"
              valor={o.source?.id ?? ""}
              texto={o.source?.name ?? "Sin registrar"}
              opciones={[
                { valor: "", etiqueta: "Sin registrar" },
                ...origenes.map((s) => ({ valor: s.id, etiqueta: s.name })),
              ]}
              editable={puedeEditar}
              guardar={guardarCampo}
            />
            <DatoEditable
              etiqueta="Propietario"
              campo="ownerId"
              valor={o.owner.id}
              texto={o.owner.name}
              opciones={propietarios.map((u) => ({ valor: u.id, etiqueta: u.name }))}
              // Q-13 · reasignar es de Gerencia, así que para el vendedor su
              // propio nombre es un dato, no un control.
              editable={puedeEditar && puedeReasignar}
              guardar={guardarCampo}
            />
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

        {!conCotizacion && (
          <p className="text-xs text-texto-tenue">
            El importe mostrado es el estimado. Se reemplaza por el neto de la
            cotización cuando esta tenga líneas.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── Tab Actividades

// ───────────────────────────────────────────────────────────── Cotización

/**
 * La pestaña de cotización · E2, decisiones §21.
 *
 * Una sola cotización, editable en su lugar. Las líneas se calculan con
 * `Decimal` y se formatean aquí, antes de cruzar al cliente (INV-03); el costo
 * y el precio se mandan sin formato porque son celdas editables. El costo solo
 * viaja con `VER_COSTO` (INV-02).
 */
async function TabCotizacion({
  session,
  oportunidad,
  cotizacion,
  politica,
}: {
  session: Session;
  oportunidad: DetalleOportunidad;
  cotizacion: Awaited<ReturnType<typeof cotizacionVigente>>;
  politica: Politica;
}) {
  const verCosto = can(session, "VER_COSTO");
  const verMargen = can(session, "VER_MARGEN");
  const puedeEditar =
    oportunidad.status === "ABIERTA" &&
    (oportunidad.owner.id === session.userId || can(session, "VER_OPORTUNIDADES_OFICINA"));

  if (!cotizacion) {
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
      precioUnitario: toClient(l.unitPrice),
      descuentoPct: l.discountRate.times(100).toFixed(2).replace(/\.?0+$/, ""),
      precioNeto: formatUSD(calculo.neto),
      importe: formatUSD(calculo.importe),
      ...(verCosto && "unitCost" in l
        ? { costoUnitario: toClient(l.unitCost), utilidad: formatUSD(calculo.utilidad) }
        : {}),
      ...(verMargen ? { margen: formatPercent(toClient(calculo.margen)) } : {}),
      bajoElPiso: bajas.has(l.description),
    };
  });

  // Todo el catálogo activo. Sin lista vigente (§22), precio y costo se fijan
  // en la línea: el campo llega vacío y el panel lo dice.
  const elegibles: ProductoElegible[] = productos.map((p) => {
    const precio = p.prices[0] ?? null;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      listPrice: precio ? toClient(precio.listPrice) : null,
      ...(verCosto && precio && "standardCost" in precio
        ? { standardCost: toClient(precio.standardCost) }
        : {}),
    };
  });

  return (
    <TablaDeCotizacion
      quoteId={cotizacion.id}
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
      productos={elegibles}
      verCosto={verCosto}
      verMargen={verMargen}
      puedeEditar={puedeEditar}
      pisoDeLinea={formatPercent(toClient(politica.lineMarginFloor), 0)}
      // Para la vista previa al editar: la tasa copiada (RN-24) y el piso por línea.
      enVivo={{
        taxRate: toClient(cotizacion.taxRate),
        pisoDeLinea: toClient(politica.lineMarginFloor),
      }}
      acciones={{
        guardarLinea: guardarLineaAccion,
        guardarCotizacion: guardarCotizacionAccion,
        quitarLinea: quitarLineaAccion,
      }}
    />
  );
}

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
      descripcion: DESCRIPCION_COMPONENTE[clave],
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
  // RN-06 · se cuadra contra el neto de la cotización con líneas. Sin ellas no
  // hay total que repartir, y eso es distinto de «cuadra en cero».
  const neto = cotizacionConLineas(o)?.netSubtotal ?? null;

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
        // Sin formato: el panel calcula en vivo lo que queda por asignar.
        asignadoCrudo: toClient(asignado),
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

type PropsDelComposer = Omit<
  React.ComponentProps<typeof ComposerDeActividad>,
  "actividad"
>;

function TabActividades({
  actividades,
  zona,
  composer,
}: {
  actividades: Awaited<ReturnType<typeof listActivities>>;
  /** La zona de la oportunidad: las horas se leen como en la captura. */
  zona: string;
  /** Lo que necesita el composer; `null` cuando la oportunidad ya no admite escritura. */
  composer: PropsDelComposer | null;
}) {
  const nueva = composer ? <ComposerDeActividad {...composer} /> : null;

  if (actividades.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin actividades registradas"
        explicacion="Toda oportunidad abierta debería tener una próxima actividad agendada. Sin ella, el negocio depende de que alguien se acuerde."
        accion={
          nueva ?? (
            <Boton variante="secundario" href="/actividades">
              Ir a la agenda
            </Boton>
          )
        }
      />
    );
  }

  const fecha = fechaCortaEn(zona);

  return (
    <>
      {nueva && <div className="mb-4 flex justify-end">{nueva}</div>}
      <ol className="space-y-3">
        {actividades.map((a) => {
          const fin = a.durationMin
            ? new Date(a.startsAt.getTime() + a.durationMin * 60_000)
            : null;
          return (
            <li key={a.id} className="rounded-md border border-borde bg-superficie-tarjeta p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pastilla>{a.type.name}</Pastilla>
                <p className="text-sm font-medium text-texto-titulo">{a.subject}</p>
                <span className="tabular ml-auto text-xs text-texto-tenue">
                  {fecha.format(a.startsAt)} · {horaEn(a.startsAt, zona)}
                  {fin && `–${horaEn(fin, zona)}`}
                  {a.durationMin ? ` · ${etiquetaDeDuracion(a.durationMin)}` : ""}
                </span>
                {composer && (
                  <ComposerDeActividad
                    {...composer}
                    actividad={{
                      id: a.id,
                      typeId: a.type.id,
                      subject: a.subject,
                      notes: a.notes,
                      outcome: a.outcome,
                      startsAt: a.startsAt.toISOString(),
                      durationMin: a.durationMin,
                      hecha: a.completedAt != null,
                      userId: a.user.id,
                      enCalendario: a.externalEventId != null,
                    } satisfies ActividadEditable}
                  />
                )}
              </div>
              {a.notes && <p className="mt-2 text-sm text-texto-cuerpo">{a.notes}</p>}
              {a.outcome && <p className="mt-1 text-sm text-texto-cuerpo">{a.outcome}</p>}
              <p className="mt-2 text-xs text-texto-tenue">
                {a.user.name}
                {a.completedAt ? " · realizada" : " · pendiente"}
                {a.externalEventId && " · en el calendario"}
              </p>
            </li>
          );
        })}
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

/** Un mapa de etiquetas, como lo quiere un desplegable. */
function opcionesDe(mapa: Record<string, string>) {
  return Object.entries(mapa).map(([valor, etiqueta]) => ({ valor, etiqueta }));
}

const ETIQUETA_PRONOSTICO: Record<string, string> = {
  PIPELINE: "Pipeline",
  MEJOR_CASO: "Mejor caso",
  COMPROMISO: "Compromiso",
  OMITIDA: "Omitida",
};
