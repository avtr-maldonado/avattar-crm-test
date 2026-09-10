"use client";

import { startTransition, useActionState, useState } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import { problemaDe } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton, Pastilla } from "@/components/ui/primitivas";
import { AvisosDeAccion, Campo, Entrada, Panel, Seleccion } from "@/components/ui/formulario";

type Resultado = ResultadoAccion<{ puntaje?: number; url?: string } | null>;
type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

export type DocumentoDeLista = {
  id: string;
  nombre: string;
  tipo: string;
  esContrato: boolean;
  version: number;
  tamano: string;
  subidoPor: string;
  cuando: string;
};

/**
 * La pestaña de documentos · E2.
 *
 * ## La descarga pasa por el servidor
 *
 * No hay enlace directo al archivo: se pide una **URL firmada de vida corta**,
 * que el servidor emite solo si la sesión alcanza la oportunidad. Un enlace
 * permanente en el HTML sería un enlace que sobrevive al permiso de quien lo
 * copió.
 *
 * ## Los contratos se marcan
 *
 * `DocumentType.isContract` no es una etiqueta: es lo que satisface la compuerta
 * `CONTRATO_O_OC_CARGADO` de la etapa de Cierre. Verlo aquí explica por qué esa
 * compuerta pasa o no pasa.
 */
export function PanelDocumentos({
  opportunityId,
  documentos,
  tipos,
  puedeEditar,
  acciones,
}: {
  opportunityId: string;
  documentos: DocumentoDeLista[];
  tipos: { id: string; name: string }[];
  puedeEditar: boolean;
  acciones: { subir: Accion; descargar: Accion; quitar: Accion };
}) {
  const [subiendo, setSubiendo] = useState(false);

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const cual = String(form.get("__accion") ?? "subir") as keyof typeof acciones;
      const r = await acciones[cual](previo, form);

      if (!r.ok) {
        avisarSiCorresponde(r);
        if (r.motivo === "CONFLICTO") avisar.error("No se pudo", r.problemas[0]?.mensaje);
        return r;
      }

      if (cual === "subir") {
        setSubiendo(false);
        avisar.exito("Documento cargado");
      }
      if (cual === "descargar" && r.datos?.url) {
        // La firma vive diez minutos: se abre en el momento, no se guarda.
        window.open(r.datos.url, "_blank", "noopener,noreferrer");
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

  return (
    <div className="space-y-4">
      {documentos.length === 0 ? (
        <p className="rounded-md border border-borde bg-superficie-tarjeta px-5 py-8 text-center text-sm text-texto-tenue">
          Sin documentos. La propuesta comercial y el contrato u orden de compra son requisitos de
          entrada a Propuesta y a Cierre.
        </p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-texto-titulo">{d.nombre}</p>
                  <Pastilla tono={d.esContrato ? "exito" : "neutro"}>{d.tipo}</Pastilla>
                  {d.version > 1 && (
                    <span className="tabular text-xs text-texto-tenue">v{d.version}</span>
                  )}
                </div>
                <p className="text-xs text-texto-tenue">
                  {d.tamano} · {d.subidoPor} · {d.cuando}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Boton
                  variante="fantasma"
                  disabled={enviando}
                  onClick={() => despachar({ __accion: "descargar", documentId: d.id })}
                >
                  Abrir
                </Boton>
                {puedeEditar && (
                  <button
                    type="button"
                    disabled={enviando}
                    aria-label={`Quitar ${d.nombre}`}
                    onClick={() => despachar({ __accion: "quitar", documentId: d.id })}
                    className="rounded-xs p-1 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-coral focus:shadow-ring focus:outline-none"
                  >
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <Boton variante="secundario" onClick={() => setSubiendo(true)}>
          Cargar documento
        </Boton>
      )}

      <Panel
        titulo="Cargar documento"
        subtitulo="PDF, Word, Excel, PowerPoint, imágenes o texto. Hasta 25 MB."
        abierto={subiendo}
        alCerrar={() => setSubiendo(false)}
        pie={
          <>
            <p className="max-w-xs text-xs leading-snug text-texto-tenue">
              Subir un archivo con el mismo nombre y tipo crea la versión siguiente; no reemplaza
              al anterior.
            </p>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={() => setSubiendo(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" form="cargar-documento" disabled={enviando}>
                {enviando ? "Cargando…" : "Cargar"}
              </Boton>
            </div>
          </>
        }
      >
        <form
          id="cargar-documento"
          className="flex flex-col gap-5"
          action={(datos: FormData) => {
            datos.set("opportunityId", opportunityId);
            datos.set("__accion", "subir");
            startTransition(() => enviar(datos));
          }}
        >
          <Campo etiqueta="Tipo" htmlFor="typeId" problema={problemaDe(resultado, "typeId")}>
            <Seleccion id="typeId" name="typeId" defaultValue={tipos[0]?.id}>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Archivo"
            htmlFor="archivo"
            problema={problemaDe(resultado, "archivo")}
            ayuda="El contrato o la orden de compra son los que abren la etapa de Cierre."
          >
            <Entrada id="archivo" name="archivo" type="file" />
          </Campo>

          <AvisosDeAccion resultado={resultado} />
        </form>
      </Panel>
    </div>
  );
}
