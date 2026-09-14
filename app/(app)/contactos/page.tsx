import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listOrganizationsConIndicadores } from "@/lib/scope/organizationIndicators";
import { listPersonas } from "@/lib/scope/people";
import { catalogosParaAlta } from "@/lib/scope/configuracion";
import { Pestanas, type Pestana } from "@/components/oportunidad/Pestanas";
import { EditarOrganizacion } from "@/components/contactos/EditarOrganizacion";
import { EditarPersona, type CuentaElegible } from "@/components/contactos/EditarPersona";
import { crearOrganizacionAccion, crearPersonaAccion, editarPersonaAccion } from "./acciones";
import { formatUSD } from "@/lib/money";
import { iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Avatar, EstadoVacio, Pastilla, StatTile } from "@/components/ui/primitivas";

/**
 * P-03 · Contactos.
 *
 * «Columnas de organización: nombre, tipo, oportunidades abiertas, pipeline,
 * ganado 12 meses, propietario, última actividad (en rojo si pasó del umbral).»
 *
 * ## La sutileza que decide si esta pantalla filtra información
 *
 * §5.3 · «Para `VENDEDOR`, las cifras se calculan solo sobre oportunidades
 * visibles.» No basta con acotar qué cuentas aparecen: un total agregado sobre
 * la cuenta completa dejaría que un vendedor dedujera, por resta, el pipeline
 * de su compañero en un cliente compartido. Los agregados pasan por
 * `opportunityScope` igual que las filas.
 *
 * ## «Sin histórico» no es «cero»
 *
 * C-02 · el sistema arrancó en limpio, sin migrar Pipedrive. Mientras no exista
 * ninguna oportunidad cerrada, «ganado 12 meses» no vale cero: no tiene dato.
 * Un cero afirmaría que la cuenta no compró, y eso es falso.
 *
 * La pestaña de Personas llega con P-05, en un incremento posterior.
 */
const DIAS_SIN_ACTIVIDAD = 30;

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);

  const [{ organizaciones, hayHistoricoDeCierres }, personas, catalogos] = await Promise.all([
    listOrganizationsConIndicadores(session),
    listPersonas(session),
    catalogosParaAlta(),
  ]);

  // La pestaña vive en la URL (INV-10): la vista es compartible y el botón de
  // regresar funciona.
  const pestanaActiva = sp.t === "personas" ? "personas" : "organizaciones";
  const pestanas: Pestana[] = [
    { clave: "organizaciones", etiqueta: "Organizaciones", contador: organizaciones.length },
    { clave: "personas", etiqueta: "Personas", contador: personas.length },
  ];

  const ahora = new Date();
  const conPipeline = organizaciones.filter((o) => o.indicadores.abiertas > 0);
  const frias = organizaciones.filter((o) =>
    esCuentaFria(o.indicadores.ultimaActividad, ahora),
  );

  // Las cuentas entre las que se elige al agregar un contacto desde Personas.
  // Son las que la sesión alcanza: agregar gente exige alcanzar la cuenta
  // (Q-15), y la lista ya está cargada para la otra pestaña.
  const cuentasParaElegir: CuentaElegible[] = organizaciones.map((o) => ({
    id: o.id,
    name: o.name,
    detalle: [ETIQUETA_TIPO[o.type], o.city].filter(Boolean).join(" · "),
  }));

  // El alta de cada pestaña. Se pinta una sola vez: en la fila de herramientas
  // cuando hay filas, y dentro del estado vacío cuando no las hay, porque el
  // estado vacío propone la acción siguiente y no hace falta decirlo dos veces.
  const botonDeAlta =
    pestanaActiva === "personas" ? (
      <EditarPersona
        organizaciones={cuentasParaElegir}
        rolesDeComite={catalogos.rolesComite}
        accion={crearPersonaAccion}
        variante="primario"
      />
    ) : (
      <EditarOrganizacion paises={session.countryCodes} accion={crearOrganizacionAccion} />
    );
  const hayFilas =
    pestanaActiva === "personas" ? personas.length > 0 : organizaciones.length > 0;

  return (
    <>
      <BarraSuperior
        titulo="Contactos"
        subtitulo={`${organizaciones.length} cuentas · ${personas.length} personas · ${conPipeline.length} con pipeline abierto`}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Pestanas
          pestanas={pestanas}
          activa={pestanaActiva}
          hrefDe={(clave) => `/contactos?t=${clave}`}
        />

        {hayFilas && <div className="mt-4 flex justify-end">{botonDeAlta}</div>}

        {pestanaActiva === "personas" ? (
          <TablaDePersonas
            personas={personas}
            rolesDeComite={catalogos.rolesComite}
            accionVacia={botonDeAlta}
          />
        ) : (
        <>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            etiqueta="Cuentas"
            valor={String(organizaciones.length)}
            subtexto="que puedes ver"
          />
          <StatTile
            etiqueta="Con pipeline abierto"
            valor={String(conPipeline.length)}
            subtexto="tienen al menos una oportunidad"
            tono="acento"
          />
          <StatTile
            etiqueta="Estratégicas"
            valor={String(organizaciones.filter((o) => o.isStrategic).length)}
            subtexto="marcadas por Dirección"
          />
          <StatTile
            etiqueta="Sin actividad"
            valor={String(frias.length)}
            subtexto={`más de ${DIAS_SIN_ACTIVIDAD} días`}
            tono={frias.length > 0 ? "peligro" : "neutro"}
          />
        </div>

        {organizaciones.length === 0 ? (
          <div className="mt-6">
            <EstadoVacio
              titulo="No hay cuentas que puedas ver"
              explicacion="Ves una cuenta si eres su propietario o si tienes al menos una oportunidad propia en ella. Si esperabas ver alguna, revisa a quién está asignada; si es nueva, créala aquí."
              accion={botonDeAlta}
            />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-md border border-borde">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-superficie-sutil">
                <tr className="text-left">
                  <Th>Cuenta</Th>
                  <Th>Tipo</Th>
                  <Th alineacion="derecha">Abiertas</Th>
                  <Th alineacion="derecha">Pipeline</Th>
                  <Th alineacion="derecha">Ganado 12 meses</Th>
                  <Th>Propietario</Th>
                  <Th alineacion="derecha">Última actividad</Th>
                </tr>
              </thead>
              <tbody>
                {organizaciones.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-borde transition-colors duration-rapido hover:bg-superficie-sutil"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/contactos/organizaciones/${o.id}`}
                        className="font-medium text-texto-titulo hover:text-acento"
                      >
                        {o.name}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-texto-tenue">
                        <span>
                          {[o.industry, o.city].filter(Boolean).join(" · ") ||
                            NOMBRE_PAIS[o.countryCode]}
                        </span>
                        {o.isStrategic && <Pastilla tono="acento">Estratégica</Pastilla>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pastilla>{ETIQUETA_TIPO[o.type]}</Pastilla>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {o.indicadores.abiertas || <span className="text-texto-tenue">—</span>}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">
                      {o.indicadores.abiertas > 0 ? (
                        formatUSD(o.indicadores.pipelineAbierto)
                      ) : (
                        <span className="font-normal text-texto-tenue">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {hayHistoricoDeCierres ? (
                        formatUSD(o.indicadores.ganado12Meses)
                      ) : (
                        <span
                          className="text-texto-tenue"
                          title="El sistema arrancó sin migrar el histórico de Pipedrive. No hay cierres contra los cuales medir todavía."
                        >
                          sin histórico
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Avatar iniciales={o.owner.initials} titulo={o.owner.name} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      <UltimaActividad fecha={o.indicadores.ultimaActividad} ahora={ahora} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>
    </>
  );
}

/**
 * La pestaña de personas.
 *
 * El rol en el comité va primero después del nombre: es lo que convierte una
 * lista de contactos en un mapa de quién decide (§2.1). Un directorio sin roles
 * es una agenda telefónica.
 */
function TablaDePersonas({
  personas,
  rolesDeComite,
  accionVacia,
}: {
  personas: Awaited<ReturnType<typeof listPersonas>>;
  rolesDeComite: { id: string; name: string }[];
  /** El alta, para que el estado vacío proponga la acción siguiente. */
  accionVacia: React.ReactNode;
}) {
  if (personas.length === 0) {
    return (
      <div className="mt-6">
        <EstadoVacio
          titulo="No hay personas capturadas"
          explicacion="Agrega el primer contacto desde aquí, desde la ficha de su empresa, o al dar de alta una oportunidad."
          accion={accionVacia}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-md border border-borde">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-superficie-sutil">
          <tr className="text-left">
            <Th>Persona</Th>
            <Th>Rol en el comité</Th>
            <Th>Empresa</Th>
            <Th>Correo</Th>
            <Th>Teléfono</Th>
            <Th alineacion="derecha">&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr
              key={p.id}
              className="border-t border-borde transition-colors duration-rapido hover:bg-superficie-sutil"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar iniciales={p.initials} titulo={p.name} />
                  <div className="min-w-0">
                    <p className="font-medium text-texto-titulo">{p.name}</p>
                    {p.jobTitle && <p className="text-xs text-texto-tenue">{p.jobTitle}</p>}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                {p.committeeRole ? (
                  <Pastilla tono="acento">{p.committeeRole.name}</Pastilla>
                ) : (
                  <span className="text-xs text-texto-tenue">Sin declarar</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/contactos/organizaciones/${p.organization.id}`}
                  className="text-texto-cuerpo hover:text-acento"
                >
                  {p.organization.name}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-texto-tenue">{p.email ?? "—"}</td>
              <td className="tabular px-3 py-2.5 text-texto-tenue">{p.phone ?? "—"}</td>
              <td className="px-3 py-2.5 text-right">
                <EditarPersona
                  persona={{
                    id: p.id,
                    name: p.name,
                    jobTitle: p.jobTitle,
                    email: p.email,
                    phone: p.phone,
                    committeeRoleId: p.committeeRole?.id ?? null,
                  }}
                  rolesDeComite={rolesDeComite}
                  accion={editarPersonaAccion}
                  variante="fantasma"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** §11 · en rojo si pasó del umbral. Una cuenta fría es una cuenta en riesgo. */
function UltimaActividad({ fecha, ahora }: { fecha: Date | null; ahora: Date }) {
  if (fecha === null) {
    return (
      <span className="text-coral" title="Sin ninguna actividad registrada">
        nunca
      </span>
    );
  }

  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
  const fria = dias > DIAS_SIN_ACTIVIDAD;

  return (
    <span
      className={fria ? "font-medium text-coral" : "text-texto-cuerpo"}
      title={FECHA.format(fecha)}
    >
      {dias === 0 ? "hoy" : `hace ${dias} d`}
    </span>
  );
}

function esCuentaFria(fecha: Date | null, ahora: Date): boolean {
  if (fecha === null) return true;
  return (ahora.getTime() - fecha.getTime()) / 86_400_000 > DIAS_SIN_ACTIVIDAD;
}

function Th({
  children,
  alineacion = "izquierda",
}: {
  children: React.ReactNode;
  alineacion?: "izquierda" | "derecha";
}) {
  return (
    <th
      className={`eyebrow px-3 py-2 font-medium ${alineacion === "derecha" ? "text-right" : ""}`}
    >
      {children}
    </th>
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
