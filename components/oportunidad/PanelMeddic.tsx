"use client";

import { startTransition, useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { faltaEvidencia, puedeCalificarDirecto } from "@/lib/domain/meddic";
import { Icono } from "@/components/ui/iconos";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import {
  AreaDeTexto,
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
} from "@/components/ui/formulario";

/** El valor del desplegable de persona que significa «crear una nueva» (§27). */
const NUEVA_PERSONA = "__nueva";

type Resultado = ResultadoAccion<{ puntaje?: number; url?: string } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

export type EstadoMeddic = "NO_EVALUADO" | "AUSENTE" | "PARCIAL" | "CONFIRMADO";

export type ComponenteMeddic = {
  clave: string;
  nombre: string;
  /** Qué hay que haber averiguado para poder marcarlo, en una línea. */
  descripcion: string;
  estado: EstadoMeddic;
  evidencia: string | null;
  personaId: string | null;
  personaNombre: string | null;
  /** §2.1 · solo decisor económico y campeón se anclan a una persona. */
  anclaPersona: boolean;
};

/**
 * Un `Record`, no un arreglo con `.find()`: agregar un estado al enum de Prisma
 * sin tocar esta lista sería error de compilación, no una pestaña en blanco.
 */
const ETIQUETA_DE_ESTADO: Record<EstadoMeddic, string> = {
  NO_EVALUADO: "No evaluado",
  AUSENTE: "Ausente",
  PARCIAL: "Parcial",
  CONFIRMADO: "Confirmado",
};

/** El orden de captura, que es el de la progresión. */
const ESTADOS = Object.entries(ETIQUETA_DE_ESTADO) as [EstadoMeddic, string][];

const TONO_DE_ESTADO: Record<EstadoMeddic, "neutro" | "peligro" | "alerta" | "exito"> = {
  NO_EVALUADO: "neutro",
  AUSENTE: "peligro",
  PARCIAL: "alerta",
  CONFIRMADO: "exito",
};

/** §7.4 · rojo bajo 50, ámbar 50–69, verde 70 o más. */
function tonoDelPuntaje(puntaje: number): "peligro" | "alerta" | "exito" {
  if (puntaje < 50) return "peligro";
  if (puntaje < 70) return "alerta";
  return "exito";
}

/**
 * La pestaña MEDDIC · §7.4.
 *
 * ## El puntaje arriba, y con color
 *
 * «Rojo bajo 50, ámbar 50–69, verde 70 o más.» El número solo no dice si está
 * bien: 62 puede ser bueno en descubrimiento y malo en cierre.
 *
 * ## Calificar sin entrar
 *
 * Cada fila dice qué es el componente y trae los cuatro estados como botones,
 * y los cuatro guardan al pulsar. Solo confirmar al decisor económico o al
 * campeón sin persona ligada abre el panel, con ese estado ya elegido (§2.1).
 *
 * ## La evidencia se pide al confirmar y se señala en parcial · RN-30 (§24, §27)
 *
 * Confirmar exige evidencia: el botón rápido abre el panel con el estado
 * elegido y el foco en ella. Parcial se guarda sin evidencia y lleva la marca
 * «Sin evidencia» junto a su estado; el encabezado cuenta cuántos van así. La
 * evidencia, cuando existe, se lee en la tarjeta bajo la descripción. Sin evidencia el puntaje es una opinión:
 * el sistema lo deja pasar y lo hace visible.
 */
export function PanelMeddic({
  opportunityId,
  puntaje,
  componentes,
  personas,
  rolesDeComite,
  minimos,
  puedeEditar,
  accion,
}: {
  opportunityId: string;
  puntaje: number;
  componentes: ComponenteMeddic[];
  personas: { id: string; name: string; jobTitle: string | null }[];
  /** Para declarar el rol de una persona nueva desde el panel (§2.1). */
  rolesDeComite: { id: string; name: string }[];
  minimos: { cierre: number; ganada: number; compromiso: number };
  puedeEditar: boolean;
  accion: Accion;
}) {
  const [editando, setEditando] = useState<ComponenteMeddic | null>(null);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setEditando(null);
      avisar.exito("Componente actualizado", `Puntaje MEDDIC: ${r.datos?.puntaje ?? puntaje}`);
      return r;
    },
    null,
  );

  // El panel envía desde onSubmit: un rechazo por evidencia vacía no debe
  // borrar lo que ya se había escrito (useEnvioQueConserva).
  const alEnviar = useEnvioQueConserva(enviar);

  function calificar(c: ComponenteMeddic, estado: EstadoMeddic) {
    if (estado === c.estado) return;

    const directo = puedeCalificarDirecto({
      component: c.clave,
      status: estado,
      evidence: c.evidencia,
      personId: c.personaId,
    });
    if (!directo) {
      // Falta evidencia o persona: el panel abre con el estado ya elegido.
      setEditando({ ...c, estado });
      return;
    }

    const datos = new FormData();
    datos.set("opportunityId", opportunityId);
    datos.set("component", c.clave);
    datos.set("status", estado);
    datos.set("evidence", c.evidencia ?? "");
    datos.set("personId", c.personaId ?? "");
    startTransition(() => enviar(datos));
  }

  const sinEvidencia = componentes.filter((c) =>
    faltaEvidencia({ status: c.estado, evidence: c.evidencia }),
  ).length;

  return (
    <div className="space-y-4">
      {/* ── Puntaje y umbrales ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-borde bg-superficie-tarjeta px-5 py-4">
        <div>
          <p className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue">
            Puntaje MEDDIC
          </p>
          <p
            className={clsx(
              "tabular mt-0.5 text-h3 font-semibold leading-none",
              { peligro: "text-coral", alerta: "text-navy-500", exito: "text-exito" }[
                tonoDelPuntaje(puntaje)
              ],
            )}
          >
            {puntaje}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Umbral etiqueta="Entrar a Cierre" minimo={minimos.cierre} puntaje={puntaje} />
          <Umbral etiqueta="Marcar ganada" minimo={minimos.ganada} puntaje={puntaje} />
          <Umbral etiqueta="Compromiso" minimo={minimos.compromiso} puntaje={puntaje} />
        </dl>
        {sinEvidencia > 0 ? (
          <p className="ml-auto flex items-center gap-1.5 text-xs font-medium text-navy-700">
            <Icono nombre="riesgo" className="size-4" />
            {sinEvidencia} {sinEvidencia === 1 ? "calificado sin evidencia" : "calificados sin evidencia"}
          </p>
        ) : null}
      </div>

      {/* ── Los seis componentes ───────────────────────────────────────── */}
      <ul className="space-y-2">
        {componentes.map((c) => {
          const sinEvidencia = faltaEvidencia({ status: c.estado, evidence: c.evidencia });
          return (
          <li
            key={c.clave}
            className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-texto-titulo">{c.nombre}</p>
                <Pastilla tono={TONO_DE_ESTADO[c.estado]}>{ETIQUETA_DE_ESTADO[c.estado]}</Pastilla>
                {sinEvidencia ? (
                  <Pastilla tono="alerta" titulo="Calificado sin evidencia: sin ella el puntaje es una opinión.">
                    <Icono nombre="riesgo" className="mr-1 size-3.5" />
                    Sin evidencia
                  </Pastilla>
                ) : null}
                {c.personaNombre && (
                  <span className="text-xs text-texto-tenue">· {c.personaNombre}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-texto-cuerpo">{c.descripcion}</p>
              {/* La evidencia, de vuelta en la tarjeta (24-sep): solo cuando existe. */}
              {c.evidencia ? (
                <p className="mt-1 text-xs text-texto-tenue">{c.evidencia}</p>
              ) : null}
            </div>

            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label={`Calificar ${c.nombre}`}
                  className="inline-flex rounded-sm border border-borde bg-superficie-sutil p-0.5"
                >
                  {ESTADOS.map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={c.estado === valor}
                      disabled={enviando}
                      onClick={() => calificar(c, valor)}
                      className={clsx(
                        "rounded-xs px-2.5 py-1 text-xs transition-colors duration-rapido ease-estandar focus:shadow-ring focus:outline-none",
                        c.estado === valor
                          ? "bg-superficie-pagina font-semibold text-texto-titulo shadow-xs"
                          : "text-texto-tenue hover:text-texto-cuerpo",
                      )}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                {/* La evidencia no ocupa renglón en la tarjeta: vive en el panel y, de paso, en el tooltip. */}
                <Boton
                  variante="fantasma"
                  onClick={() => setEditando(c)}
                  title={c.evidencia || "Sin evidencia todavía"}
                >
                  Evidencia
                </Boton>
              </div>
            )}
          </li>
          );
        })}
      </ul>

      <Panel
        titulo={editando?.nombre ?? ""}
        subtitulo={
          editando?.anclaPersona
            ? "Confirmarlo exige evidencia y una persona real del comité de compra (§2.1); si no existe, créala aquí."
            : "Confirmar exige evidencia; en parcial se pide, no se exige (RN-30, §27)."
        }
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              El puntaje se recalcula al guardar, en la misma operación.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="calificar-meddic" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        {editando && (
          <FormularioDeCalificacion
            key={`${editando.clave}-${editando.estado}`}
            opportunityId={opportunityId}
            editando={editando}
            personas={personas}
            rolesDeComite={rolesDeComite}
            resultado={resultado}
            alEnviar={alEnviar}
          />
        )}
      </Panel>
    </div>
  );
}

function Umbral({
  etiqueta,
  minimo,
  puntaje,
}: {
  etiqueta: string;
  minimo: number;
  puntaje: number;
}) {
  const alcanza = puntaje >= minimo;
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-texto-tenue">{etiqueta}</dt>
      <dd className={clsx("tabular font-semibold", alcanza ? "text-exito" : "text-texto-tenue")}>
        {minimo}
        {!alcanza && (
          <span className="ml-1 font-normal text-texto-tenue">
            (faltan {minimo - puntaje})
          </span>
        )}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Formulario

/**
 * El panel de un componente: estado, evidencia y, para el decisor y el campeón,
 * la persona del comité. Si la persona no existe, «Nueva persona…» abre nombre,
 * cargo y rol, y nace en la cuenta de la oportunidad al guardar (§27), como en
 * el alta de oportunidad.
 */
function FormularioDeCalificacion({
  opportunityId,
  editando,
  personas,
  rolesDeComite,
  resultado,
  alEnviar,
}: {
  opportunityId: string;
  editando: ComponenteMeddic;
  personas: { id: string; name: string; jobTitle: string | null }[];
  rolesDeComite: { id: string; name: string }[];
  resultado: Resultado | null;
  alEnviar: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [personaSel, setPersonaSel] = useState(editando.personaId ?? "");
  const nueva = personaSel === NUEVA_PERSONA;
  // El rol que corresponde al componente, si el catálogo lo tiene: se propone,
  // no se impone.
  const pista = editando.clave === "DECISOR_ECONOMICO" ? "decisor" : "campe";
  const rolSugerido = rolesDeComite.find((r) => r.name.toLowerCase().includes(pista))?.id ?? "";

  return (
    <form id="calificar-meddic" className="flex flex-col gap-5" onSubmit={alEnviar}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="component" value={editando.clave} />
      <p className="text-sm text-texto-cuerpo">{editando.descripcion}</p>

      <Campo etiqueta="Estado" htmlFor="status" problema={problemaDe(resultado, "status")}>
        <Seleccion id="status" name="status" defaultValue={editando.estado}>
          {ESTADOS.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </Seleccion>
      </Campo>

      <Campo
        etiqueta="Evidencia"
        htmlFor="evidence"
        ayuda="Qué se sabe y cómo se sabe: quién lo dijo, en qué reunión, con qué cifra."
      >
        <AreaDeTexto
          id="evidence"
          name="evidence"
          autoFocus={!editando.evidencia}
          defaultValue={editando.evidencia ?? ""}
          placeholder="En qué se apoya esta calificación"
        />
      </Campo>

      {editando.anclaPersona ? (
        <>
          <Campo
            etiqueta="Persona"
            htmlFor="personId"
            problema={problemaDe(resultado, "personId")}
            ayuda="Del comité de compra de esta cuenta. Si no está, créala aquí."
          >
            <Seleccion
              id="personId"
              name="personId"
              value={personaSel}
              onChange={(e) => setPersonaSel(e.target.value)}
              problema={problemaDe(resultado, "personId")}
            >
              <option value="">Sin ligar</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.jobTitle ? `${p.name} · ${p.jobTitle}` : p.name}
                </option>
              ))}
              <option value={NUEVA_PERSONA}>Nueva persona…</option>
            </Seleccion>
          </Campo>

          {nueva ? (
            <div className="grid grid-cols-1 gap-5 rounded-sm border border-borde bg-superficie-sutil p-4 sm:grid-cols-3">
              <Campo
                etiqueta="Nombre"
                htmlFor="personaNombre"
                problema={problemaDe(resultado, "personaNombre")}
              >
                <Entrada
                  id="personaNombre"
                  name="personaNombre"
                  placeholder="Nombre"
                  autoFocus
                  problema={problemaDe(resultado, "personaNombre")}
                />
              </Campo>
              <Campo etiqueta="Cargo" htmlFor="personaCargo">
                <Entrada id="personaCargo" name="personaCargo" placeholder="Puesto" />
              </Campo>
              <Campo etiqueta="Rol" htmlFor="personaRolComiteId">
                <Seleccion id="personaRolComiteId" name="personaRolComiteId" defaultValue={rolSugerido}>
                  <option value="">Sin declarar</option>
                  {rolesDeComite.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Seleccion>
              </Campo>
            </div>
          ) : null}
        </>
      ) : null}

      <AvisosDeAccion resultado={resultado} />
    </form>
  );
}
