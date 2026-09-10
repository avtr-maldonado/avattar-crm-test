"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Entrada, Panel, Seleccion } from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ id: string; version: number } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

/** Ya formateado en el servidor: aquí no se calcula dinero (INV-03). */
export type LineaCalculada = {
  id: string;
  descripcion: string;
  unidad: string;
  /** Sin formato, para los campos editables. */
  cantidad: string;
  precioLista: string;
  descuentoPct: string;
  /** Formateados, para las celdas de solo lectura. */
  precioNeto: string;
  importe: string;
  /** Solo con VER_COSTO; ausentes, no vacíos (INV-02). */
  costoUnitario?: string;
  utilidad?: string;
  /** Solo con VER_MARGEN. */
  margen?: string;
  bajoElPiso: boolean;
};

export type TotalesFormateados = {
  grossSubtotal: string;
  descuento: string;
  descuentoPct: string;
  netSubtotal: string;
  taxPct: string;
  taxAmount: string;
  total: string;
  totalCost?: string;
  grossProfit?: string;
  grossMargin?: string;
};

/**
 * El cotizador · §11 P-02, pestaña Cotización.
 *
 * ## Nada se calcula aquí
 *
 * Cada celda que se ve —neto, importe, utilidad, margen, totales— la calculó el
 * servidor con `Decimal` y la persistió (`INV-03`). El navegador no hace
 * aritmética de dinero: una cotización de tres millones con IVA pierde centavos
 * en punto flotante, y esos centavos son los que no cuadran contra la factura.
 *
 * El precio de eso es un viaje al servidor por edición. Por eso los campos
 * **guardan al salir del campo**, no en cada tecla: un viaje por dato cambiado,
 * no por pulsación.
 *
 * ## Una congelada no muestra campos editables
 *
 * `AC-10` dice que editar una línea congelada **falla**. Pintar campos que van a
 * rechazar es mentir: la congelada se ve en solo lectura y ofrece «Crear la
 * versión siguiente», que es lo que de verdad va a pasar (`INV-06`).
 */
export function TablaDeCotizacion({
  quoteId,
  version,
  status,
  congeladaEl,
  lineas,
  totales,
  productos,
  verCosto,
  verMargen,
  puedeEditar,
  pisoDeLinea,
  acciones,
}: {
  quoteId: string;
  version: number;
  status: "BORRADOR" | "CONGELADA" | "REEMPLAZADA";
  congeladaEl: string | null;
  lineas: LineaCalculada[];
  totales: TotalesFormateados;
  productos: { id: string; sku: string; name: string }[];
  verCosto: boolean;
  verMargen: boolean;
  puedeEditar: boolean;
  /** Ya formateado: «10 %». */
  pisoDeLinea: string;
  acciones: {
    guardarLinea: Accion;
    quitarLinea: Accion;
    congelar: Accion;
    nuevaVersion: Accion;
  };
}) {
  const [agregando, setAgregando] = useState(false);
  const editable = puedeEditar && status === "BORRADOR";

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const cual = String(form.get("__accion") ?? "guardarLinea") as keyof typeof acciones;
      const r = await acciones[cual](previo, form);

      if (!r.ok) {
        // Los problemas de campo se pintan en el formulario de alta; los de
        // conflicto y autorización van a aviso.
        if (r.motivo !== "VALIDACION") avisarSiCorresponde(r);
        if (r.motivo === "CONFLICTO") avisar.error("No se pudo", r.problemas[0]?.mensaje);
        return r;
      }

      setAgregando(false);
      if (cual === "congelar") avisar.exito(`Cotización v${version} congelada`);
      if (cual === "nuevaVersion" && r.datos) {
        avisar.exito(`Versión ${r.datos.version} abierta`, "Nace con las líneas de la anterior.");
      }
      return r;
    },
    null,
  );

  function despachar(campos: Record<string, string>) {
    const datos = new FormData();
    datos.set("quoteId", quoteId);
    for (const [k, v] of Object.entries(campos)) datos.set(k, v);
    startTransition(() => enviar(datos));
  }

  const bajoElPiso = lineas.filter((l) => l.bajoElPiso);

  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta">
      {/* ── Encabezado de la versión ─────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde px-5 py-4">
        <h2 className="text-sm font-semibold text-texto-titulo">Cotización v{version}</h2>
        <Pastilla tono={status === "CONGELADA" ? "exito" : status === "BORRADOR" ? "acento" : "neutro"}>
          {status === "CONGELADA" ? "Congelada" : status === "BORRADOR" ? "Borrador" : "Reemplazada"}
        </Pastilla>
        {congeladaEl && <span className="text-xs text-texto-tenue">el {congeladaEl}</span>}

        <div className="ml-auto flex items-center gap-2">
          {editable && lineas.length > 0 && (
            <Boton
              disabled={enviando}
              onClick={() => despachar({ __accion: "congelar" })}
            >
              {enviando ? "Congelando…" : "Congelar cotización"}
            </Boton>
          )}
          {puedeEditar && status === "CONGELADA" && (
            <Boton
              variante="secundario"
              disabled={enviando}
              onClick={() => despachar({ __accion: "nuevaVersion" })}
            >
              Crear la versión {version + 1}
            </Boton>
          )}
        </div>
      </header>

      {status === "CONGELADA" && (
        <p className="border-b border-borde bg-superficie-sutil px-5 py-2.5 text-xs text-texto-tenue">
          Una cotización congelada es inmutable (INV-06). Para cambiarla se crea la versión{" "}
          {version + 1}, que nace con estas mismas líneas.
        </p>
      )}

      {/* ── Las líneas ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-superficie-sutil">
            <tr className="text-left">
              <Th>Producto / servicio</Th>
              <Th>Ud.</Th>
              <Th alineacion="derecha">Cant.</Th>
              <Th alineacion="derecha">P. lista</Th>
              <Th alineacion="derecha">Desc %</Th>
              <Th alineacion="derecha">P. neto</Th>
              {verCosto && <Th alineacion="derecha">Costo ud.</Th>}
              <Th alineacion="derecha">Importe</Th>
              {verCosto && <Th alineacion="derecha">Utilidad</Th>}
              {verMargen && <Th alineacion="derecha">Margen</Th>}
              {editable && <Th alineacion="derecha">&nbsp;</Th>}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className="border-t border-borde">
                <td className="px-3 py-2 text-texto-titulo">{l.descripcion}</td>
                <td className="px-3 py-2 text-xs text-texto-tenue">{l.unidad}</td>

                <CeldaEditable
                  valor={l.cantidad}
                  etiqueta={`Cantidad de ${l.descripcion}`}
                  editable={editable}
                  deshabilitado={enviando}
                  alGuardar={(v) =>
                    despachar({
                      __accion: "guardarLinea",
                      lineId: l.id,
                      quantity: v,
                      discountPct: l.descuentoPct,
                    })
                  }
                />
                <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{l.precioLista}</td>
                <CeldaEditable
                  valor={l.descuentoPct}
                  etiqueta={`Descuento por ciento de ${l.descripcion}`}
                  editable={editable}
                  deshabilitado={enviando}
                  alGuardar={(v) =>
                    despachar({
                      __accion: "guardarLinea",
                      lineId: l.id,
                      quantity: l.cantidad,
                      discountPct: v,
                    })
                  }
                />
                <td className="tabular px-3 py-2 text-right text-texto-tenue">{l.precioNeto}</td>

                {verCosto && (
                  <td className="tabular px-3 py-2 text-right text-texto-cuerpo">
                    {l.costoUnitario}
                  </td>
                )}
                <td className="tabular px-3 py-2 text-right font-semibold text-texto-titulo">
                  {l.importe}
                </td>
                {verCosto && (
                  <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{l.utilidad}</td>
                )}
                {verMargen && (
                  <td
                    className={clsx(
                      "tabular px-3 py-2 text-right font-semibold",
                      // §13.1 · verde en o sobre el piso, coral debajo. Es la
                      // señal más importante de la interfaz.
                      l.bajoElPiso ? "text-coral" : "text-exito",
                    )}
                    title={l.bajoElPiso ? `Bajo el piso por línea de ${pisoDeLinea}` : undefined}
                  >
                    {l.margen}
                  </td>
                )}

                {editable && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => despachar({ __accion: "quitarLinea", lineId: l.id })}
                      aria-label={`Quitar ${l.descripcion}`}
                      className="rounded-xs p-1 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-coral focus:shadow-ring focus:outline-none"
                    >
                      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {lineas.length === 0 && (
              <tr className="border-t border-borde">
                <td colSpan={12} className="px-5 py-8 text-center text-sm text-texto-tenue">
                  Sin líneas todavía. Una cotización vacía no se puede congelar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="border-t border-borde px-5 py-3">
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="text-sm font-medium text-acento transition-colors duration-rapido hover:text-acento-hover focus:shadow-ring focus:outline-none"
          >
            + Agregar línea
          </button>
        </div>
      )}

      {/* ── Totales ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-borde bg-superficie-sutil px-5 py-4 md:grid-cols-4">
        <Total etiqueta="Subtotal bruto" valor={totales.grossSubtotal} />
        <Total
          etiqueta="Descuento"
          valor={`− ${totales.descuento} (${totales.descuentoPct})`}
          tono="coral"
        />
        <Total etiqueta="Subtotal neto" valor={totales.netSubtotal} />
        <Total etiqueta={`IVA ${totales.taxPct}`} valor={totales.taxAmount} />

        <Total etiqueta="Total con impuesto" valor={totales.total} />
        {verCosto && <Total etiqueta="Costo total" valor={totales.totalCost!} />}
        {verCosto && <Total etiqueta="Utilidad bruta" valor={totales.grossProfit!} tono="exito" />}
        {verMargen && <Total etiqueta="Margen bruto" valor={totales.grossMargin!} tono="exito" />}
      </div>

      {/* ── Franja de alertas de política · RN-05 ────────────────────────── */}
      {bajoElPiso.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-1 border-t border-borde bg-coral/[0.06] px-5 py-3"
        >
          {bajoElPiso.map((l) => (
            <p key={l.id} className="flex items-center gap-2 text-sm text-texto-cuerpo">
              <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-coral" />
              Línea «{l.descripcion}»{verMargen ? ` con margen ${l.margen}` : ""}, bajo el piso por
              línea de {pisoDeLinea}.
            </p>
          ))}
          <p className="mt-1 text-xs text-texto-tenue">
            Se señala, no bloquea: la solicitud de autorización llega con el módulo de
            autorizaciones.
          </p>
        </div>
      )}

      <AgregarLinea
        abierto={agregando}
        alCerrar={() => setAgregando(false)}
        productos={productos}
        verCosto={verCosto}
        enviando={enviando}
        resultado={resultado}
        alGuardar={(campos) => despachar({ __accion: "guardarLinea", ...campos })}
      />
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Auxiliares

/**
 * Una celda con campo que **guarda al salir**, no en cada tecla.
 *
 * Cada guardado es un viaje al servidor, que es lo que mantiene a `Decimal`
 * como única fuente de verdad. Guardar por pulsación serían veinte viajes para
 * escribir «1200».
 */
function CeldaEditable({
  valor,
  etiqueta,
  editable,
  deshabilitado,
  alGuardar,
}: {
  valor: string;
  /** Qué se está editando y de qué línea: un lector de pantalla solo oye esto. */
  etiqueta: string;
  editable: boolean;
  deshabilitado: boolean;
  alGuardar: (valor: string) => void;
}) {
  const original = useRef(valor);

  if (!editable) {
    return <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{valor}</td>;
  }

  return (
    <td className="px-3 py-2 text-right">
      <input
        aria-label={etiqueta}
        defaultValue={valor}
        inputMode="decimal"
        disabled={deshabilitado}
        onFocus={(e) => {
          original.current = e.target.value;
          e.target.select();
        }}
        onBlur={(e) => {
          // Sin cambio no hay viaje: salir de un campo que no se tocó no debe
          // costar una escritura.
          if (e.target.value !== original.current) alGuardar(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = original.current;
            e.currentTarget.blur();
          }
        }}
        className="tabular w-20 rounded-xs border border-borde bg-superficie-pagina px-2 py-1 text-right text-sm text-texto-cuerpo outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring disabled:bg-superficie-sutil"
      />
    </td>
  );
}

function Total({
  etiqueta,
  valor,
  tono = "neutro",
}: {
  etiqueta: string;
  valor: string;
  tono?: "neutro" | "coral" | "exito";
}) {
  return (
    <div>
      <p className="text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue">
        {etiqueta}
      </p>
      <p
        className={clsx(
          "tabular mt-0.5 text-lg font-semibold",
          { neutro: "text-texto-titulo", coral: "text-coral", exito: "text-exito" }[tono],
        )}
      >
        {valor}
      </p>
    </div>
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
      scope="col"
      className={clsx(
        "px-3 py-2 text-eyebrow font-semibold uppercase tracking-[var(--ls-eyebrow)] text-texto-tenue",
        alineacion === "derecha" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

/**
 * Alta de línea.
 *
 * Del catálogo, el servidor toma precio y costo de la lista vigente: el
 * formulario ni los pregunta. El concepto libre sí los pide, y solo aparece con
 * `VER_COSTO`, porque sin costo no hay margen que calcular (`Q-07`).
 */
function AgregarLinea({
  abierto,
  alCerrar,
  productos,
  verCosto,
  enviando,
  resultado,
  alGuardar,
}: {
  abierto: boolean;
  alCerrar: () => void;
  productos: { id: string; sku: string; name: string }[];
  verCosto: boolean;
  enviando: boolean;
  resultado: Resultado | null;
  alGuardar: (campos: Record<string, string>) => void;
}) {
  const [libre, setLibre] = useState(false);

  return (
    <Panel
      titulo="Agregar línea"
      subtitulo={
        libre
          ? "Un concepto fuera del catálogo necesita su costo: sin él no hay margen."
          : "Del catálogo: el precio y el costo salen de la lista vigente."
      }
      abierto={abierto}
      alCerrar={alCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={() => setLibre((v) => !v)}
            className="text-xs font-medium text-acento hover:text-acento-hover"
          >
            {libre ? "← Elegir del catálogo" : "Capturar un concepto libre"}
          </button>
          <div className="flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={alCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" form="agregar-linea" disabled={enviando}>
              {enviando ? "Agregando…" : "Agregar"}
            </Boton>
          </div>
        </>
      }
    >
      {/*
        `action` con función en vez de `onSubmit` con `preventDefault`: React
        arma el `FormData` y el envío sigue siendo un envío de formulario. Con
        `preventDefault` el formulario deja de funcionar si el JavaScript no
        cargó, que es justo cuando más falta hace que algo funcione.
      */}
      <form
        id="agregar-linea"
        className="flex flex-col gap-5"
        action={(datos: FormData) =>
          alGuardar(Object.fromEntries(datos) as Record<string, string>)
        }
      >
        {libre ? (
          <>
            <Campo etiqueta="Concepto" htmlFor="description" problema={problema(resultado, "description")}>
              <Entrada id="description" name="description" placeholder="Qué se está vendiendo" />
            </Campo>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Campo etiqueta="Unidad" htmlFor="unit">
                <Entrada id="unit" name="unit" placeholder="hora, servicio" />
              </Campo>
              <Campo etiqueta="Precio unitario" htmlFor="unitPrice" problema={problema(resultado, "unitPrice")}>
                <Entrada id="unitPrice" name="unitPrice" inputMode="decimal" placeholder="Sin símbolo" />
              </Campo>
              {verCosto && (
                <Campo etiqueta="Costo unitario" htmlFor="unitCost" problema={problema(resultado, "unitCost")}>
                  <Entrada id="unitCost" name="unitCost" inputMode="decimal" placeholder="Sin símbolo" />
                </Campo>
              )}
            </div>
          </>
        ) : (
          <Campo etiqueta="Producto" htmlFor="productId" problema={problema(resultado, "productId")}>
            <Seleccion id="productId" name="productId" defaultValue={productos[0]?.id}>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Seleccion>
          </Campo>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo etiqueta="Cantidad" htmlFor="quantity" problema={problema(resultado, "quantity")}>
            <Entrada
              id="quantity"
              name="quantity"
              inputMode="decimal"
              defaultValue="1"
              className="[font-variant-numeric:tabular-nums]"
            />
          </Campo>
          <Campo
            etiqueta="Descuento %"
            htmlFor="discountPct"
            problema={problema(resultado, "discountPct")}
            ayuda="RN-08 · no puede dejar el precio bajo el piso del SKU."
          >
            <Entrada
              id="discountPct"
              name="discountPct"
              inputMode="decimal"
              defaultValue="0"
              className="[font-variant-numeric:tabular-nums]"
            />
          </Campo>
        </div>

        <AvisosDeAccion resultado={resultado} />
      </form>
    </Panel>
  );
}

function problema(resultado: Resultado | null, campo: string): string | undefined {
  if (!resultado || resultado.ok) return undefined;
  return resultado.problemas.find((p) => p.campo === campo)?.mensaje;
}
