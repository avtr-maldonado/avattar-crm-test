import { forbidden } from "next/navigation";
import type { CountryCode, LeadStage } from "@/lib/dto";
import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCountry } from "@/lib/policy";
import { auditoriaDeProspecto, catalogosDeProspectos, coincidenciasParaConvertir, getLeadDetail, listLeads, vendedoresParaAsignar, type CoincidenciasDeConversion, type LeadDetail } from "@/lib/scope/leads";
import { catalogosParaAlta, tiposDeActividad } from "@/lib/scope/configuracion";
import { listPipelines, pipelinesParaAlta } from "@/lib/scope/pipelines";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { decideComoVentas, etapasQueVe, gestionaProspecto } from "@/lib/domain/leadAccess";
import { indicadoresDeProspectos } from "@/lib/domain/leadMetrics";
import { esTerminal, ETAPAS_ABIERTAS, ETAPAS_DE_PROSPECTO, ETIQUETA_DE_ETAPA, puedeTransitar } from "@/lib/domain/leadStages";
import { buscarOrganizacionesAccion, personasDeOrganizacionAccion } from "@/app/(app)/oportunidades/acciones";
import { relojDeAgenda } from "@/lib/domain/agenda";
import { hrefDeProspectos, parseFiltrosDeProspectos, whereDeProspectos } from "@/lib/filters/leads";
import { ciudadDe } from "@/lib/tiempo";
import { iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { BarraDeHerramientas } from "@/components/ui/BarraDeHerramientas";
import { Boton, ControlSegmentado, EstadoVacio, StatTile } from "@/components/ui/primitivas";
import { BuscadorDeProspectos } from "@/components/prospectos/BuscadorDeProspectos";
import { DetalleDeProspecto, type PestanaDeDetalle } from "@/components/prospectos/DetalleDeProspecto";
import { FiltrosDeProspectos } from "@/components/prospectos/FiltrosDeProspectos";
import { KanbanDeProspectos, type ColumnaDeProspectos } from "@/components/prospectos/KanbanDeProspectos";
import { NuevoProspecto } from "@/components/prospectos/NuevoProspecto";
import { ConvertirProspecto } from "@/components/prospectos/ConvertirProspecto";
import { ImportarProspectos } from "@/components/prospectos/ImportarProspectos";
import { PopupDeProspecto } from "@/components/prospectos/PopupDeProspecto";
import { EditarProspecto } from "@/components/prospectos/EditarProspecto";
import { TablaDeProspectos } from "@/components/prospectos/TablaDeProspectos";
import type { DatosDeProspecto } from "@/components/prospectos/formato";
import { aDatosDeProspecto, historiaDe } from "./datos";
import {
  asignarProspectosAccion,
  cambiarEtapaDeProspectoAccion,
  convertirProspectoAccion,
  crearProspectoAccion,
  descartarProspectoAccion,
  editarProspectoAccion,
  guardarActividadDeProspectoAccion,
  importarProspectosAccion,
  previsualizarImportacionAccion,
} from "./acciones";

/**
 * Prospectos · decisiones §58.
 *
 * Marketing capta, valida y califica; asigna a un vendedor, que acepta o
 * rechaza y convierte. Dos vistas sobre la misma lista —tabla y kanban— y un
 * detalle lateral abierto desde la URL. Todo lo que recorta vive en la URL
 * (INV-10) y se aplica después del alcance (`leadScope`): el vendedor ve lo
 * suyo, Marketing y Gerencia lo de sus países. Los cinco indicadores se suman
 * de la lista acotada, nunca de una consulta aparte.
 */
const VISTAS = [
  { valor: "lista", etiqueta: "Lista" },
  { valor: "kanban", etiqueta: "Kanban" },
] as const;
type Vista = (typeof VISTAS)[number]["valor"];

const ALCANCE = [
  { valor: "todos" as const, etiqueta: "Todos" },
  { valor: "mios" as const, etiqueta: "Solo los míos" },
];

const PESTANAS_DE_DETALLE: readonly PestanaDeDetalle[] = ["actividades", "informacion", "historia"];

export default async function ProspectosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  if (!can(session, "VER_PROSPECTOS")) forbidden();

  const url = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp)) {
    for (const uno of Array.isArray(valor) ? valor : valor ? [valor] : []) url.append(clave, uno);
  }
  const vista: Vista = url.get("vista") === "kanban" ? "kanban" : "lista";
  const filtros = parseFiltrosDeProspectos(url);
  const abiertoId = url.get("p");
  const pestanaPedida = url.get("t");
  const pestana: PestanaDeDetalle = PESTANAS_DE_DETALLE.find((p) => p === pestanaPedida) ?? "actividades";

  const pais = await oficinaActiva(session);
  const configuracion = await getCountry(pais);
  const zona = configuracion.timezone;
  const ahora = new Date();
  const reloj = relojDeAgenda(ahora, zona);
  const gestiona = can(session, "GESTIONAR_PROSPECTOS");

  const [todos, filtrados, catalogos, vendedores, destinatarios, tipos, detalle, pipelines] = await Promise.all([
    listLeads(session, { pais }),
    listLeads(session, { pais, where: whereDeProspectos(filtros, session) }),
    catalogosDeProspectos(),
    vendedoresParaAsignar(pais),
    destinatariosValidos(pais),
    tiposDeActividad(),
    abiertoId ? getLeadDetail(session, abiertoId) : Promise.resolve(null),
    abiertoId ? listPipelines(session) : Promise.resolve([]),
  ]);
  const conservar = { vista, ...(abiertoId ? { p: abiertoId } : {}) };
  const ctx = { session, zona, ahora, hrefDetalle: (id: string) => hrefDeProspectos(filtros, { vista, p: id }) };
  const datosDelDetalle = detalle ? aDatosDeProspecto(detalle, ctx) : null;
  // Lo que el panel de convertir necesita arranca aquí (§59): qué existe ya de la
  // empresa y la persona del prospecto, y los roles del comité para la nueva.
  const convierte = detalle !== null && datosDelDetalle?.puede.convertir === true;
  const [auditoria, coincidencias, catalogosDeAlta] = await Promise.all([
    detalle ? auditoriaDeProspecto(detalle.id) : Promise.resolve([]),
    convierte ? coincidenciasParaConvertir(session, detalle) : Promise.resolve(null),
    convierte ? catalogosParaAlta() : Promise.resolve(null),
  ]);
  const filas = filtrados.map((l) => aDatosDeProspecto(l, ctx));
  const indicadores = indicadoresDeProspectos(todos, ahora);
  const convertidos = todos.filter((l) => l.stage === "CONVERTIDO").length;

  // Las etapas que este rol ve (§59): al vendedor no se le pintan columnas ni se le ofrecen filtros de lo que Marketing todavía trabaja.
  const etapasVisibles = etapasQueVe(session.role);
  const visibles = new Set(etapasVisibles);
  const columnas: ColumnaDeProspectos[] = ETAPAS_ABIERTAS.flatMap((etapa) => (visibles.has(etapa) ? [{ etapa, prospectos: filas.filter((f) => f.etapa === etapa) }] : []));

  const hayFiltros = filtros.etapas.length + filtros.canales.length + filtros.campanas.length + filtros.vendedores.length > 0 || filtros.desde !== null || filtros.hasta !== null || filtros.q !== "" || filtros.mios;
  const vendedoresPorPais: Record<string, { id: string; name: string }[]> = { [pais]: vendedores };

  const alta = gestiona ? (
    <NuevoProspecto
      paises={session.countryCodes.length > 0 ? session.countryCodes : [pais]}
      paisInicial={pais}
      catalogos={{ canales: catalogos.canales, campanas: catalogos.campanas, vendedores }}
      accion={crearProspectoAccion}
    />
  ) : null;
  // Exportar baja lo que se ve: los mismos filtros, por la misma URL.
  const hrefExportar = hrefDeProspectos(filtros).replace("/prospectos", "/prospectos/exportar");
  const herramientas = (
    <div className="flex items-center gap-2">
      {alta}
      {gestiona && <ImportarProspectos previsualizar={previsualizarImportacionAccion} importar={importarProspectosAccion} />}
      {todos.length > 0 && (
        <Boton href={hrefExportar} variante="secundario">
          Exportar
        </Boton>
      )}
    </div>
  );

  // Dos vacíos (§46): sin nada al alcance, la salida es dar de alta; con filtros
  // que dejaron fuera todo, limpiarlos.
  const vacio =
    todos.length === 0 ? (
      <EstadoVacio
        titulo={`Sin prospectos en ${NOMBRE_PAIS[pais]}`}
        explicacion={gestiona ? "Da de alta el primero o importa un archivo cuando lo tengas." : "Cuando Marketing te asigne alguno, aparecerá aquí."}
        accion={alta ?? <span className="text-sm text-texto-tenue">Nada que hacer aquí.</span>}
      />
    ) : (
      <EstadoVacio
        titulo="No hay prospectos con estos filtros"
        explicacion="El filtro dejó fuera todo lo que puedes ver."
        accion={
          <Boton href={hrefDeProspectos({ ...filtros, etapas: [], canales: [], campanas: [], vendedores: [], desde: null, hasta: null, q: "", mios: false }, { vista })} variante="secundario">
            Limpiar filtros
          </Boton>
        }
      />
    );

  const hrefVista = (v: string) => hrefDeProspectos(filtros, { ...conservar, vista: v });
  const hrefAlcance = (a: string) => hrefDeProspectos({ ...filtros, mios: a === "mios" }, conservar);
  const puedeVerDeOtros = session.role !== "VENDEDOR";

  return (
    <>
      <BarraSuperior
        titulo={`Prospectos · ${NOMBRE_PAIS[pais]}`}
        subtitulo={`${indicadores.abiertos} abiertos · ${convertidos} convertidos${indicadores.tasaDeConversion === null ? "" : ` (${Math.round(indicadores.tasaDeConversion * 100)} %)`}`}
        usuario={{ nombre: session.name, correo: session.email, iniciales: iniciales(session.name), rol: session.role, paises: session.countryCodes }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <BarraDeHerramientas
          id="filtros-de-prospectos"
          vistas={
            <>
              <ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={hrefVista} />
              {puedeVerDeOtros && <ControlSegmentado opciones={ALCANCE} activa={filtros.mios ? "mios" : "todos"} hrefDe={hrefAlcance} />}
            </>
          }
          filtros={
            <FiltrosDeProspectos
              activos={filtros}
              conservar={conservar}
              catalogos={{
                etapas: etapasVisibles.map((e) => ({ valor: e, etiqueta: ETIQUETA_DE_ETAPA[e] })),
                canales: catalogos.canales.map((c) => ({ valor: c.id, etiqueta: c.name })),
                campanas: catalogos.campanas.map((c) => ({ valor: c.id, etiqueta: c.name })),
                vendedores: puedeVerDeOtros ? vendedores.map((v) => ({ valor: v.id, etiqueta: v.name })) : [],
              }}
            />
          }
          alta={herramientas}
          hayFiltrosActivos={hayFiltros}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BuscadorDeProspectos key={filtros.q} activos={filtros} conservar={conservar} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile denso etiqueta="Prospectos abiertos" valor={String(indicadores.abiertos)} />
          <StatTile denso etiqueta="Sin asignar" valor={String(indicadores.sinAsignar)} tono={indicadores.sinAsignar > 0 ? "alerta" : "neutro"} />
          <StatTile denso etiqueta="Sin seguimiento" valor={String(indicadores.sinSeguimiento)} tono={indicadores.sinSeguimiento > 0 ? "alerta" : "neutro"} />
          <StatTile denso etiqueta="SLA 1er contacto vencido" valor={String(indicadores.slaVencido)} tono={indicadores.slaVencido > 0 ? "peligro" : "neutro"} />
          <StatTile denso etiqueta="Tasa de conversión" valor={indicadores.tasaDeConversion === null ? "—" : `${Math.round(indicadores.tasaDeConversion * 100)} %`} tono="acento" />
        </div>

        <div className="mt-6">
          <div className="min-w-0">
            {vista === "kanban" ? (
              <KanbanDeProspectos columnas={columnas} puedeMover={gestiona || session.role === "VENDEDOR" || session.role === "GERENTE_PAIS"} accion={cambiarEtapaDeProspectoAccion} vacio={vacio} />
            ) : (
              <TablaDeProspectos
                filas={filas}
                vendedoresPorPais={vendedoresPorPais}
                motivos={catalogos.motivosDeDescarte}
                acciones={{ asignar: asignarProspectosAccion, descartar: descartarProspectoAccion }}
                vacio={vacio}
              />
            )}
          </div>

          {detalle && (
            <PanelDeDetalle
              detalle={detalle}
              datos={datosDelDetalle!}
              pestana={pestana}
              hrefDePestana={(t) => hrefDeProspectos(filtros, { ...conservar, t })}
              hrefCerrar={hrefDeProspectos(filtros, { vista })}
              zona={zona}
              zonaEtiqueta={ciudadDe(zona)}
              reloj={reloj}
              auditoria={auditoria}
              vendedores={vendedores}
              motivos={catalogos.motivosDeDescarte}
              catalogos={{ canales: catalogos.canales, campanas: catalogos.campanas }}
              tipos={tipos}
              destinatarios={destinatarios.map((u) => ({ id: u.id, name: u.name }))}
              session={{ userId: session.userId, gestiona: gestionaProspecto(session, detalle), decide: decideComoVentas(session, detalle) }}
              pipelines={pipelinesParaAlta(pipelines.filter((p) => p.countryCode === detalle.countryCode))}
              puedeElegirPropietario={can(session, "VER_OPORTUNIDADES_OFICINA")}
              abrirConvertir={url.get("accion") === "convertir"}
              conversion={coincidencias && catalogosDeAlta ? { coincidencias, rolesDeComite: catalogosDeAlta.rolesComite } : null}
            />
          )}
        </div>
      </div>
    </>
  );
}

/** Arma lo que el panel lateral necesita a partir del detalle acotado. */
function PanelDeDetalle({
  detalle,
  datos,
  pestana,
  hrefDePestana,
  hrefCerrar,
  zona,
  zonaEtiqueta,
  reloj,
  auditoria,
  vendedores,
  motivos,
  catalogos,
  tipos,
  destinatarios,
  session,
  pipelines,
  puedeElegirPropietario,
  abrirConvertir,
  conversion,
}: {
  detalle: LeadDetail;
  datos: DatosDeProspecto;
  pestana: PestanaDeDetalle;
  hrefDePestana: (t: PestanaDeDetalle) => string;
  hrefCerrar: string;
  zona: string;
  zonaEtiqueta: string;
  reloj: ReturnType<typeof relojDeAgenda>;
  auditoria: Awaited<ReturnType<typeof auditoriaDeProspecto>>;
  vendedores: { id: string; name: string }[];
  motivos: { id: string; name: string }[];
  catalogos: { canales: { id: string; name: string }[]; campanas: { id: string; name: string }[] };
  tipos: { id: string; name: string }[];
  destinatarios: { id: string; name: string }[];
  session: { userId: string; gestiona: boolean; decide: boolean };
  pipelines: ReturnType<typeof pipelinesParaAlta>;
  puedeElegirPropietario: boolean;
  abrirConvertir: boolean;
  /** Lo que el panel de convertir necesita para arrancar; `null` si esta sesión no convierte. */
  conversion: { coincidencias: CoincidenciasDeConversion; rolesDeComite: { id: string; name: string }[] } | null;
}) {
  const actor = { gestiona: session.gestiona, esAsignado: detalle.assignedToId === session.userId };
  const etapasPosibles = ETAPAS_DE_PROSPECTO.filter((e) => puedeTransitar(detalle.stage, e, actor, detalle.assignedToId !== null).ok);

  const historia = historiaDe(detalle, auditoria, vendedores);

  const puedeActividades = (session.gestiona || session.decide) && !esTerminal(detalle.stage);

  return (
    <PopupDeProspecto titulo={detalle.contactName} subtitulo={`${detalle.companyName} · ${detalle.folio}`} hrefCerrar={hrefCerrar}>
    <DetalleDeProspecto
      datos={datos}
      detalle={{
        cargo: detalle.jobTitle,
        giro: detalle.companyIndustry,
        notas: detalle.notes,
        captadoPor: detalle.createdBy.name,
        etapa: detalle.stage as LeadStage,
        countryCode: detalle.countryCode as CountryCode,
        convertido: detalle.opportunity ? { opportunityId: detalle.opportunity.id, folio: detalle.opportunity.folio, nombre: detalle.opportunity.name } : null,
        motivoDeDescarte: detalle.discardReason?.name ?? null,
      }}
      pestana={pestana}
      hrefDePestana={hrefDePestana}
      zona={zona}
      reloj={reloj}
      actividades={detalle.activities}
      historia={historia}
      etapasPosibles={etapasPosibles}
      vendedores={vendedores}
      motivos={motivos}
      composer={puedeActividades ? { tipos, usuarios: destinatarios, usuarioActual: session.userId, zonaEtiqueta, accion: guardarActividadDeProspectoAccion } : null}
      convertir={
        datos.puede.convertir && conversion ? (
          <ConvertirProspecto
            leadId={detalle.id}
            nombreSugerido={`${detalle.companyName} · ${detalle.jobTitle ?? detalle.channel.name}`}
            prellenado={{ companyName: detalle.companyName, companyIndustry: detalle.companyIndustry, contactName: detalle.contactName, jobTitle: detalle.jobTitle, email: detalle.email, phone: detalle.phone }}
            coincidencias={conversion.coincidencias}
            rolesDeComite={conversion.rolesDeComite}
            buscarOrganizaciones={buscarOrganizacionesAccion}
            cargarPersonas={personasDeOrganizacionAccion}
            pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.stages.map((e) => ({ id: e.id, name: e.name, position: e.position, requisitos: e.requisitos })) }))}
            propietarios={destinatarios}
            propietarioInicial={detalle.assignedToId ?? session.userId}
            puedeElegirPropietario={puedeElegirPropietario}
            abiertoInicial={abrirConvertir}
            accion={convertirProspectoAccion}
          />
        ) : null
      }
      editar={
        session.gestiona && !esTerminal(detalle.stage) ? (
          <EditarProspecto
            prospecto={{
              id: detalle.id,
              contactName: detalle.contactName,
              jobTitle: detalle.jobTitle,
              email: detalle.email,
              phone: detalle.phone,
              companyName: detalle.companyName,
              companyIndustry: detalle.companyIndustry,
              channelId: detalle.channel.id,
              campaignId: detalle.campaign?.id ?? null,
              score: detalle.score,
              notes: detalle.notes,
            }}
            catalogos={catalogos}
            accion={editarProspectoAccion}
          />
        ) : null
      }
      acciones={{ asignar: asignarProspectosAccion, descartar: descartarProspectoAccion, cambiarEtapa: cambiarEtapaDeProspectoAccion }}
    />
    </PopupDeProspecto>
  );
}
