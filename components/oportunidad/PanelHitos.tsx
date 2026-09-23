"use client";

import { startTransition, useActionState, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  useEnvioQueConserva,
  useProblemas,
} from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ puntaje?: number; url?: string } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;
type Modo = "monto" | "porcentaje";

export type HitoDeLista = {
  id: string;
  descripcion: string;
  vence: string;
  venceISO: string;
  /** Sin formato, para el campo. */
  monto: string;
  montoFormateado: string;
  porcentaje: string;
  cumplido: boolean;
};

/**
 * Solo para mostrar mientras se teclea. Lo que se guarda lo calcula el servidor
 * con `Decimal` (INV-03); aquí se usa `number` a sabiendas, como en el piso del
 * catálogo: `components/**` no alcanza `@prisma/client`.
 */
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function numero(texto: string): number | null {
  if (texto.trim() === "") return null;
  const n = Number(texto.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * La pestaña de hitos de facturación · `HF-01`, `HF-04`, `AC-18`.
 *
 * ## Las tres cifras son el mensaje
 *
 * Neto a repartir, asignado y **por asignar**. Es la pregunta que responde esta
 * pestaña —¿se puede ganar esta oportunidad? (`RN-06`)— y la que hacía falta al
 * capturar: sin ver el total, repartirlo era adivinar. La barra de distribución
 * lo enseña de un vistazo; el panel de captura lo repite con lo que queda.
 *
 * ## Se captura en `%` o en monto, pero se guarda monto
 *
 * §4 lo fija. La conversión es del servidor, con `Decimal` (INV-03): aquí solo
 * se muestra la equivalencia mientras se teclea. Y la suma **no supera el neto**
 * (decisiones §22): el servidor lo rechaza con las cifras; el formulario lo
 * avisa antes, en coral.
 */
export function PanelHitos({
  opportunityId,
  hitos,
  neto,
  netoFormateado,
  cuadre,
  puedeEditar,
  acciones,
}: {
  opportunityId: string;
  hitos: HitoDeLista[];
  /** Sin formato, para calcular en vivo lo que queda por asignar. */
  neto: string | null;
  netoFormateado: string | null;
  cuadre: {
    cuadra: boolean;
    mensaje: string | null;
    asignado: string;
    /** Sin formato. */
    asignadoCrudo: string;
    porcentaje: number;
  };
  puedeEditar: boolean;
  acciones: { guardar: Accion; quitar: Accion; marcar: Accion };
}) {
  const [editando, setEditando] = useState<HitoDeLista | null>(null);
  const [agregando, setAgregando] = useState(false);
  // Sube al cerrar: remonta el formulario para que el siguiente empiece limpio.
  const [generacion, setGeneracion] = useState(0);

  function cerrar() {
    setEditando(null);
    setAgregando(false);
    setGeneracion((g) => g + 1);
  }

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const cual = String(form.get("__accion") ?? "guardar") as keyof typeof acciones;
      const r = await acciones[cual](previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      if (cual === "guardar") {
        cerrar();
        avisar.exito("Hito guardado");
      }
      return r;
    },
    null,
  );

  function despachar(campos: Record<string, string>) {
    const datos = new FormData();
    datos.set("opportunityId", opportunityId);
    for (const [k, v] of Object.entries(campos)) datos.set(k, v);
    startTransition(() => enviar(datos));
  }

  const abierto = editando !== null || agregando;
  const netoN = neto === null ? null : Number(neto);
  const asignadoN = Number(cuadre.asignadoCrudo);
  // Lo que queda sin contar el hito que se edita: su monto vuelve a la bolsa.
  const asignadoOtros = asignadoN - (editando ? Number(editando.monto) : 0);
  const porAsignar = netoN === null ? null : netoN - asignadoOtros;

  return (
    <div className="space-y-4">
      {/* ── Banner de cuadre · AC-18 ───────────────────────────────────── */}
      <div
        className={clsx(
          "rounded-md border px-5 py-4",
          cuadre.cuadra ? "border-exito/40 bg-exito/[0.06]" : "border-borde-fuerte bg-superficie-tinte",
        )}
      >
        <p
          className={clsx(
            "text-sm font-semibold",
            cuadre.cuadra ? "text-exito" : "text-texto-titulo",
          )}
        >
          {cuadre.cuadra ? "Los hitos cuadran con el neto" : cuadre.mensaje}
        </p>

        {/* La barra de distribución: cuánto del neto está repartido. */}
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-gray-10">
          <div
            className={clsx("h-full rounded-pill", cuadre.cuadra ? "bg-exito" : "bg-acento")}
            style={{ width: `${Math.min(100, Math.max(0, cuadre.porcentaje))}%` }}
          />
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          <Cifra etiqueta="Neto a repartir" valor={netoFormateado ?? "Sin cotización con líneas"} />
          <Cifra
            etiqueta="Asignado"
            valor={cuadre.asignado}
            detalle={netoN ? `${cuadre.porcentaje.toFixed(0)} %` : undefined}
          />
          {netoN !== null ? (
            <Cifra
              etiqueta="Por asignar"
              valor={USD.format(Math.max(0, netoN - asignadoN))}
              tono={netoN - asignadoN > 0.005 ? "acento" : "tenue"}
            />
          ) : null}
        </dl>
      </div>

      {/* ── Los hitos ──────────────────────────────────────────────────── */}
      {hitos.length === 0 ? (
        <p className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-8 text-center text-sm text-texto-tenue">
          Sin hitos de facturación. Sin ellos la oportunidad no se puede marcar como ganada
          (RN-06).
        </p>
      ) : (
        <ul className="space-y-2">
          {hitos.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3"
            >
              {puedeEditar && (
                <input
                  type="checkbox"
                  checked={h.cumplido}
                  disabled={enviando}
                  aria-label={`Marcar «${h.descripcion}» como facturado`}
                  onChange={(e) =>
                    despachar({
                      __accion: "marcar",
                      milestoneId: h.id,
                      cumplido: String(e.target.checked),
                    })
                  }
                  className="size-4 rounded-xs border-borde-fuerte text-exito focus:shadow-ring"
                />
              )}

              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    "text-sm font-medium",
                    h.cumplido ? "text-texto-tenue line-through" : "text-texto-titulo",
                  )}
                >
                  {h.descripcion}
                </p>
                <p className="text-xs text-texto-tenue">Vence {h.vence}</p>
              </div>

              {h.cumplido && <Pastilla tono="exito">Facturado</Pastilla>}

              <p className="tabular w-36 whitespace-nowrap text-right text-sm font-semibold text-texto-titulo">
                {h.montoFormateado}
                <span className="ml-1.5 font-normal text-xs text-texto-tenue">{h.porcentaje}</span>
              </p>

              {puedeEditar && (
                <div className="flex items-center gap-1">
                  <Boton variante="fantasma" onClick={() => setEditando(h)}>
                    Editar
                  </Boton>
                  <button
                    type="button"
                    disabled={enviando}
                    aria-label={`Quitar ${h.descripcion}`}
                    onClick={() => despachar({ __accion: "quitar", milestoneId: h.id })}
                    className="rounded-xs p-1 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-coral focus:shadow-ring focus:outline-none"
                  >
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <Boton variante="secundario" onClick={() => setAgregando(true)}>
          Agregar hito
        </Boton>
      )}

      <Panel
        titulo={editando ? "Editar hito" : "Agregar hito"}
        subtitulo="Reparte el neto de la cotización. La suma de los hitos no lo supera."
        abierto={abierto}
        alCerrar={cerrar}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              Se guarda siempre en monto; el porcentaje se convierte contra el neto al guardar.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" form="guardar-hito" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        <FormularioDeHito
          key={`${generacion}-${editando?.id ?? "nuevo"}`}
          opportunityId={opportunityId}
          editando={editando}
          netoN={netoN}
          netoFormateado={netoFormateado}
          asignadoOtros={asignadoOtros}
          porAsignar={porAsignar}
          resultado={resultado}
          enviar={enviar}
        />
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Formulario

function FormularioDeHito({
  opportunityId,
  editando,
  netoN,
  netoFormateado,
  asignadoOtros,
  porAsignar,
  resultado,
  enviar,
}: {
  opportunityId: string;
  editando: HitoDeLista | null;
  netoN: number | null;
  netoFormateado: string | null;
  /** Lo asignado en los demás hitos: al editar, el que se corrige no cuenta. */
  asignadoOtros: number;
  porAsignar: number | null;
  resultado: Resultado | null;
  enviar: (datos: FormData) => void;
}) {
  const [modo, setModo] = useState<Modo>("monto");
  const [valor, setValor] = useState(editando?.monto ?? "");
  // Desde onSubmit y no con action=: así un rechazo del servidor no reinicia
  // lo capturado. Lo que la acción necesita además de los campos va oculto.
  const alEnviar = useEnvioQueConserva(enviar);
  const problemas = useProblemas(resultado);

  const capturado = numero(valor);
  const enMonto =
    capturado === null
      ? null
      : modo === "monto"
        ? capturado
        : netoN === null
          ? null
          : (netoN * capturado) / 100;
  const excedente = enMonto !== null && porAsignar !== null ? enMonto - porAsignar : 0;
  const excede = excedente > 0.005;

  const equivalencia =
    enMonto === null
      ? null
      : modo === "monto"
        ? netoN
          ? `= ${((enMonto / netoN) * 100).toFixed(1)} % del neto`
          : null
        : `= ${USD.format(enMonto)}`;

  function cambiarModo(nuevo: Modo) {
    if (nuevo === modo) return;
    // Lo tecleado se convierte: cambiar de modo no borra la cifra.
    if (capturado !== null && netoN) {
      setValor(
        nuevo === "porcentaje"
          ? ((capturado / netoN) * 100).toFixed(2)
          : ((netoN * capturado) / 100).toFixed(2),
      );
    }
    setModo(nuevo);
  }

  function usarLoQueFalta() {
    if (porAsignar === null || porAsignar <= 0) return;
    setValor(
      modo === "monto"
        ? porAsignar.toFixed(2)
        : netoN
          ? ((porAsignar / netoN) * 100).toFixed(2)
          : "",
    );
    problemas.corregir("amount");
  }

  const pct = (n: number) => (netoN ? `${((n / netoN) * 100).toFixed(0)} %` : undefined);

  return (
    <form
      id="guardar-hito"
      className="flex flex-col gap-5"
      onSubmit={alEnviar}
      onChange={problemas.alCambiar}
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="__accion" value="guardar" />
      <input type="hidden" name="modo" value={modo} />
      {editando ? <input type="hidden" name="milestoneId" value={editando.id} /> : null}

      {/* Lo que hay que repartir, a la vista antes de teclear. */}
      <dl className="grid grid-cols-3 gap-3 rounded-md border border-borde bg-superficie-sutil px-4 py-3">
        <Cifra etiqueta="Neto a repartir" valor={netoFormateado ?? "—"} />
        <Cifra
          etiqueta={editando ? "En los otros hitos" : "Ya asignado"}
          valor={USD.format(asignadoOtros)}
          detalle={pct(asignadoOtros)}
        />
        <Cifra
          etiqueta="Por asignar"
          valor={porAsignar === null ? "—" : USD.format(Math.max(0, porAsignar))}
          detalle={porAsignar === null ? undefined : pct(Math.max(0, porAsignar))}
          tono={porAsignar !== null && porAsignar > 0.005 ? "acento" : "tenue"}
        />
      </dl>

      <Campo
        etiqueta="Concepto"
        htmlFor="description"
        problema={problemas.problema("description")}
        ayuda="Qué se factura: «Anticipo», «Entrega de la fase 1»."
      >
        <Entrada
          id="description"
          name="description"
          defaultValue={editando?.descripcion}
          placeholder="Qué se factura en este hito"
          problema={problemas.problema("description")}
        />
      </Campo>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Campo
          etiqueta={modo === "monto" ? "Monto" : "Porcentaje del neto"}
          htmlFor="amount"
          problema={problemas.problema("amount")}
          anotacion={
            <span
              role="group"
              aria-label="Capturar en"
              className="inline-flex rounded-sm border border-borde bg-superficie-sutil p-0.5"
            >
              {(["monto", "porcentaje"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={modo === m}
                  disabled={m === "porcentaje" && !netoN}
                  onClick={() => cambiarModo(m)}
                  title={
                    m === "porcentaje" && !netoN
                      ? "Sin cotización con líneas no hay neto sobre el cual calcular un porcentaje."
                      : undefined
                  }
                  className={clsx(
                    "rounded-xs px-2 py-0.5 text-xs transition-colors duration-rapido ease-estandar focus:shadow-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    modo === m
                      ? "bg-superficie-pagina font-semibold text-texto-titulo shadow-xs"
                      : "text-texto-tenue hover:text-texto-cuerpo",
                  )}
                >
                  {m === "monto" ? "USD" : "%"}
                </button>
              ))}
            </span>
          }
        >
          <Entrada
            id="amount"
            name="amount"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={modo === "monto" ? "Sin símbolo" : "Sin el signo de %"}
            className="tabular"
            problema={problemas.problema("amount")}
          />
        </Campo>

        <Campo
          etiqueta="Fecha de facturación"
          htmlFor="dueDate"
          problema={problemas.problema("dueDate")}
        >
          <Entrada
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={editando?.venceISO}
            problema={problemas.problema("dueDate")}
          />
        </Campo>
      </div>

      <div className="-mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <p className={excede ? "font-medium text-coral" : "text-texto-tenue"} aria-live="polite">
          {excede
            ? `Se pasa ${USD.format(excedente)} de lo que queda por asignar.`
            : (equivalencia ??
              (netoN === null ? "Sin cotización con líneas no hay neto: captura el monto." : ""))}
        </p>
        {porAsignar !== null && porAsignar > 0.005 ? (
          <button
            type="button"
            onClick={usarLoQueFalta}
            className="font-medium text-acento hover:text-acento-hover focus:shadow-ring focus:outline-none"
          >
            Usar lo que falta · {USD.format(porAsignar)}
          </button>
        ) : null}
      </div>

      <AvisosDeAccion resultado={resultado} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────── Auxiliares

function Cifra({
  etiqueta,
  valor,
  detalle,
  tono = "normal",
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "normal" | "acento" | "tenue";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue">
        {etiqueta}
      </dt>
      <dd
        className={clsx(
          "tabular mt-0.5 text-sm font-semibold",
          { normal: "text-texto-titulo", acento: "text-acento", tenue: "text-texto-tenue" }[tono],
        )}
      >
        {valor}
        {detalle ? (
          <span className="ml-1.5 text-xs font-normal text-texto-tenue">{detalle}</span>
        ) : null}
      </dd>
    </div>
  );
}
