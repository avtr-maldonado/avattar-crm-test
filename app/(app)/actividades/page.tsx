import type { CountryCode } from "@/lib/dto";
import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { agendaSemanal, bandejaDeTrabajo, oportunidadesParaAgendar, tableroDeActividades } from "@/lib/scope/agenda";
import { tiposDeActividad } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import {
  ETIQUETA_DE_ESTADO_DE_AGENDA,
  filtrarAgenda,
  ORDEN_DE_ESTADOS,
  semanaElegida,
  type EstadoDeAgenda,
  type FiltrosDeAgenda,
  type RelojDeAgenda,
} from "@/lib/domain/agenda";
import { parseLapso, rangoDeLapso, type Lapso } from "@/lib/filters/lapso";
import { trimestreDe } from "@/lib/filters";
import { getCountry } from "@/lib/policy";
import { ciudadDe, fechaEn, lunesDe } from "@/lib/tiempo";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { BarraDeHerramientas } from "@/components/ui/BarraDeHerramientas";
import { ControlSegmentado, StatTile } from "@/components/ui/primitivas";
import type { OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";
import {
  ComposerDeActividad,
  type ActividadEditable,
  type ContextoDeOportunidad,
  type TipoDeActividad,
} from "@/components/oportunidad/ComposerDeActividad";
import { formatos, type ActividadDeTablero } from "@/components/actividades/formato";
import { FiltrosDeActividades } from "@/components/actividades/FiltrosDeActividades";
import { VistaLista } from "@/components/actividades/VistaLista";
import { VistaKanban } from "@/components/actividades/VistaKanban";
import { VistaSemana } from "@/components/actividades/VistaSemana";
import { NavegacionDeSemana } from "@/components/actividades/NavegacionDeSemana";
import { guardarActividadAccion } from "@/app/(app)/oportunidades/[id]/acciones";

/**
 * P-07 · Actividades.
 *
 * §12.4 lo llama **el flujo que decide la adopción**. Si un vendedor no abre
 * esta pantalla cada mañana, no abre el CRM, y entonces nada más importa.
 *
 * ## Tres vistas sobre los mismos datos (decisiones §42)
 *
 * **Lista**: una fila por actividad, condensada, con su estado; debajo, las
 * oportunidades sin próximo paso (RN-10). **Kanban**: cuatro columnas por
 * estado, calculado y no capturado (INV-11): por realizar, en progreso,
 * realizadas y vencidas. **Semana**: lunes a domingo con bloques por hora,
 * verde lo hecho y coral lo vencido; se navega con flechas y la semana que se
 * ve también vive en la URL (`semana=YYYY-MM-DD`, decisiones §44). La vista
 * vive en la URL (INV-10).
 *
 * ## Los filtros (decisiones §55)
 *
 * Estado, tipo, oportunidad y lapso, todos en la URL. El lapso cambia **qué se
 * lee**: sin él, lo pendiente de cualquier fecha más lo hecho en dos semanas;
 * con él, lo que empieza dentro del rango. Los otros tres recortan en memoria
 * después del alcance, como la bandera de riesgo del pipeline: el estado se
 * calcula y no hay columna que consultar. En la vista semanal no hay lapso:
 * la semana ya lo es. Los indicadores de arriba siguen a tipo y oportunidad.
 *
 * ## Se edita aquí y, desde §55, también se da de alta
 *
 * Cada fila trae el mismo lápiz que la pestaña Actividades del detalle: abre
 * `ComposerDeActividad` cargado y guarda con la misma acción, en la zona del
 * país de la oportunidad y con sus responsables (decisiones §20). «Nueva
 * actividad» abre el mismo composer con un campo más: la oportunidad, elegida
 * entre las abiertas al alcance y la oficina activa; de ella salen la zona y
 * los responsables.
 */
const VISTAS = [
  { valor: "lista", etiqueta: "Lista" },
  { valor: "kanban", etiqueta: "Kanban" },
  { valor: "semana", etiqueta: "Semana" },
] as const;

type Vista = (typeof VISTAS)[number]["valor"];

/** Las dos pastillas de responsable. Los indicadores de arriba siguen al filtro. */
const RESPONSABLE = [
  { valor: "todas" as const, etiqueta: "Todas" },
  { valor: "mias" as const, etiqueta: "Solo mías" },
];

/** Lo que el lapso escribe en la URL (§45): con cualquiera de ellos hay lapso aplicado. */
const PARAMETROS_DE_LAPSO = ["anio", "q", "mes", "desde", "hasta"] as const;

export default async function ActividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Independientes: `requireSession` es un viaje a la base (docs/latencia.md).
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const vista: Vista = sp.vista === "kanban" ? "kanban" : sp.vista === "semana" ? "semana" : "lista";
  // Quién es responsable · §52. El alcance ya trae las actividades de las
  // oportunidades propias aunque las lleve otro; esto recorta a lo que a uno le
  // toca hacer. Vive en la URL como todo filtro (INV-10).
  const soloMias = sp.mias === "1";

  // La oficina activa de la barra superior: las tres vistas cuentan lo mismo
  // que el contador de Actividades del menú.
  const pais = await oficinaActiva(session);
  const ahora = new Date();

  // Las horas se leen en la zona de la oficina: «hoy» y «las 10:30» son los de
  // esa ciudad, igual que al capturarlas. Un viaje más a la base, antes de las
  // lecturas que dependen de él. El mismo país da el calendario fiscal del lapso.
  const codigoDeZona = pais ?? session.countryCodes[0];
  const configuracion = codigoDeZona ? await getCountry(codigoDeZona) : null;
  const zona = configuracion?.timezone ?? "UTC";
  const inicioFiscal = configuracion?.fiscalYearStartMonth ?? 1;
  const f = formatos(zona);

  // La semana que se ve: la de la URL, normalizada a su lunes, o la de hoy (§44).
  const lunesDeHoy = lunesDe(fechaEn(ahora, zona));
  const lunes = semanaElegida(sp.semana, fechaEn(ahora, zona));

  // ── Los filtros de la URL (§55) ──
  const url = parametrosDe(sp);
  const enCurso = trimestreDe(ahora, inicioFiscal);
  const hayLapso = PARAMETROS_DE_LAPSO.some((k) => url.has(k));
  const lapso: Lapso | null = hayLapso && vista !== "semana" ? parseLapso(url, enCurso.fiscalYear) : null;
  const rangoDelLapso = lapso ? rangoDeLapso(lapso, inicioFiscal) : null;
  const filtros: FiltrosDeAgenda = {
    estados: url.getAll("estado").filter((e): e is EstadoDeAgenda => (ORDEN_DE_ESTADOS as readonly string[]).includes(e)),
    tipos: url.getAll("tipo"),
    oportunidades: url.getAll("op"),
  };

  // Solo se lee lo que la vista va a pintar; la bandeja siempre, por los indicadores.
  const [bandeja, semana, tablero, tipos, contextos, paraAgendar] = await Promise.all([
    bandejaDeTrabajo(session, ahora, pais, zona, soloMias),
    vista === "semana" ? agendaSemanal(session, ahora, pais, zona, lunes, soloMias) : null,
    vista !== "semana"
      ? tableroDeActividades(
          session,
          ahora,
          pais,
          zona,
          soloMias,
          rangoDelLapso ? { desde: rangoDelLapso.from, hasta: rangoDelLapso.to } : undefined,
        )
      : null,
    tiposDeActividad(),
    contextosPorPais(session.countryCodes),
    // Las abiertas al alcance y en la oficina: lo que «Nueva actividad» ofrece.
    oportunidadesParaAgendar(session, pais),
  ]);

  const edicion: Edicion = { tipos, contextos, usuarioActual: session.userId };
  const reloj: RelojDeAgenda = { ahora, inicioDeHoy: bandeja.inicioDeHoy };
  const editorDe = (a: ActividadDeTablero) => <EditorDeActividad a={a} edicion={edicion} />;

  // Los tres recortes en memoria, después del alcance. El estado no aplica a
  // los indicadores: cada uno ya es un estado.
  const sinEstado: FiltrosDeAgenda = { ...filtros, estados: [] };
  const vencidas = filtrarAgenda(bandeja.vencidas, sinEstado, reloj);
  const hoy = filtrarAgenda(bandeja.hoy, sinEstado, reloj);
  const porOportunidad = new Set(filtros.oportunidades);
  const sinProxima = porOportunidad.size > 0 ? bandeja.sinProxima.filter((o) => porOportunidad.has(o.id)) : bandeja.sinProxima;
  const actividadesDelTablero = tablero ? filtrarAgenda(tablero.actividades, filtros, reloj) : null;
  const diasDeLaSemana = semana ? semana.dias.map((d) => ({ ...d, actividades: filtrarAgenda(d.actividades, filtros, reloj) })) : null;

  const pendientes = vencidas.length + hoy.length;

  // Las opciones del filtro de oportunidad salen de lo que se está viendo, antes
  // de los recortes en memoria: lo que no aparece no se puede filtrar.
  const vistas = tablero?.actividades ?? semana?.dias.flatMap((d) => d.actividades) ?? [];
  const oportunidadesVisibles: OpcionDeFiltro[] = [
    ...new Map(vistas.flatMap((a) => (a.opportunity ? [[a.opportunity.id, a.opportunity] as const] : []))).values(),
  ]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((o) => ({ valor: o.id, etiqueta: `${o.folio} · ${o.name}` }));

  /** Un enlace que conserva los filtros y lo que ya estaba puesto; sin `mias`, el reposo. */
  const conFiltro = ({ vista: v, mias, semana: s }: { vista: Vista; mias: boolean; semana?: string }) => {
    const p = new URLSearchParams({ vista: v });
    if (mias) p.set("mias", "1");
    const semanaElegidaEnUrl = s ?? (typeof sp.semana === "string" ? sp.semana : undefined);
    if (v === "semana" && semanaElegidaEnUrl) p.set("semana", semanaElegidaEnUrl);
    for (const clave of ["estado", "tipo", "op"]) for (const valor of url.getAll(clave)) p.append(clave, valor);
    // El lapso no vive en la semana: al pasar a ella se suelta, y al volver no está.
    if (v !== "semana") for (const clave of PARAMETROS_DE_LAPSO) if (url.has(clave)) p.set(clave, url.get(clave)!);
    return `/actividades?${p.toString()}`;
  };

  const contextoDeOficina = codigoDeZona ? contextos.get(codigoDeZona) : undefined;
  const nueva =
    paraAgendar.length > 0 && contextoDeOficina ? (
      <ComposerDeActividad
        tipos={tipos}
        usuarios={contextoDeOficina.usuarios}
        usuarioActual={session.userId}
        zona={contextoDeOficina.zona}
        zonaEtiqueta={contextoDeOficina.zonaEtiqueta}
        oportunidades={paraAgendar.map((o) => ({
          id: o.id,
          folio: o.folio,
          name: o.name,
          organizacion: o.organization.name,
          countryCode: o.countryCode,
        }))}
        contextos={Object.fromEntries(contextos)}
        accion={guardarActividadAccion}
      />
    ) : null;

  return (
    <>
      <BarraSuperior
        titulo="Actividades"
        subtitulo={
          pendientes === 0 && sinProxima.length === 0
            ? "Nada pendiente para hoy"
            : `${pendientes} por resolver · ${sinProxima.length} oportunidades sin próximo paso`
        }
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* La misma barra que el pipeline (§57): arriba la vista y el responsable
            —las dos son recortes de lo mismo y las dos viven en la URL—, el botón
            de filtros y el alta; abajo los filtros, cerrados al entrar, con un
            punto en el botón si hay alguno aplicado. `conFiltro` conserva la
            semana y los filtros, para no devolver a quien navegaba al reposo
            (§44, §55). */}
        <BarraDeHerramientas
          id="filtros-de-actividades"
          vistas={
            <>
              <ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={(v) => conFiltro({ vista: v, mias: soloMias })} />
              <ControlSegmentado
                opciones={RESPONSABLE}
                activa={soloMias ? "mias" : "todas"}
                hrefDe={(q) => conFiltro({ vista, mias: q === "mias" })}
              />
            </>
          }
          filtros={
            <FiltrosDeActividades
              activos={{ estado: [...filtros.estados], tipo: [...filtros.tipos], oportunidad: [...filtros.oportunidades], lapso }}
              catalogos={{
                estados: ORDEN_DE_ESTADOS.map((e) => ({ valor: e, etiqueta: ETIQUETA_DE_ESTADO_DE_AGENDA[e] })),
                tipos: tipos.map((t) => ({ valor: t.id, etiqueta: t.name })),
                oportunidades: oportunidadesVisibles,
                anios: [enCurso.fiscalYear - 1, enCurso.fiscalYear, enCurso.fiscalYear + 1],
              }}
              conLapso={vista !== "semana"}
            />
          }
          alta={nueva}
          hayFiltrosActivos={filtros.estados.length + filtros.tipos.length + filtros.oportunidades.length > 0 || lapso !== null}
        />

        <div className="mt-5 grid grid-cols-3 gap-4">
          <StatTile
            denso
            etiqueta="Vencidas"
            valor={String(vencidas.length)}
            subtexto="se prometieron y no se hicieron"
            tono={vencidas.length > 0 ? "peligro" : "neutro"}
          />
          <StatTile denso etiqueta="Hoy" valor={String(hoy.length)} subtexto="el plan del día" tono="acento" />
          <StatTile
            denso
            etiqueta="Sin próximo paso"
            valor={String(sinProxima.length)}
            subtexto="oportunidades abiertas sin agenda"
            tono={sinProxima.length > 0 ? "peligro" : "neutro"}
          />
        </div>

        <div className="mt-6">
          {vista === "semana" && semana && diasDeLaSemana ? (
            <>
              <div className="mb-4">
                <NavegacionDeSemana
                  lunes={lunes}
                  lunesDeHoy={lunesDeHoy}
                  hrefDe={(l) => conFiltro({ vista: "semana", mias: soloMias, semana: l })}
                />
              </div>
              <VistaSemana dias={diasDeLaSemana} total={semana.total} reloj={reloj} f={f} editorDe={editorDe} />
            </>
          ) : vista === "kanban" && actividadesDelTablero ? (
            <VistaKanban actividades={actividadesDelTablero} reloj={reloj} f={f} editorDe={editorDe} />
          ) : actividadesDelTablero ? (
            <VistaLista actividades={actividadesDelTablero} sinProxima={sinProxima} reloj={reloj} f={f} editorDe={editorDe} />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Los parámetros de la ruta como `URLSearchParams`, que es lo que lee `parseLapso`. */
function parametrosDe(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp)) {
    if (Array.isArray(valor)) for (const v of valor) p.append(clave, v);
    else if (valor !== undefined) p.set(clave, valor);
  }
  return p;
}

// ───────────────────────────────────────────────────── Edición en el sitio

/** Lo que el lápiz necesita y no cambia de fila en fila. */
type Edicion = {
  tipos: TipoDeActividad[];
  contextos: Map<CountryCode, ContextoDeOportunidad>;
  usuarioActual: string;
};

/**
 * La zona y los responsables de cada país del alcance, una sola vez.
 *
 * Una actividad se edita en la zona del país de **su** oportunidad, no en la de
 * la oficina activa (decisiones §20); la bandeja de Dirección mezcla países.
 * Es lo mismo que la actividad nueva necesita al elegir oportunidad (§55).
 */
async function contextosPorPais(paises: CountryCode[]): Promise<Map<CountryCode, ContextoDeOportunidad>> {
  const entradas = await Promise.all(
    paises.map(async (codigo) => {
      const [pais, usuarios] = await Promise.all([getCountry(codigo), destinatariosValidos(codigo)]);
      return [
        codigo,
        {
          zona: pais.timezone,
          zonaEtiqueta: ciudadDe(pais.timezone),
          usuarios: usuarios.map((u) => ({ id: u.id, name: u.name })),
        },
      ] as const;
    }),
  );
  return new Map(entradas);
}

/**
 * El lápiz de una fila. Solo para actividades ligadas a una oportunidad: la
 * acción autoriza cargando la oportunidad por `lib/scope`, y una actividad
 * suelta no tiene por dónde entrar. Es la misma limitación del detalle.
 */
function EditorDeActividad({ a, edicion }: { a: ActividadDeTablero; edicion: Edicion }) {
  // Sin oportunidad al alcance no hay lápiz: la acción autoriza cargando la
  // oportunidad por `lib/scope` y la rechazaría (§46).
  if (!a.opportunity?.accesible) return null;
  const contexto = edicion.contextos.get(a.opportunity.countryCode);
  if (!contexto) return null;

  const actividad: ActividadEditable = {
    id: a.id,
    typeId: a.type.id,
    subject: a.subject,
    notes: a.notes,
    outcome: a.outcome,
    transcript: a.transcript,
    startsAt: a.startsAt.toISOString(),
    durationMin: a.durationMin,
    hecha: a.completedAt != null,
    userId: a.user.id,
    enCalendario: a.externalEventId != null,
  };

  return (
    <ComposerDeActividad
      opportunityId={a.opportunity.id}
      tipos={edicion.tipos}
      usuarios={contexto.usuarios}
      usuarioActual={edicion.usuarioActual}
      zona={contexto.zona}
      zonaEtiqueta={contexto.zonaEtiqueta}
      actividad={actividad}
      accion={guardarActividadAccion}
    />
  );
}
