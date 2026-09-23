"use client";

import { startTransition, useActionState, useReducer, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AvisosDeAccion,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
} from "@/components/ui/formulario";
import { calcularEnVivo, type LineaEnVivo } from "./calculoEnVivo";
import { INICIAL, reducirEdicion } from "./estadoDeEdicion";

type Resultado = ResultadoAccion<{ id: string; cambios?: number } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

/** Ya formateado en el servidor: lo que se guardó, calculado con Decimal (INV-03). */
export type LineaCalculada = {
  id: string;
  descripcion: string;
  unidad: string;
  /** Sin formato, para los campos editables. */
  cantidad: string;
  precioUnitario: string;
  descuentoPct: string;
  /** Solo con VER_COSTO; ausente, no vacío (INV-02). Sin formato: es editable. */
  costoUnitario?: string;
  /** Formateados, para las celdas de solo lectura. */
  precioNeto: string;
  importe: string;
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

/** Lo que hace falta del catálogo para proponer precio y costo al agregar. */
export type ProductoElegible = {
  id: string;
  sku: string;
  name: string;
  /** Sin formato: van a un campo editable. `null` = sin lista (§22): se fija aquí. */
  listPrice: string | null;
  /** Solo con VER_COSTO, y solo con lista. */
  standardCost?: string;
};

type CampoDeLinea = "quantity" | "unitPrice" | "discountPct" | "unitCost";

/**
 * El cotizador · §11 P-02, pestaña Cotización.
 *
 * ## Lo guardado lo calcula el servidor; lo que se teclea, la vista previa
 *
 * Cada cifra que se lee —neto, importe, utilidad, margen, totales— la calculó
 * el servidor con `Decimal` y la persistió (`INV-03`). En edición, `calcularEnVivo`
 * las recalcula al teclear con `decimal.js`, la misma librería, y una prueba de
 * paridad garantiza que dicen lo mismo. Nada de eso se guarda hasta «Guardar
 * cambios».
 *
 * ## Leer, editar, guardar
 *
 * La tabla se lee. «Editar» la abre: cantidad, precio, descuento y costo se
 * vuelven campos, y **agregar y quitar líneas solo están aquí**: son cambios de
 * la cotización, y la cotización se cambia en modo edición. «Guardar cambios»
 * manda todas las celdas en un viaje; el servidor aplica solo lo que cambió de
 * valor y deja **una** entrada en la bitácora por guardado. Si nada cambió, no
 * escribe nada y lo dice (decisiones §21).
 */
export function TablaDeCotizacion({
  quoteId,
  lineas,
  totales,
  productos,
  verCosto,
  verMargen,
  puedeEditar,
  pisoDeLinea,
  enVivo,
  acciones,
}: {
  quoteId: string;
  lineas: LineaCalculada[];
  totales: TotalesFormateados;
  productos: ProductoElegible[];
  verCosto: boolean;
  verMargen: boolean;
  puedeEditar: boolean;
  /** Ya formateado: «10 %». */
  pisoDeLinea: string;
  /** Sin formato, para la vista previa: la tasa copiada en la cotización y el piso por línea. */
  enVivo: { taxRate: string; pisoDeLinea: string };
  acciones: {
    guardarLinea: Accion;
    guardarCotizacion: Accion;
    quitarLinea: Accion;
  };
}) {
  const [agregando, setAgregando] = useState(false);
  const [edicion, despacharEdicion] = useReducer(reducirEdicion, INICIAL);
  const { editando, generacion, borrador } = edicion;

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const cual = String(form.get("__accion") ?? "guardarLinea") as keyof typeof acciones;
      const r = await acciones[cual](previo, form);

      if (!r.ok) {
        // Los problemas de campo del alta se pintan en su formulario. Los del
        // guardado de la tabla no tienen dónde: se avisan, con el dato concreto.
        if (r.motivo === "VALIDACION" && cual !== "guardarLinea") {
          avisar.error("No se guardó", r.problemas[0]?.mensaje);
        } else {
          avisarSiCorresponde(r);
        }
        return r;
      }

      if (cual === "guardarCotizacion") {
        const n = r.datos?.cambios ?? 0;
        despacharEdicion({ tipo: "cerrar" });
        if (n === 0) avisar.informacion("Sin cambios", "Nada cambió de valor; no se anotó nada.");
        else avisar.exito("Cotización guardada", `${n} ${n === 1 ? "cambio" : "cambios"}, en la bitácora.`);
      }
      setAgregando(false);
      return r;
    },
    null,
  );

  const alGuardar = useEnvioQueConserva(enviar);

  function despachar(campos: Record<string, string>) {
    const datos = new FormData();
    datos.set("quoteId", quoteId);
    for (const [k, v] of Object.entries(campos)) datos.set(k, v);
    startTransition(() => enviar(datos));
  }

  function empezarAAgregar() {
    despacharEdicion({ tipo: "editar" });
    setAgregando(true);
  }

  // La vista previa: lo tecleado sobre lo guardado, recalculado al momento.
  const vista = editando
    ? calcularEnVivo(
        lineas.map((l) => ({
          id: l.id,
          cantidad: borrador[`linea.${l.id}.quantity`] ?? l.cantidad,
          precioUnitario: borrador[`linea.${l.id}.unitPrice`] ?? l.precioUnitario,
          descuentoPct: borrador[`linea.${l.id}.discountPct`] ?? l.descuentoPct,
          ...(l.costoUnitario !== undefined
            ? { costoUnitario: borrador[`linea.${l.id}.unitCost`] ?? l.costoUnitario }
            : {}),
        })),
        { taxRate: enVivo.taxRate, pisoDeLinea: enVivo.pisoDeLinea, verCosto, verMargen },
      )
    : null;
  const filas = lineas.map((l, i) => fusionar(l, vista?.lineas[i]));
  // La tasa no cambia editando: se conserva la formateada por el servidor.
  const totalesVisibles = vista ? { ...vista.totales, taxPct: totales.taxPct } : totales;
  // Sin VER_COSTO la vista previa no puede recalcular el margen (INV-02): se
  // muestra el guardado, atenuado, y se dice que se recalcula al guardar.
  const margenPendiente = editando && !verCosto;
  const bajoElPiso = filas.filter((l) => l.bajoElPiso);

  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde px-5 py-4">
        <h2 className="text-sm font-semibold text-texto-titulo">Cotización</h2>
        <p className="text-xs text-texto-tenue">
          {editando
            ? "Las cifras se recalculan al teclear. Nada se guarda hasta «Guardar cambios»."
            : puedeEditar
              ? "Se corrige en su lugar. Cada guardado con cambios queda en la bitácora."
              : "Solo lectura."}
        </p>
        {puedeEditar && !editando && (
          <div className="ml-auto">
            <Boton variante="secundario" onClick={() => despacharEdicion({ tipo: "editar" })}>
              Editar
            </Boton>
          </div>
        )}
      </header>

      <form
        key={generacion}
        id="editar-cotizacion"
        onSubmit={alGuardar}
        // Un solo manejador para todas las celdas: el evento sube desde cada
        // campo con su nombre `linea.<id>.<campo>`, y el borrador lo recoge.
        onChange={(e) => {
          const control: EventTarget = e.target;
          if (control instanceof HTMLInputElement) {
            despacharEdicion({ tipo: "teclear", nombre: control.name, valor: control.value });
          }
        }}
      >
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="__accion" value="guardarCotizacion" />

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-superficie-sutil">
              <tr className="text-left">
                <Th>Producto / servicio</Th>
                <Th>Ud.</Th>
                <Th alineacion="derecha">Cant.</Th>
                <Th alineacion="derecha">P. unitario</Th>
                <Th alineacion="derecha">Desc %</Th>
                <Th alineacion="derecha">P. neto</Th>
                {verCosto && <Th alineacion="derecha">Costo ud.</Th>}
                <Th alineacion="derecha">Importe</Th>
                {verCosto && <Th alineacion="derecha">Utilidad</Th>}
                {verMargen && <Th alineacion="derecha">Margen</Th>}
                {puedeEditar && editando && <Th alineacion="derecha">&nbsp;</Th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((l) => (
                <tr key={l.id} className="border-t border-borde">
                  <td className="px-3 py-2 text-texto-titulo">{l.descripcion}</td>
                  <td className="px-3 py-2 text-xs text-texto-tenue">{l.unidad}</td>

                  <Celda lineId={l.id} campo="quantity" valor={l.cantidad} etiqueta={`Cantidad de ${l.descripcion}`} editando={editando} deshabilitado={enviando} />
                  <Celda lineId={l.id} campo="unitPrice" valor={l.precioUnitario} etiqueta={`Precio unitario de ${l.descripcion}`} editando={editando} deshabilitado={enviando} ancho="ancha" />
                  <Celda lineId={l.id} campo="discountPct" valor={l.descuentoPct} etiqueta={`Descuento por ciento de ${l.descripcion}`} editando={editando} deshabilitado={enviando} />
                  <td className="tabular px-3 py-2 text-right text-texto-tenue">{l.precioNeto}</td>

                  {verCosto && (
                    <Celda lineId={l.id} campo="unitCost" valor={l.costoUnitario ?? ""} etiqueta={`Costo unitario de ${l.descripcion}`} editando={editando} deshabilitado={enviando} ancho="ancha" />
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
                        margenPendiente && "opacity-60",
                      )}
                      title={
                        margenPendiente
                          ? "Se recalcula al guardar: sin ver el costo no se puede anticipar."
                          : l.bajoElPiso
                            ? `Bajo el piso por línea de ${pisoDeLinea}`
                            : undefined
                      }
                    >
                      {l.margen}
                    </td>
                  )}

                  {puedeEditar && editando && (
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
                    Sin líneas todavía. Mientras no haya, la oportunidad vale su estimado.
                    {puedeEditar && !agregando ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={empezarAAgregar}
                          className="font-medium text-acento transition-colors duration-rapido hover:text-acento-hover focus:shadow-ring focus:outline-none"
                        >
                          Agregar la primera línea
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editando && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde bg-superficie-tinte px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => setAgregando(true)}
                disabled={enviando}
                className="text-sm font-medium text-acento transition-colors duration-rapido hover:text-acento-hover focus:shadow-ring focus:outline-none disabled:opacity-50"
              >
                + Agregar línea
              </button>
              <p className="text-xs text-texto-cuerpo">
                Solo lo que cambie de valor se anota. Un precio bajo el piso del producto detiene
                el guardado completo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Boton
                variante="fantasma"
                type="button"
                onClick={() => despacharEdicion({ tipo: "cerrar" })}
                disabled={enviando}
              >
                Cancelar
              </Boton>
              <Boton type="submit" disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar cambios"}
              </Boton>
            </div>
          </div>
        )}
      </form>

      <ResumenDeTotales
        totales={totalesVisibles}
        verCosto={verCosto}
        verMargen={verMargen}
        margenPendiente={margenPendiente}
      />

      <AlertasDePiso lineas={bajoElPiso} verMargen={verMargen} pisoDeLinea={pisoDeLinea} />

      <AgregarLinea
        quoteId={quoteId}
        abierto={agregando}
        alCerrar={() => setAgregando(false)}
        productos={productos}
        verCosto={verCosto}
        enviando={enviando}
        resultado={resultado}
        enviar={enviar}
      />
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Auxiliares

/**
 * Lo guardado con la vista previa encima. Sin costo (INV-02) la vista previa no
 * trae margen: se conservan el margen y el piso guardados.
 */
function fusionar(guardada: LineaCalculada, viva: LineaEnVivo | undefined): LineaCalculada {
  if (!viva) return guardada;
  return {
    ...guardada,
    precioNeto: viva.precioNeto,
    importe: viva.importe,
    ...(viva.utilidad !== undefined ? { utilidad: viva.utilidad } : {}),
    ...(viva.margen !== undefined ? { margen: viva.margen, bajoElPiso: viva.bajoElPiso } : {}),
  };
}

/**
 * Una celda que en lectura es texto y en edición es un campo del formulario,
 * con el nombre que la acción espera: `linea.<id>.<campo>`. No guarda por su
 * cuenta: guarda «Guardar cambios», con todas las demás.
 */
function Celda({
  lineId,
  campo,
  valor,
  etiqueta,
  editando,
  deshabilitado,
  ancho = "angosta",
}: {
  lineId: string;
  campo: CampoDeLinea;
  valor: string;
  /** Qué se está editando y de qué línea: un lector de pantalla solo oye esto. */
  etiqueta: string;
  editando: boolean;
  deshabilitado: boolean;
  ancho?: "angosta" | "ancha";
}) {
  if (!editando) {
    return <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{valor}</td>;
  }

  return (
    <td className="px-3 py-2 text-right">
      <input
        name={`linea.${lineId}.${campo}`}
        aria-label={etiqueta}
        defaultValue={valor}
        inputMode="decimal"
        disabled={deshabilitado}
        onFocus={(e) => e.target.select()}
        className={clsx(
          "tabular rounded-xs border border-borde bg-superficie-pagina px-2 py-1 text-right text-sm text-texto-cuerpo outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring disabled:bg-superficie-sutil",
          // Once columnas con costo: los campos van justos para que a 1110 px
          // la tabla quepa sin deslizar.
          ancho === "ancha" ? "w-24" : "w-16",
        )}
      />
    </td>
  );
}

function ResumenDeTotales({
  totales,
  verCosto,
  verMargen,
  margenPendiente,
}: {
  totales: TotalesFormateados;
  verCosto: boolean;
  verMargen: boolean;
  margenPendiente: boolean;
}) {
  return (
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
      {verMargen && (
        <Total
          etiqueta="Margen bruto"
          valor={totales.grossMargin!}
          tono="exito"
          nota={margenPendiente ? "se recalcula al guardar" : undefined}
        />
      )}
    </div>
  );
}

/** La franja de alertas de política · RN-05. Señala, no bloquea. */
function AlertasDePiso({
  lineas,
  verMargen,
  pisoDeLinea,
}: {
  lineas: LineaCalculada[];
  verMargen: boolean;
  pisoDeLinea: string;
}) {
  if (lineas.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-1 border-t border-borde bg-coral/[0.06] px-5 py-3">
      {lineas.map((l) => (
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
  );
}

function Total({
  etiqueta,
  valor,
  tono = "neutro",
  nota,
}: {
  etiqueta: string;
  valor: string;
  tono?: "neutro" | "coral" | "exito";
  /** Cuando la cifra no es la definitiva: «se recalcula al guardar». */
  nota?: string;
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
          nota && "opacity-60",
        )}
      >
        {valor}
      </p>
      {nota ? <p className="text-xs text-texto-tenue">{nota}</p> : null}
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
 * Del catálogo, el precio y el costo de la lista vigente **llenan** los campos
 * al elegir el producto; son la referencia, no la imposición, y se corrigen
 * antes de guardar. El costo solo aparece con `VER_COSTO` (`INV-02`). El
 * concepto libre pide los dos porque no viene de ninguna lista (`Q-07`).
 */
function AgregarLinea({
  quoteId,
  abierto,
  alCerrar,
  productos,
  verCosto,
  enviando,
  resultado,
  enviar,
}: {
  quoteId: string;
  abierto: boolean;
  alCerrar: () => void;
  productos: ProductoElegible[];
  verCosto: boolean;
  enviando: boolean;
  resultado: Resultado | null;
  enviar: (datos: FormData) => void;
}) {
  const [libre, setLibre] = useState(false);
  const [elegido, setElegido] = useState(productos[0]?.id ?? "");
  const producto = productos.find((p) => p.id === elegido) ?? productos[0];
  // Sin lista vigente, precio y costo se fijan para esta oportunidad (§22).
  const sinLista = !libre && producto !== undefined && producto.listPrice === null;
  // Desde onSubmit y no con action=: así un rechazo del servidor no reinicia
  // lo capturado. Lo que la acción necesita además de los campos va oculto.
  const alEnviar = useEnvioQueConserva(enviar);

  return (
    <Panel
      titulo="Agregar línea"
      subtitulo={
        libre
          ? "Un concepto fuera del catálogo necesita su costo: sin él no hay margen."
          : sinLista
            ? "Este producto no tiene lista: precio y costo se fijan para esta oportunidad."
            : "Del catálogo: precio y costo llegan de la lista vigente y se pueden corregir."
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
      <form
        id="agregar-linea"
        // Remontar al cambiar de producto es lo que hace que precio y costo
        // adopten los de la lista: son `defaultValue`, y el usuario los edita.
        key={`${libre}-${producto?.id ?? ""}`}
        className="flex flex-col gap-5"
        onSubmit={alEnviar}
      >
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="__accion" value="guardarLinea" />
        {libre ? (
          <>
            <Campo etiqueta="Concepto" htmlFor="description" problema={problemaDe(resultado, "description")}>
              <Entrada id="description" name="description" placeholder="Qué se está vendiendo" />
            </Campo>
            <Campo etiqueta="Unidad" htmlFor="unit">
              <Entrada id="unit" name="unit" placeholder="hora, servicio" />
            </Campo>
          </>
        ) : (
          <Campo etiqueta="Producto" htmlFor="productId" problema={problemaDe(resultado, "productId")}>
            <Seleccion
              id="productId"
              name="productId"
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                  {p.listPrice === null ? " · sin lista" : ""}
                </option>
              ))}
            </Seleccion>
          </Campo>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Campo etiqueta="Cantidad" htmlFor="quantity" problema={problemaDe(resultado, "quantity")}>
            <Entrada id="quantity" name="quantity" inputMode="decimal" defaultValue="1" className="tabular" />
          </Campo>
          <Campo
            etiqueta="Precio unitario"
            htmlFor="unitPrice"
            problema={problemaDe(resultado, "unitPrice")}
          >
            <Entrada
              id="unitPrice"
              name="unitPrice"
              inputMode="decimal"
              defaultValue={libre ? "" : producto?.listPrice ?? ""}
              placeholder="Sin símbolo"
              className="tabular"
            />
          </Campo>
          {verCosto && (
            <Campo
              etiqueta="Costo unitario"
              htmlFor="unitCost"
              problema={problemaDe(resultado, "unitCost")}
            >
              <Entrada
                id="unitCost"
                name="unitCost"
                inputMode="decimal"
                defaultValue={libre ? "" : producto?.standardCost ?? ""}
                placeholder="Sin símbolo"
                className="tabular"
              />
            </Campo>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Campo
            etiqueta="Descuento %"
            htmlFor="discountPct"
            problema={problemaDe(resultado, "discountPct") ?? problemaDe(resultado, "discountRate")}
            ayuda="RN-08 · no puede dejar el precio bajo el piso del SKU."
          >
            <Entrada id="discountPct" name="discountPct" inputMode="decimal" defaultValue="0" className="tabular" />
          </Campo>
        </div>

        <AvisosDeAccion resultado={resultado} />
      </form>
    </Panel>
  );
}
