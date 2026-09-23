"use client";

import { useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import {
  AreaDeTexto,
  AvisosDeAccion,
  Campo,
  Casilla,
  Entrada,
  Panel,
  Seleccion,
} from "@/components/ui/formulario";

/** Alta y edición comparten formulario, así que comparten tipo de resultado. */
type ResultadoDeProducto = ResultadoAccion<{ id: string } | null>;

const MODELOS = [
  { valor: "PRECIO_FIJO", etiqueta: "Precio fijo" },
  { valor: "TIEMPO_Y_MATERIALES", etiqueta: "Tiempo y materiales" },
  { valor: "RECURRENTE", etiqueta: "Recurrente mensual" },
  { valor: "RECURRENTE_ANUAL", etiqueta: "Recurrente anual" },
  { valor: "POR_CONSUMO", etiqueta: "Por consumo" },
];

export type ProductoDelFormulario = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  familyId: string;
  unit: string;
  priceModel: string;
  active: boolean;
  listPrice: string;
  /** Solo llega con `VER_COSTO`; sin él el bloque de precios no se edita. */
  standardCost: string | null;
};

/**
 * Vista previa del piso, en el navegador.
 *
 * Es **solo para mostrar mientras se teclea**. El valor que se guarda lo calcula
 * el servidor con `Decimal` (INV-03); aquí no se puede importar Prisma
 * (`components/**` no alcanza `@prisma/client`), así que se usa `number` a
 * sabiendas de que puede desviarse en el último decimal. Si el usuario ve
 * 666.67 y se guarda 666.6667, nadie sale perjudicado.
 */
function pisoAproximado(costo: string, lista: string, pisoMargen: number): string | null {
  const c = Number(costo.replace(/,/g, ""));
  const l = Number(lista.replace(/,/g, ""));
  if (!Number.isFinite(c) || !Number.isFinite(l) || l <= 0) return null;
  const porMargen = c / (1 - pisoMargen);
  return Math.min(porMargen, l).toLocaleString("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/**
 * Alta y edición de un producto · P-06.
 *
 * ## Lo que el formulario dice antes de guardar
 *
 * El piso de precio se muestra calculado en vivo debajo de costo y lista: es la
 * cifra que RN-08 va a hacer cumplir en cada cotización, y verla mientras se
 * captura evita descubrirla cuando un vendedor no puede dar el descuento que
 * prometió.
 *
 * Y al editar, si se toca precio o costo, se avisa que eso **abre una vigencia
 * nueva** (RN-26): no se corrige la anterior, se cierra. Quien edita tiene que
 * saber que está haciendo historia, no borrando un error de dedo.
 */
export function EditarProducto({
  producto,
  familias,
  pisoDeMargen,
  puedeVerCosto,
  accion,
}: {
  /** Sin producto, el formulario da de alta. */
  producto?: ProductoDelFormulario;
  familias: { id: string; name: string }[];
  /** Fracción, como viene de `CommercialPolicy`: 0.10 = 10 %. */
  pisoDeMargen: number;
  puedeVerCosto: boolean;
  accion: (previo: ResultadoDeProducto | null, form: FormData) => Promise<ResultadoDeProducto>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState(producto?.listPrice ?? "");
  const [costo, setCosto] = useState(producto?.standardCost ?? "");
  const esAlta = producto === undefined;

  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoDeProducto | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      avisar.exito(esAlta ? "Producto creado" : "Producto actualizado");
      return r;
    },
    null,
  );

  const idFormulario = `producto-${producto?.id ?? "nuevo"}`;
  const piso = pisoAproximado(costo, lista, pisoDeMargen);
  // Los dos vacíos = sin lista (§22): precio y costo se fijan en cada cotización.
  const sinLista = lista.trim() === "" && costo.trim() === "";
  const teniaLista = producto !== undefined && producto.listPrice !== "";
  const tocaPrecios =
    !esAlta && (lista !== (producto?.listPrice ?? "") || costo !== (producto?.standardCost ?? ""));

  return (
    <>
      <Boton variante={esAlta ? "primario" : "fantasma"} onClick={() => setAbierto(true)}>
        {esAlta ? "Nuevo producto" : "Editar"}
      </Boton>

      <Panel
        titulo={esAlta ? "Nuevo producto" : "Editar producto"}
        subtitulo={
          esAlta
            ? "Lista única en USD para los tres países. Sin precio ni costo, se fijan en cada cotización."
            : `${producto?.sku} · el SKU no se edita`
        }
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        pie={
          <>
            <p className="max-w-sm text-xs leading-snug text-texto-tenue">
              {tocaPrecios && !sinLista
                ? teniaLista
                  ? "Cambiar precio o costo abre una vigencia nueva desde hoy. La anterior queda como histórico (RN-26)."
                  : "Con precio y costo el producto estrena lista desde hoy (RN-26)."
                : sinLista
                  ? "Sin precio ni costo el producto queda sin lista: se fijan en cada cotización, y no hay piso de descuento por SKU."
                  : "El piso de descuento se deriva del costo y del piso de margen por línea; no se captura."}
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idFormulario} disabled={enviando}>
                {enviando ? "Guardando…" : esAlta ? "Crear producto" : "Guardar cambios"}
              </Boton>
            </div>
          </>
        }
      >
        <form id={idFormulario} action={enviar} className="flex flex-col gap-5">
          {producto && <input type="hidden" name="productId" value={producto.id} />}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Campo
              etiqueta="SKU"
              htmlFor={`${idFormulario}-sku`}
              problema={problemaDe(resultado, "sku")}
              ayuda={esAlta ? "Se fija al crear: lo referencian las cotizaciones." : undefined}
            >
              <Entrada
                id={`${idFormulario}-sku`}
                name="sku"
                defaultValue={producto?.sku}
                disabled={!esAlta}
                placeholder="Clave del producto"
                className="uppercase [font-variant-numeric:tabular-nums]"
                problema={problemaDe(resultado, "sku")}
              />
            </Campo>

            <Campo etiqueta="Nombre" htmlFor={`${idFormulario}-name`} problema={problemaDe(resultado, "name")}>
              <Entrada
                id={`${idFormulario}-name`}
                name="name"
                defaultValue={producto?.name}
                placeholder="Cómo aparece en la cotización"
                problema={problemaDe(resultado, "name")}
              />
            </Campo>
          </div>

          <Campo etiqueta="Descripción" htmlFor={`${idFormulario}-description`}>
            <AreaDeTexto
              id={`${idFormulario}-description`}
              name="description"
              defaultValue={producto?.description ?? ""}
              placeholder="Qué incluye"
              rows={2}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Campo etiqueta="Familia" htmlFor={`${idFormulario}-familyId`} problema={problemaDe(resultado, "familyId")}>
              <Seleccion id={`${idFormulario}-familyId`} name="familyId" defaultValue={producto?.familyId ?? familias[0]?.id}>
                {familias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Campo etiqueta="Unidad" htmlFor={`${idFormulario}-unit`} problema={problemaDe(resultado, "unit")}>
              <Entrada
                id={`${idFormulario}-unit`}
                name="unit"
                defaultValue={producto?.unit}
                placeholder="día, mes, usuario, pieza"
                problema={problemaDe(resultado, "unit")}
              />
            </Campo>

            <Campo etiqueta="Modelo de precio" htmlFor={`${idFormulario}-priceModel`}>
              <Seleccion id={`${idFormulario}-priceModel`} name="priceModel" defaultValue={producto?.priceModel ?? "PRECIO_FIJO"}>
                {MODELOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          {puedeVerCosto ? (
            <div className="rounded-sm border border-borde bg-superficie-sutil p-4">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Campo
                  etiqueta="Precio de lista"
                  htmlFor={`${idFormulario}-listPrice`}
                  problema={problemaDe(resultado, "listPrice")}
                >
                  <Entrada
                    id={`${idFormulario}-listPrice`}
                    name="listPrice"
                    inputMode="decimal"
                    value={lista}
                    onChange={(e) => setLista(e.target.value)}
                    placeholder="Por oportunidad"
                    className="[font-variant-numeric:tabular-nums]"
                    problema={problemaDe(resultado, "listPrice")}
                  />
                </Campo>

                <Campo
                  etiqueta="Costo estándar"
                  htmlFor={`${idFormulario}-standardCost`}
                  problema={problemaDe(resultado, "standardCost")}
                  ayuda="Cambiarlo refresca la fecha del costo (C-01)."
                >
                  <Entrada
                    id={`${idFormulario}-standardCost`}
                    name="standardCost"
                    inputMode="decimal"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                    placeholder="Por oportunidad"
                    className="[font-variant-numeric:tabular-nums]"
                    problema={problemaDe(resultado, "standardCost")}
                  />
                </Campo>

                {/* Solo lectura: RN-08 lo deriva, INV-05 prohíbe capturarlo. */}
                <Campo
                  etiqueta="Piso de descuento"
                  htmlFor={`${idFormulario}-piso`}
                  anotacion={sinLista ? "sin lista" : "derivado"}
                  ayuda={
                    sinLista
                      ? "Sin lista no hay piso por SKU; RN-05 sigue señalando el margen."
                      : `Costo ÷ (1 − ${Math.round(pisoDeMargen * 100)} %), topado a lista.`
                  }
                >
                  <Entrada
                    id={`${idFormulario}-piso`}
                    readOnly
                    tabIndex={-1}
                    value={piso ?? "—"}
                    className="[font-variant-numeric:tabular-nums] bg-superficie-pagina text-texto-tenue"
                  />
                </Campo>
              </div>
            </div>
          ) : (
            <p className="rounded-sm border border-borde bg-superficie-sutil px-4 py-3 text-sm text-texto-tenue">
              Precio y costo solo los edita quien puede ver el costo (INV-02).
            </p>
          )}

          {!esAlta && (
            <Casilla
              name="active"
              value="true"
              defaultChecked={producto?.active}
              etiqueta="Activo en el catálogo"
            />
          )}

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </>
  );
}
