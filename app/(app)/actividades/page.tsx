import Link from "next/link";
import { oficinaActiva, requireSession } from "@/lib/auth/session";
import { agendaSemanal, bandejaDeTrabajo } from "@/lib/scope/agenda";
import { getCountry } from "@/lib/policy";
import { formatUSD } from "@/lib/money";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import {
  Avatar,
  Boton,
  ControlSegmentado,
  EstadoVacio,
  Pastilla,
  StatTile,
} from "@/components/ui/primitivas";

/**
 * P-07 · Actividades.
 *
 * «Agenda semanal por día y hora, más la bandeja de trabajo en tres grupos:
 * vencidas, hoy, y oportunidades sin próxima actividad.»
 *
 * §12.4 lo llama **el flujo que decide la adopción**. Si un vendedor no abre
 * esta pantalla cada mañana, no abre el CRM, y entonces nada más importa.
 *
 * ## Las tres listas piden acciones distintas
 *
 * **Vencidas** es deuda: algo se prometió y no se hizo. **Hoy** es el plan del
 * día. **Sin próxima actividad** no es una actividad en absoluto — es una
 * oportunidad abandonada, y es la única que no aparece en ninguna agenda
 * porque justamente no hay nada agendado. Mezclarlas daría una lista larga que
 * nadie termina.
 *
 * ## Lo que falta y por qué
 *
 * Registrar una actividad **y su siguiente paso en el mismo formulario** es la
 * mitad del flujo de §12.4, y es una mutación: Server Action con validación de
 * dominio. Llega con el resto de las acciones de E1. Lo que ya está es la
 * lectura, que es lo que ordena el día.
 */
const VISTAS = [
  { valor: "bandeja", etiqueta: "Bandeja" },
  { valor: "semana", etiqueta: "Semana" },
] as const;

export default async function ActividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Independientes: `requireSession` es un viaje a la base (docs/latencia.md).
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const vista = sp.vista === "semana" ? "semana" : "bandeja";

  // La oficina activa de la barra superior: la bandeja y la semana cuentan lo
  // mismo que el contador de Actividades del menú.
  const pais = await oficinaActiva(session);
  const ahora = new Date();

  // Las horas se leen en la zona de la oficina: «hoy» y «las 10:30» son los de
  // esa ciudad, igual que al capturarlas. Un viaje más a la base, antes de las
  // lecturas que dependen de él.
  const codigoDeZona = pais ?? session.countryCodes[0];
  const zona = codigoDeZona ? (await getCountry(codigoDeZona)).timezone : "UTC";
  const f = formatos(zona);

  const [bandeja, semana] = await Promise.all([
    bandejaDeTrabajo(session, ahora, pais, zona),
    agendaSemanal(session, ahora, pais, zona),
  ]);

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
        <div className="flex flex-wrap items-center gap-3">
          <ControlSegmentado
            opciones={VISTAS}
            activa={vista}
            hrefDe={(v) => `/actividades?vista=${v}`}
          />
          <div className="ml-auto">
            <Boton href="/actividades/nueva">+ Registrar actividad</Boton>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <StatTile denso
            etiqueta="Vencidas"
            valor={String(bandeja.vencidas.length)}
            subtexto="se prometieron y no se hicieron"
            tono={bandeja.vencidas.length > 0 ? "peligro" : "neutro"}
          />
          <StatTile denso
            etiqueta="Hoy"
            valor={String(bandeja.hoy.length)}
            subtexto="el plan del día"
            tono="acento"
          />
          <StatTile denso
            etiqueta="Sin próximo paso"
            valor={String(bandeja.sinProxima.length)}
            subtexto="oportunidades abiertas sin agenda"
            tono={bandeja.sinProxima.length > 0 ? "peligro" : "neutro"}
          />
        </div>

        <div className="mt-6">
          {vista === "semana" ? (
            <VistaSemana semana={semana} f={f} />
          ) : (
            <VistaBandeja bandeja={bandeja} f={f} />
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────── Bandeja

function VistaBandeja({
  bandeja,
  f,
}: {
  bandeja: Awaited<ReturnType<typeof bandejaDeTrabajo>>;
  f: Formatos;
}) {
  const todoResuelto =
    bandeja.vencidas.length === 0 &&
    bandeja.hoy.length === 0 &&
    bandeja.sinProxima.length === 0;

  if (todoResuelto) {
    return (
      <EstadoVacio
        titulo="La bandeja está limpia"
        explicacion="No hay actividades vencidas ni pendientes de hoy, y todas tus oportunidades abiertas tienen un próximo paso agendado."
        accion={
          <Boton href="/oportunidades" variante="secundario">
            Ir al pipeline
          </Boton>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <Grupo
        titulo="Vencidas"
        explicacion="Se agendaron y ya pasó su fecha. Resolver o reprogramar."
        cantidad={bandeja.vencidas.length}
        tono="peligro"
        vacio="Sin actividades vencidas."
      >
        {bandeja.vencidas.map((a) => (
          <FilaActividad key={a.id} a={a} f={f} vencida />
        ))}
      </Grupo>

      <Grupo
        titulo="Hoy"
        explicacion="El plan del día."
        cantidad={bandeja.hoy.length}
        tono="acento"
        vacio="Nada agendado para hoy."
      >
        {bandeja.hoy.map((a) => (
          <FilaActividad key={a.id} a={a} f={f} />
        ))}
      </Grupo>

      <Grupo
        titulo="Oportunidades sin próximo paso"
        explicacion="Están abiertas y no tienen nada agendado. Sin próxima actividad, el negocio depende de que alguien se acuerde (RN-10)."
        cantidad={bandeja.sinProxima.length}
        tono="peligro"
        vacio="Todas tus oportunidades abiertas tienen un próximo paso."
      >
        {bandeja.sinProxima.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-3 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/oportunidades/${o.id}`}
                className="text-sm font-medium text-texto-titulo hover:text-acento"
              >
                {o.name}
              </Link>
              <p className="truncate text-xs text-texto-tenue">
                {o.organization.name} · {o.stage.name}
                {o.lastActivityAt
                  ? ` · última actividad ${f.fecha.format(o.lastActivityAt)}`
                  : " · sin actividad registrada"}
              </p>
            </div>
            <span className="tabular hidden w-32 shrink-0 text-right text-sm font-medium sm:block">
              {formatUSD(o.amount)}
            </span>
            <Avatar iniciales={o.owner.initials} titulo={o.owner.name} />
            <Boton href={`/oportunidades/${o.id}`} variante="secundario">
              Agendar
            </Boton>
          </li>
        ))}
      </Grupo>
    </div>
  );
}

function Grupo({
  titulo,
  explicacion,
  cantidad,
  tono,
  vacio,
  children,
}: {
  titulo: string;
  explicacion: string;
  cantidad: number;
  tono: "acento" | "peligro";
  vacio: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>
        {cantidad > 0 && <Pastilla tono={tono}>{cantidad}</Pastilla>}
      </div>
      <p className="mt-0.5 text-xs text-texto-tenue">{explicacion}</p>

      {cantidad === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-borde px-4 py-5 text-center text-sm text-texto-tenue">
          {vacio}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">{children}</ul>
      )}
    </section>
  );
}

function FilaActividad({
  a,
  f,
  vencida = false,
}: {
  a: Awaited<ReturnType<typeof bandejaDeTrabajo>>["hoy"][number];
  f: Formatos;
  vencida?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3">
      <span className="tabular w-24 shrink-0 text-xs text-texto-tenue">
        {vencida ? f.fecha.format(a.startsAt) : f.hora.format(a.startsAt)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-texto-titulo">{a.subject}</p>
        <p className="truncate text-xs text-texto-tenue">
          {a.type.name}
          {a.opportunity && (
            <>
              {" · "}
              <Link
                href={`/oportunidades/${a.opportunity.id}`}
                className="text-acento hover:underline"
              >
                {a.opportunity.name}
              </Link>
            </>
          )}
        </p>
      </div>
      {vencida && <Pastilla tono="peligro">Vencida</Pastilla>}
      <Avatar iniciales={a.user.initials} titulo={a.user.name} />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────── Semana

function VistaSemana({
  semana,
  f,
}: {
  semana: Awaited<ReturnType<typeof agendaSemanal>>;
  f: Formatos;
}) {
  if (semana.total === 0) {
    return (
      <EstadoVacio
        titulo="Semana sin actividades"
        explicacion="No hay nada registrado ni agendado entre el lunes y el domingo de esta semana."
        accion={<Boton href="/actividades/nueva">Registrar actividad</Boton>}
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {semana.dias.map((d) => (
        <section
          key={d.fecha.toISOString()}
          className={`rounded-md border p-3 ${
            d.esHoy ? "border-acento bg-superficie-tinte" : "border-borde bg-superficie-tarjeta"
          }`}
        >
          <p className={`eyebrow ${d.esHoy ? "text-acento" : ""}`}>
            {f.diaSemana.format(d.fecha)}
          </p>
          <p className="tabular text-sm font-semibold text-texto-titulo">
            {d.dia}
          </p>

          <ul className="mt-3 space-y-2">
            {d.actividades.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="tabular text-texto-tenue">{f.hora.format(a.startsAt)}</span>
                <p
                  className={
                    a.completedAt
                      ? "text-texto-tenue line-through"
                      : "font-medium text-texto-cuerpo"
                  }
                >
                  {a.subject}
                </p>
                {a.opportunity && (
                  <Link
                    href={`/oportunidades/${a.opportunity.id}`}
                    className="block truncate text-texto-tenue hover:text-acento"
                  >
                    {a.opportunity.folio}
                  </Link>
                )}
              </li>
            ))}
            {d.actividades.length === 0 && (
              <li className="py-3 text-center text-xs text-texto-tenue">—</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Los formatos de la pantalla, en la zona de la oficina. Antes eran constantes
 * en UTC, y en Vercel eso corría seis horas cada actividad mexicana.
 */
function formatos(zona: string) {
  return {
    fecha: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: zona }),
    hora: new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: zona,
    }),
    diaSemana: new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: zona }),
  };
}

type Formatos = ReturnType<typeof formatos>;
