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
 * Alta y edición de un producto · P-06.
 *
 * ## Lo que el formulario dice antes de guardar
 *
 * Precio y costo van juntos o no van (§22): el pie lo dice mientras se captura,
 * para que nadie descubra al guardar que le faltó uno.
 *
 * Y al editar, si se toca precio o costo, se avisa que eso **abre una vigencia
 * nueva** (RN-26): no se corrige la anterior, se cierra. Quien edita tiene que
 * saber que está haciendo historia, no borrando un error de dedo.
 */
export function EditarProducto({
  producto,
  familias,
  puedeVerCosto,
  accion,
}: {
  /** Sin producto, el formulario da de alta. */
  producto?: ProductoDelFormulario;
  familias: { id: string; name: string }[];
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
  // Los dos vacíos = sin lista (§22): precio y costo se fijan en cada cotización.

  return (
    <>
      <Boton variante={esAlta ? "primario" : "fantasma"} onClick={() => setAbierto(true)}>
        {esAlta ? "Nuevo producto" : "Editar"}
      </Boton>

      <Panel
        titulo={esAlta ? "Nuevo producto" : "Editar producto"}
        subtitulo={esAlta ? undefined : producto?.sku}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancho="lg"
        pie={
          <>
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

              </div>
            </div>
          ) : (
            <p className="rounded-sm border border-borde bg-superficie-sutil px-4 py-3 text-sm text-texto-tenue">
              Precio y costo solo los edita quien puede ver el costo.
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
