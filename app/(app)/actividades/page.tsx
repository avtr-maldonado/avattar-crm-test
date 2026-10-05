import type { CountryCode } from "@/lib/dto";
import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { agendaSemanal, bandejaDeTrabajo, tableroDeActividades } from "@/lib/scope/agenda";
import { tiposDeActividad } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { semanaElegida, type RelojDeAgenda } from "@/lib/domain/agenda";
import { getCountry } from "@/lib/policy";
import { ciudadDe, fechaEn, lunesDe } from "@/lib/tiempo";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { ControlSegmentado, StatTile } from "@/components/ui/primitivas";
import {
  ComposerDeActividad,
  type ActividadEditable,
  type TipoDeActividad,
} from "@/components/oportunidad/ComposerDeActividad";
import { formatos, type ActividadDeTablero } from "@/components/actividades/formato";
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
 * Los tres indicadores de arriba son los de la bandeja de §12.4 y cuentan lo
 * mismo que el contador de Actividades del menú: la oficina activa recorta.
 *
 * ## Se edita aquí; se da de alta en la oportunidad
 *
 * Cada fila trae el mismo lápiz que la pestaña Actividades del detalle: abre
 * `ComposerDeActividad` cargado y guarda con la misma acción, en la zona del
 * país de la oportunidad y con sus responsables (decisiones §20). El alta no
 * vive aquí: una actividad nueva es el siguiente paso de **una** oportunidad.
 */
const VISTAS = [
  { valor: "lista", etiqueta: "Lista" },
  { valor: "kanban", etiqueta: "Kanban" },
  { valor: "semana", etiqueta: "Semana" },
] as const;

type Vista = (typeof VISTAS)[number]["valor"];

export default async function ActividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Independientes: `requireSession` es un viaje a la base (docs/latencia.md).
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const vista: Vista = sp.vista === "kanban" ? "kanban" : sp.vista === "semana" ? "semana" : "lista";

  // La oficina activa de la barra superior: las tres vistas cuentan lo mismo
  // que el contador de Actividades del menú.
  const pais = await oficinaActiva(session);
  const ahora = new Date();

  // Las horas se leen en la zona de la oficina: «hoy» y «las 10:30» son los de
  // esa ciudad, igual que al capturarlas. Un viaje más a la base, antes de las
  // lecturas que dependen de él.
  const codigoDeZona = pais ?? session.countryCodes[0];
  const zona = codigoDeZona ? (await getCountry(codigoDeZona)).timezone : "UTC";
  const f = formatos(zona);

  // La semana que se ve: la de la URL, normalizada a su lunes, o la de hoy (§44).
  const lunesDeHoy = lunesDe(fechaEn(ahora, zona));
  const lunes = semanaElegida(sp.semana, fechaEn(ahora, zona));

  // Solo se lee lo que la vista va a pintar; la bandeja siempre, por los indicadores.
  const [bandeja, semana, tablero, tipos, contextos] = await Promise.all([
    bandejaDeTrabajo(session, ahora, pais, zona),
    vista === "semana" ? agendaSemanal(session, ahora, pais, zona, lunes) : null,
    vista !== "semana" ? tableroDeActividades(session, ahora, pais, zona) : null,
    tiposDeActividad(),
    contextosPorPais(session.countryCodes),
  ]);

  const edicion: Edicion = { tipos, contextos, usuarioActual: session.userId };
  const reloj: RelojDeAgenda = { ahora, inicioDeHoy: bandeja.inicioDeHoy };
  const editorDe = (a: ActividadDeTablero) => <EditorDeActividad a={a} edicion={edicion} />;

  const pendientes = bandeja.vencidas.length + bandeja.hoy.length;

  return (
    <>
      <BarraSuperior
        titulo="Actividades"
        subtitulo={
          pendientes === 0 && bandeja.sinProxima.length === 0
            ? "Nada pendiente para hoy"
            : `${pendientes} por resolver · ${bandeja.sinProxima.length} oportunidades sin próximo paso`
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
        <ControlSegmentado opciones={VISTAS} activa={vista} hrefDe={(v) => `/actividades?vista=${v}`} />

        <div className="mt-5 grid grid-cols-3 gap-4">
          <StatTile
            denso
            etiqueta="Vencidas"
            valor={String(bandeja.vencidas.length)}
            subtexto="se prometieron y no se hicieron"
            tono={bandeja.vencidas.length > 0 ? "peligro" : "neutro"}
          />
          <StatTile denso etiqueta="Hoy" valor={String(bandeja.hoy.length)} subtexto="el plan del día" tono="acento" />
          <StatTile
            denso
            etiqueta="Sin próximo paso"
            valor={String(bandeja.sinProxima.length)}
            subtexto="oportunidades abiertas sin agenda"
            tono={bandeja.sinProxima.length > 0 ? "peligro" : "neutro"}
          />
        </div>

        <div className="mt-6">
          {vista === "semana" && semana ? (
            <>
              <div className="mb-4">
                <NavegacionDeSemana lunes={lunes} lunesDeHoy={lunesDeHoy} hrefDe={(l) => `/actividades?vista=semana&semana=${l}`} />
              </div>
              <VistaSemana dias={semana.dias} total={semana.total} reloj={reloj} f={f} editorDe={editorDe} />
            </>
          ) : vista === "kanban" && tablero ? (
            <VistaKanban actividades={tablero.actividades} reloj={reloj} f={f} editorDe={editorDe} />
          ) : tablero ? (
            <VistaLista actividades={tablero.actividades} sinProxima={bandeja.sinProxima} reloj={reloj} f={f} editorDe={editorDe} />
          ) : null}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────── Edición en el sitio

/** Lo que el lápiz necesita y no cambia de fila en fila. */
type Edicion = {
  tipos: TipoDeActividad[];
  contextos: Map<CountryCode, ContextoDePais>;
  usuarioActual: string;
};

type ContextoDePais = {
  zona: string;
  zonaEtiqueta: string;
  usuarios: { id: string; name: string }[];
};

/**
 * La zona y los responsables de cada país del alcance, una sola vez.
 *
 * Una actividad se edita en la zona del país de **su** oportunidad, no en la de
 * la oficina activa (decisiones §20); la bandeja de Dirección mezcla países.
 */
async function contextosPorPais(paises: CountryCode[]): Promise<Map<CountryCode, ContextoDePais>> {
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
  if (!a.opportunity) return null;
  const contexto = edicion.contextos.get(a.opportunity.countryCode);
  if (!contexto) return null;

  const actividad: ActividadEditable = {
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
