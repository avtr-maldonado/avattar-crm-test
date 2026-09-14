import { forbidden } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can, type Session } from "@/lib/auth/permissions";
import {
  configuracionDeCatalogos,
  configuracionDePermisos,
  configuracionDePipelines,
  configuracionDePolitica,
  usuariosPorRol,
} from "@/lib/scope/configuracion";
import { autenticadosSinPerfil, listUsuarios } from "@/lib/scope/usuarios";
import { formatPercent, toClient } from "@/lib/money";
import { ETIQUETA_ROL, iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Avatar, Pastilla } from "@/components/ui/primitivas";
import { Pestanas, type Pestana } from "@/components/oportunidad/Pestanas";
import { FormularioDeUsuario } from "@/components/admin/FormularioDeUsuario";
import { crearUsuarioAccion, darAccesoAccion, editarUsuarioAccion } from "./acciones";

/**
 * P-11 · Administración.
 *
 * «Pipelines y etapas · Catálogos · Roles y permisos · Política comercial.
 * Solo `ADMINISTRADOR`; la política comercial también para `DIRECCION`.»
 *
 * ## Para qué sirve esta pantalla ahora mismo
 *
 * Es donde INV-05 se vuelve verificable: **todo umbral del sistema tiene que
 * aparecer aquí**. Si alguno no está, es que quedó escrito en el código, que es
 * exactamente lo que el invariante prohíbe.
 *
 * Y sirve a algo inmediato del proyecto: varias de estas cifras son supuestos
 * pendientes de que el negocio los confirme (Q-04, Q-08, Q-09). Los que lo son
 * están marcados, para que revisarlos sea leer una pantalla en vez de perseguir
 * un documento.
 *
 * ## Pipelines, catálogos y política siguen en lectura
 *
 * §17 asigna a E1 «P-11 pipelines y catálogos». Editarlos es una mutación con
 * bitácora en la misma transacción (INV-09) y llega con el resto de las
 * acciones. Mientras tanto, ver la configuración ya permite confirmarla.
 *
 * ## Usuarios sí se administran desde aquí
 *
 * El alta de usuarios es un acto administrativo (diseño §3.2): no hay
 * autoaprovisionamiento. La pestaña Usuarios es ese acto, con permiso propio
 * (`ADMINISTRAR_USUARIOS`): alta previa por correo, edición de rol y países, y
 * acceso para quien ya entró con Microsoft y cayó en «sin acceso».
 */
const PESTANAS_BASE = [
  { clave: "pipelines", etiqueta: "Pipelines y etapas" },
  { clave: "catalogos", etiqueta: "Catálogos" },
  { clave: "permisos", etiqueta: "Roles y permisos" },
] as const;

const ROLES = ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);

  const puedeConfigurar = can(session, "EDITAR_CATALOGOS");
  const puedeVerPolitica = can(session, "EDITAR_POLITICA_COMERCIAL");
  const puedeAdministrarUsuarios = can(session, "ADMINISTRAR_USUARIOS");

  // §11 · «Solo ADMINISTRADOR; la política comercial también para DIRECCION.»
  // 403 real, no una pantalla informativa con estatus 200 (AC-02).
  if (!puedeConfigurar && !puedeVerPolitica && !puedeAdministrarUsuarios) forbidden();

  const pestanas: Pestana[] = [
    ...(puedeConfigurar ? PESTANAS_BASE.map((p) => ({ ...p })) : []),
    ...(puedeAdministrarUsuarios ? [{ clave: "usuarios", etiqueta: "Usuarios" }] : []),
    ...(puedeVerPolitica ? [{ clave: "politica", etiqueta: "Política comercial" }] : []),
  ];

  const solicitada = typeof sp.p === "string" ? sp.p : null;
  const activa =
    solicitada && pestanas.some((p) => p.clave === solicitada)
      ? solicitada
      : pestanas[0].clave;

  return (
    <>
      <BarraSuperior
        titulo="Administración"
        subtitulo="Configuración del sistema · sin código (INV-05)"
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activa !== "usuarios" && (
          <div className="rounded-md border border-blue-200 bg-superficie-tinte px-4 py-3 text-sm text-texto-cuerpo">
            Pipelines, catálogos y política comercial son de <strong>solo lectura</strong> en
            este incremento. Editarlos escribe en la bitácora dentro de la misma
            transacción, y llega con las acciones de escritura. Los usuarios ya se
            administran desde su pestaña.
          </div>
        )}

        <div className={activa === "usuarios" ? undefined : "mt-6"}>
          <Pestanas
            pestanas={pestanas}
            activa={activa}
            hrefDe={(clave) => `/admin?p=${clave}`}
          />
        </div>

        <div className="mt-6">
          {activa === "pipelines" && <TabPipelines />}
          {activa === "catalogos" && <TabCatalogos />}
          {activa === "permisos" && <TabPermisos />}
          {activa === "usuarios" && <TabUsuarios session={session} />}
          {activa === "politica" && <TabPolitica />}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────── Pipelines y etapas

async function TabPipelines() {
  const pipelines = await configuracionDePipelines();

  return (
    <div className="space-y-6">
      {pipelines.map((p) => (
        <section
          key={p.id}
          className="rounded-md border border-borde bg-superficie-tarjeta p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-texto-titulo">{p.name}</h2>
            <Pastilla>{NOMBRE_PAIS[p.countryCode]}</Pastilla>
            {p.isRenewal && <Pastilla tono="acento">Renovaciones</Pastilla>}
            {!p.active && <Pastilla tono="peligro">Inactivo</Pastilla>}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde text-left">
                  <Th>#</Th>
                  <Th>Etapa</Th>
                  <Th alineacion="derecha">Probabilidad</Th>
                  <Th alineacion="derecha">Días estancada</Th>
                  <Th>Compuerta</Th>
                  <Th>Requisitos de entrada</Th>
                  <Th alineacion="derecha">Oportunidades</Th>
                </tr>
              </thead>
              <tbody>
                {p.stages.map((e) => (
                  <tr key={e.id} className="border-b border-borde last:border-0">
                    <td className="tabular px-2 py-2 text-texto-tenue">{e.position}</td>
                    <td className="px-2 py-2 font-medium text-texto-titulo">
                      {e.name}
                      {e.isClosing && (
                        <span className="ml-2">
                          <Pastilla tono="exito">Cierre</Pastilla>
                        </span>
                      )}
                    </td>
                    <td className="tabular px-2 py-2 text-right">
                      {formatPercent(toClient(e.probability), 0)}
                    </td>
                    <td className="tabular px-2 py-2 text-right">{e.staleAfterDays}</td>
                    <td className="px-2 py-2">
                      <Pastilla tono={e.gateMode === "BLOQUEANTE" ? "peligro" : "alerta"}>
                        {e.gateMode === "BLOQUEANTE" ? "Bloquea" : "Advierte"}
                      </Pastilla>
                    </td>
                    <td className="px-2 py-2">
                      {e.gateRequires.length === 0 ? (
                        <span className="text-texto-tenue">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {e.gateRequires.map((r) => (
                            <code
                              key={r}
                              className="rounded-xs bg-superficie-sutil px-1.5 py-0.5 font-mono text-xs text-texto-cuerpo"
                            >
                              {r}
                            </code>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="tabular px-2 py-2 text-right text-texto-tenue">
                      {e._count.opportunities}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border-t border-borde pt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="eyebrow">Pesos MEDDIC</p>
              <SupuestoPendiente q="Q-08" />
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {p.meddicWeights.map((w) => (
                <span key={w.component} className="text-xs text-texto-cuerpo">
                  {NOMBRE_COMPONENTE[w.component] ?? w.component}{" "}
                  <span className="tabular font-semibold">{w.weight}</span>
                </span>
              ))}
              <span className="tabular text-xs text-texto-tenue">
                suma {p.meddicWeights.reduce((a, w) => a + w.weight, 0)}
              </span>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Catálogos

async function TabCatalogos() {
  const c = await configuracionDeCatalogos();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Catalogo
        titulo="Tipos de actividad"
        nota="El catálogo que alimenta la agenda y la bitácora."
        filas={c.tiposActividad.map((t) => ({
          id: t.id,
          nombre: t.name,
          activo: t.active,
          usos: t._count.activities,
        }))}
      />
      <Catalogo
        titulo="Tipos de documento"
        nota="Los marcados como contrato satisfacen la compuerta CONTRATO_O_OC_CARGADO."
        filas={c.tiposDocumento.map((t) => ({
          id: t.id,
          nombre: t.name,
          activo: t.active,
          usos: t._count.documents,
          marca: t.isContract ? "Contrato" : undefined,
        }))}
      />
      <Catalogo
        titulo="Motivos de pérdida"
        nota="Los marcados exigen además nombrar al competidor (RN-16)."
        filas={c.motivosPerdida.map((m) => ({
          id: m.id,
          nombre: m.name,
          activo: m.active,
          usos: m._count.opportunities,
          marca: m.requiresCompetitor ? "Exige competidor" : undefined,
        }))}
      />
      <Catalogo
        titulo="Roles de comité"
        nota="Anclan el decisor económico y el campeón de MEDDIC a personas reales."
        filas={c.rolesComite.map((r) => ({
          id: r.id,
          nombre: r.name,
          activo: r.active,
          usos: r._count.people,
        }))}
      />
      <Catalogo
        titulo="Orígenes de oportunidad"
        filas={c.origenes.map((o) => ({
          id: o.id,
          nombre: o.name,
          activo: o.active,
          usos: o._count.opportunities,
        }))}
      />
      <Catalogo
        titulo="Familias de producto"
        filas={c.familias.map((f) => ({
          id: f.id,
          nombre: f.name,
          activo: f.active,
          usos: f._count.products,
        }))}
      />
    </div>
  );
}

function Catalogo({
  titulo,
  nota,
  filas,
}: {
  titulo: string;
  nota?: string;
  filas: { id: string; nombre: string; activo: boolean; usos: number; marca?: string }[];
}) {
  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
      <h2 className="text-sm font-semibold text-texto-titulo">{titulo}</h2>
      {nota && <p className="mt-0.5 text-xs text-texto-tenue">{nota}</p>}

      <ul className="mt-3 divide-y divide-borde">
        {filas.map((f) => (
          <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className={f.activo ? "text-texto-cuerpo" : "text-texto-tenue line-through"}>
              {f.nombre}
            </span>
            {f.marca && <Pastilla tono="acento">{f.marca}</Pastilla>}
            {!f.activo && <Pastilla>Inactivo</Pastilla>}
            <span
              className="tabular ml-auto text-xs text-texto-tenue"
              title="Veces que se usa. MD-05: los catálogos se desactivan, nunca se eliminan."
            >
              {f.usos}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────── Roles y permisos

async function TabPermisos() {
  const [permisos, porRol] = await Promise.all([
    configuracionDePermisos(),
    usuariosPorRol(),
  ]);

  return (
    <section className="overflow-x-auto rounded-md border border-borde bg-superficie-tarjeta">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-superficie-sutil">
          <tr>
            <Th>Permiso</Th>
            {ROLES.map((r) => (
              <th key={r} className="eyebrow px-3 py-2 text-center font-medium">
                {ETIQUETA_ROL[r]}
                <span className="tabular block text-xs font-normal normal-case tracking-normal text-texto-tenue">
                  {porRol[r] ?? 0} usuarios
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permisos.map((p) => (
            <tr key={p.code} className="border-t border-borde">
              <td className="px-3 py-2.5">
                <p className="font-medium text-texto-titulo">{p.name}</p>
                <p className="font-mono text-xs text-texto-tenue">{p.code}</p>
                {p.description && (
                  <p className="mt-0.5 max-w-md text-xs text-texto-tenue">{p.description}</p>
                )}
              </td>
              {ROLES.map((r) => {
                const v = p.porRol[r];
                return (
                  <td key={r} className="px-3 py-2.5 text-center">
                    {!v?.granted ? (
                      <span className="text-texto-tenue" title="No concedido">
                        —
                      </span>
                    ) : v.limite ? (
                      <span className="tabular text-xs font-semibold text-exito">
                        hasta {formatPercent(v.limite, 0)}
                      </span>
                    ) : (
                      <span className="font-semibold text-exito" title="Concedido, sin tope">
                        ✓
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── Usuarios

/**
 * Quién puede entrar y con qué alcance.
 *
 * Primero lo que pide acción: quienes ya entraron con Microsoft y no tienen
 * perfil. Cayeron en «sin acceso» y están esperando a que alguien los vea. Si
 * no hay ninguno, la sección no aparece: un bloque vacío que dice «no hay
 * pendientes» es ruido en una pantalla que se abre poco.
 */
async function TabUsuarios({ session }: { session: Session }) {
  const [usuarios, pendientes] = await Promise.all([
    listUsuarios(session),
    autenticadosSinPerfil(session),
  ]);

  return (
    <div className="space-y-6">
      {pendientes.length > 0 && (
        <section className="rounded-md border border-borde bg-superficie-tarjeta p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-texto-titulo">
              Entraron con Microsoft y no tienen perfil
            </h2>
            <Pastilla tono="alerta">
              {pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}
            </Pastilla>
          </div>
          <p className="mt-0.5 text-xs text-texto-tenue">
            Vieron la pantalla de «sin acceso». Al darles rol y país quedan vinculados y su
            siguiente ingreso ya entra.
          </p>

          <ul className="mt-3 divide-y divide-borde">
            {pendientes.map((p) => (
              <li key={p.authUserId} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto-titulo">
                    {p.name ?? p.email}
                  </p>
                  <p className="truncate text-xs text-texto-tenue">
                    {p.email}
                    {p.lastSignInAt && ` · entró ${FECHA.format(p.lastSignInAt)}`}
                  </p>
                </div>
                <FormularioDeUsuario
                  modo="acceso"
                  pendiente={{ authUserId: p.authUserId, email: p.email, name: p.name }}
                  accion={darAccesoAccion}
                  variante="primario"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-borde bg-superficie-tarjeta">
        <div className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-texto-titulo">Usuarios</h2>
            <p className="mt-0.5 text-xs text-texto-tenue">
              El alta es administrativa: nadie entra sin un perfil creado aquí. El vínculo con
              Microsoft se hace solo en el primer ingreso.
            </p>
          </div>
          <FormularioDeUsuario modo="alta" accion={crearUsuarioAccion} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-superficie-sutil">
              <tr className="text-left">
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Países</Th>
                <Th>Microsoft</Th>
                <Th>Estado</Th>
                <Th alineacion="derecha">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-borde">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar iniciales={u.initials} titulo={u.name} />
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${u.active ? "text-texto-titulo" : "text-texto-tenue"}`}>
                          {u.name}
                          {u.id === session.userId && (
                            <span className="ml-2 text-xs font-normal text-texto-tenue">tú</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-texto-tenue">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{ETIQUETA_ROL[u.role]}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.countryCodes.map((p) => (
                        <Pastilla key={p}>{p}</Pastilla>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {u.vinculado ? (
                      <Pastilla tono="exito">Vinculado</Pastilla>
                    ) : (
                      <span className="text-xs text-texto-tenue">Pendiente de primer ingreso</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.active ? (
                      <span className="text-xs text-texto-cuerpo">Con acceso</span>
                    ) : (
                      <Pastilla tono="peligro">Sin acceso</Pastilla>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <FormularioDeUsuario
                      modo="edicion"
                      usuario={{
                        id: u.id,
                        email: u.email,
                        name: u.name,
                        role: u.role,
                        countryCodes: u.countryCodes,
                        active: u.active,
                        esYo: u.id === session.userId,
                      }}
                      accion={editarUsuarioAccion}
                      variante="fantasma"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// ─────────────────────────────────────────────────────── Política comercial

async function TabPolitica() {
  const paises = await configuracionDePolitica();

  return (
    <div className="space-y-6">
      <p className="text-sm text-texto-cuerpo">
        Aquí vive <strong>todo umbral del sistema</strong>. Si alguno no aparece en
        esta pantalla, quedó escrito en el código, que es lo que INV-05 prohíbe.
      </p>

      {paises.map((pais) => (
        <section
          key={pais.code}
          className="rounded-md border border-borde bg-superficie-tarjeta p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-texto-titulo">{pais.name}</h2>
            <Pastilla>{pais.code}</Pastilla>
            <Pastilla>{pais.currency}</Pastilla>
          </div>

          {!pais.commercialPolicy ? (
            <p className="mt-3 text-sm text-coral">
              Sin política comercial configurada. Este país no puede operar: las
              lecturas de umbral fallan a propósito en vez de inventar valores.
            </p>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Umbral
                etiqueta="Piso de margen"
                valor={formatPercent(toClient(pais.commercialPolicy.marginFloor))}
                nota="RN-05 · verde en o sobre, coral debajo"
              />
              <Umbral
                etiqueta="Piso por línea"
                valor={formatPercent(toClient(pais.commercialPolicy.lineMarginFloor))}
                nota="se señala aunque el total cumpla"
              />
              <Umbral
                etiqueta="Autoriza Gerencia"
                valor={formatPercent(toClient(pais.commercialPolicy.discountThresholdMgmt))}
                nota="RN-04 · descuento sobre este umbral"
              />
              <Umbral
                etiqueta="Autoriza Dirección"
                valor={formatPercent(toClient(pais.commercialPolicy.discountThresholdDir))}
                nota="RN-04 · sin tope superior"
              />
              <Umbral
                etiqueta="MEDDIC para cierre"
                valor={String(pais.commercialPolicy.meddicMinToClosing)}
                nota="RN-27"
              />
              <Umbral
                etiqueta="MEDDIC para ganar"
                valor={String(pais.commercialPolicy.meddicMinToWin)}
                nota="RN-28 · más E, I y C confirmados"
              />
              <Umbral
                etiqueta="MEDDIC para compromiso"
                valor={String(pais.commercialPolicy.meddicMinToCommit)}
                nota="RN-29"
              />
              <Umbral
                etiqueta="Cobertura sana"
                valor={`${pais.commercialPolicy.healthyCoverageMin.toString()}×`}
                nota="RN-25 · sobre la brecha de cuota"
              />
              <Umbral
                etiqueta="SLA de autorización"
                valor={`${pais.commercialPolicy.approvalSlaHours} h`}
                nota="RN-21 · horas hábiles"
                pendiente="Q-09"
              />
              <Umbral
                etiqueta={pais.taxLabel}
                valor={formatPercent(toClient(pais.taxRate))}
                nota="RN-24 · se copia a la cotización al crearla"
                pendiente={pais.code === "MX" ? undefined : "Q-04"}
              />
              <Umbral
                etiqueta="Inicio de año fiscal"
                valor={MES[pais.fiscalYearStartMonth - 1]}
                nota="§10.1 · resuelve los preajustes de fecha"
                pendiente="Q-02"
              />
              <Umbral etiqueta="Zona horaria" valor={pais.timezone} nota="§4.3" />
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}

function Umbral({
  etiqueta,
  valor,
  nota,
  pendiente,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  pendiente?: string;
}) {
  return (
    <div>
      <dt className="eyebrow flex items-center gap-1.5">
        {etiqueta}
        {pendiente && <SupuestoPendiente q={pendiente} />}
      </dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-texto-titulo">{valor}</dd>
      {nota && <p className="mt-0.5 text-xs text-texto-tenue">{nota}</p>}
    </div>
  );
}

/**
 * Marca un valor que todavía es un supuesto.
 *
 * `docs/decisiones-pendientes.md` los lista, pero un documento no se consulta
 * mientras se mira una pantalla. Marcarlos aquí convierte «revisar los
 * supuestos» en leer P-11 con el cliente enfrente.
 */
function SupuestoPendiente({ q }: { q: string }) {
  return (
    <span title={`Valor asumido, pendiente de confirmar con el negocio (${q})`}>
      <Pastilla tono="alerta">{q}</Pastilla>
    </span>
  );
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
      className={`eyebrow px-2 py-2 font-medium ${alineacion === "derecha" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

const NOMBRE_COMPONENTE: Record<string, string> = {
  METRICAS: "Métricas",
  DECISOR_ECONOMICO: "Decisor económico",
  CRITERIOS_DECISION: "Criterios",
  PROCESO_DECISION: "Proceso",
  DOLOR_IDENTIFICADO: "Dolor",
  CAMPEON: "Campeón",
};

const MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
