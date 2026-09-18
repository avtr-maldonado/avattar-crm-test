import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { catalogosParaAlta } from "@/lib/scope/configuracion";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import { EditarOrganizacion } from "@/components/contactos/EditarOrganizacion";
import { EditarPersona } from "@/components/contactos/EditarPersona";
import {
  crearPersonaAccion,
  editarOrganizacionAccion,
  editarPersonaAccion,
} from "../../acciones";
import { listActivities } from "@/lib/scope";
import {
  getOrganizationDetail,
  indicadoresDeCuenta,
  oportunidadesDeCuenta,
} from "@/lib/scope/organizationIndicators";
import { formatPercent, formatUSD, toClient } from "@/lib/money";
import { openTotal, weightedTotal } from "@/lib/domain/pipeline";
import { ETIQUETA_ESTATUS, iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Avatar, Boton, EstadoVacio, Pastilla, StatTile } from "@/components/ui/primitivas";

/**
 * P-04 · Ficha de organización.
 *
 * «Indicadores de la cuenta, lista de oportunidades abiertas y cerradas,
 * bitácora cronológica, personas con su rol en el comité, documentos.»
 *
 * ## Todo lo de esta pantalla está acotado, incluidos los totales
 *
 * §5.3 lo dice explícito y es la parte fácil de romper: los indicadores se
 * calculan **solo sobre las oportunidades que este usuario puede ver**. En una
 * cuenta que dos vendedores comparten, cada uno ve su parte y ninguno puede
 * deducir la del otro restando del total.
 *
 * El panel de salud de la cuenta es Fase 2. Los documentos llegan con E2, junto
 * con su carga.
 */
export default async function FichaDeOrganizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Independientes: `requireSession` es un viaje a la base (docs/latencia.md).
  const [session, { id }] = await Promise.all([requireSession(), params]);

  const cuenta = await getOrganizationDetail(session, id);

  // 404 tanto si no existe como si no la alcanza: distinguirlas revelaría que
  // la cuenta del compañero existe.
  if (!cuenta) notFound();

  const puedeReasignar = can(session, "VER_OPORTUNIDADES_OFICINA");
  // Q-15 · la ficha es del dueño de la cuenta. Alcanzarla por tener una
  // oportunidad ahí (§5.3) da lectura, no edición. La pantalla lo pregunta para
  // no ofrecer un botón que el servidor va a rechazar.
  const puedeEditarFicha = cuenta.owner.id === session.userId || puedeReasignar;

  const [indicadores, oportunidades, actividades, catalogos, propietarios] = await Promise.all([
    indicadoresDeCuenta(session, cuenta.id),
    oportunidadesDeCuenta(session, cuenta.id),
    listActivities(session, { where: { organizationId: cuenta.id }, take: 25 }),
    catalogosParaAlta(),
    // Cualquier usuario activo: las cuentas no son de un país (decisiones §18).
    puedeReasignar ? destinatariosValidos() : Promise.resolve([]),
  ]);

  const abiertas = oportunidades.filter((o) => o.status === "ABIERTA");
  const cerradas = oportunidades.filter((o) => o.status !== "ABIERTA");

  return (
    <>
      <BarraSuperior
        titulo={cuenta.name}
        subtitulo={[
          ETIQUETA_TIPO[cuenta.type],
          cuenta.industry,
          cuenta.city,
          cuenta.countryCode ? `Sede en ${NOMBRE_PAIS[cuenta.countryCode]}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pastilla tono="acento">{ETIQUETA_TIPO[cuenta.type]}</Pastilla>
          {cuenta.isStrategic && <Pastilla tono="acento">Cuenta estratégica</Pastilla>}
          {cuenta.parent && (
            <Pastilla titulo="Jerarquía matriz-filial">
              Filial de{" "}
              <Link
                href={`/contactos/organizaciones/${cuenta.parent.id}`}
                className="underline"
              >
                {cuenta.parent.name}
              </Link>
            </Pastilla>
          )}
          <div className="ml-auto flex gap-2">
            {puedeEditarFicha && (
              <EditarOrganizacion
                organizacion={{
                  id: cuenta.id,
                  name: cuenta.name,
                  legalName: cuenta.legalName,
                  taxId: cuenta.taxId,
                  type: cuenta.type,
                  industry: cuenta.industry,
                  city: cuenta.city,
                  countryCode: cuenta.countryCode,
                  employees: cuenta.employees,
                  creditDays: cuenta.creditDays,
                  isStrategic: cuenta.isStrategic,
                  ownerId: cuenta.owner.id,
                }}
                propietarios={propietarios.map((u) => ({ id: u.id, name: u.name }))}
                puedeReasignar={puedeReasignar}
                accion={editarOrganizacionAccion}
              />
            )}
            <Boton href="/contactos" variante="secundario">
              Volver a contactos
            </Boton>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile denso
            etiqueta="Pipeline abierto"
            valor={formatUSD(indicadores.pipelineAbierto)}
            subtexto={`${indicadores.abiertas} oportunidades tuyas`}
            tono="acento"
          />
          <StatTile denso
            etiqueta="Ponderado"
            valor={formatUSD(weightedTotal(abiertas))}
            subtexto="por probabilidad de etapa"
          />
          <StatTile denso
            etiqueta="Cerradas"
            valor={String(cerradas.length)}
            subtexto={
              cerradas.length === 0
                ? "sin histórico todavía"
                : formatUSD(openTotal(cerradas))
            }
          />
          <StatTile denso
            etiqueta="Personas"
            valor={String(cuenta.people.length)}
            subtexto="en el comité de compra"
          />
        </div>

        <p className="mt-2 text-xs text-texto-tenue">
          Las cifras se calculan solo sobre las oportunidades que puedes ver, no
          sobre el total de la cuenta.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Tarjeta titulo={`Oportunidades abiertas (${abiertas.length})`}>
              {abiertas.length === 0 ? (
                <EstadoVacio
                  titulo="Sin oportunidades abiertas tuyas en esta cuenta"
                  explicacion="Puede que la cuenta tenga negocio activo de otro vendedor: esta pantalla solo muestra lo que tú puedes ver."
                  accion={
                    <Boton href="/oportunidades/nueva">Nueva oportunidad</Boton>
                  }
                />
              ) : (
                <ListaOportunidades oportunidades={abiertas} />
              )}
            </Tarjeta>

            {cerradas.length > 0 && (
              <Tarjeta titulo={`Cerradas (${cerradas.length})`}>
                <ListaOportunidades oportunidades={cerradas} />
              </Tarjeta>
            )}

            <Tarjeta titulo="Bitácora">
              {actividades.length === 0 ? (
                <p className="text-sm text-texto-tenue">
                  Sin actividades registradas en esta cuenta. La bitácora se llena
                  desde la agenda o desde el detalle de una oportunidad.
                </p>
              ) : (
                <ol className="space-y-3">
                  {actividades.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span className="tabular w-24 shrink-0 text-xs text-texto-tenue">
                        {FECHA.format(a.startsAt)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-texto-titulo">
                          <span className="font-medium">{a.type.name}</span> · {a.subject}
                        </p>
                        {a.opportunity && (
                          <Link
                            href={`/oportunidades/${a.opportunity.id}`}
                            className="text-xs text-acento hover:underline"
                          >
                            {a.opportunity.folio} · {a.opportunity.name}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Tarjeta>
          </div>

          <div className="space-y-6">
            <Tarjeta
              titulo="Comité de compra"
              accion={
                <EditarPersona
                  organizationId={cuenta.id}
                  rolesDeComite={catalogos.rolesComite}
                  accion={crearPersonaAccion}
                  etiquetaBoton="Agregar"
                  variante="fantasma"
                />
              }
            >
              {cuenta.people.length === 0 ? (
                <p className="text-sm text-texto-tenue">
                  Sin personas registradas. El comité es lo que ancla el decisor
                  económico y el campeón en MEDDIC, así que sin él esas compuertas
                  no se pueden cerrar.
                </p>
              ) : (
                <ul className="space-y-3">
                  {cuenta.people.map((p) => (
                    <li key={p.id} className="flex items-start gap-3">
                      <Avatar iniciales={p.initials} titulo={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-texto-titulo">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-texto-tenue">
                          {p.jobTitle ?? "Sin puesto registrado"}
                        </p>
                        {p.committeeRole && (
                          <span className="mt-1 inline-block">
                            <Pastilla tono="acento">{p.committeeRole.name}</Pastilla>
                          </span>
                        )}
                      </div>
                      <EditarPersona
                        persona={{
                          id: p.id,
                          name: p.name,
                          jobTitle: p.jobTitle,
                          email: p.email,
                          phone: p.phone,
                          committeeRoleId: p.committeeRole?.id ?? null,
                        }}
                        rolesDeComite={catalogos.rolesComite}
                        accion={editarPersonaAccion}
                        variante="fantasma"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            <Tarjeta titulo="Datos de la cuenta">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Dato etiqueta="Razón social" valor={cuenta.legalName ?? "—"} />
                <Dato etiqueta="Identificador fiscal" valor={cuenta.taxId ?? "—"} mono />
                <Dato etiqueta="Propietario" valor={cuenta.owner.name} />
                <Dato
                  etiqueta="Empleados"
                  valor={cuenta.employees ? String(cuenta.employees) : "—"}
                  tabular
                />
                <Dato
                  etiqueta="Días de crédito"
                  valor={cuenta.creditDays ? String(cuenta.creditDays) : "—"}
                  tabular
                />
                <Dato etiqueta="Alta" valor={FECHA.format(cuenta.createdAt)} tabular />
              </dl>

              {cuenta.children.length > 0 && (
                <div className="mt-4 border-t border-borde pt-4">
                  <p className="eyebrow">Filiales</p>
                  <ul className="mt-2 space-y-1">
                    {cuenta.children.map((h) => (
                      <li key={h.id}>
                        <Link
                          href={`/contactos/organizaciones/${h.id}`}
                          className="text-sm text-acento hover:underline"
                        >
                          {h.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Tarjeta>
          </div>
        </div>
      </div>
    </>
  );
}

function ListaOportunidades({
  oportunidades,
}: {
  oportunidades: Awaited<ReturnType<typeof oportunidadesDeCuenta>>;
}) {
  return (
    <ul className="divide-y divide-borde">
      {oportunidades.map((o) => (
        <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <Link
              href={`/oportunidades/${o.id}`}
              className="text-sm font-medium text-texto-titulo hover:text-acento"
            >
              {o.name}
            </Link>
            <p className="tabular text-xs text-texto-tenue">
              {o.folio} · {o.stage.name} ·{" "}
              {formatPercent(toClient(o.stage.probability), 0)}
            </p>
          </div>
          {o.status !== "ABIERTA" && (
            <Pastilla tono={o.status === "GANADA" ? "exito" : "neutro"}>
              {ETIQUETA_ESTATUS[o.status]}
            </Pastilla>
          )}
          <span className="tabular w-28 shrink-0 text-right text-sm font-medium">
            {formatUSD(o.amount)}
          </span>
          <Avatar iniciales={o.owner.initials} titulo={o.owner.name} />
        </li>
      ))}
    </ul>
  );
}

function Tarjeta({
  titulo,
  children,
  accion,
}: {
  titulo: string;
  children: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>
        {accion}
      </div>
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
  CLIENTE: "Cliente",
  PROSPECTO: "Prospecto",
  PARTNER: "Partner",
  FABRICANTE: "Fabricante",
  PROVEEDOR: "Proveedor",
};

