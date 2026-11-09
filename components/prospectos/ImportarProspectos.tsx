"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import type { FilaValidada } from "@/lib/domain/leadImport";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { AvisosDeAccion, Panel, useResultadoVivo } from "@/components/ui/formulario";

export type ResultadoDePrevisualizacion = ResultadoAccion<{ filas: FilaValidada[] }>;
export type ResultadoDeImportacion = ResultadoAccion<{ creados: number; ids: string[] }>;

/**
 * Importar prospectos desde CSV, en dos pasos · decisiones §58. Primero el
 * archivo se lee en el servidor y vuelve fila por fila con lo que está bien y
 * lo que no; después «Importar N válidos» crea solo esos. Lo que no pasa se ve
 * con su fila y su razón, para corregir el archivo y volver a subirlo.
 */
export function ImportarProspectos({
  previsualizar,
  importar,
}: {
  previsualizar: (previo: ResultadoDePrevisualizacion | null, form: FormData) => Promise<ResultadoDePrevisualizacion>;
  importar: (previo: ResultadoDeImportacion | null, form: FormData) => Promise<ResultadoDeImportacion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<FilaValidada[] | null>(null);
  const id = useId();
  const idRevisar = `${id}-revisar`;
  const idImportar = `${id}-importar`;

  const [vistaPrevia, revisar, revisando] = useActionState(async (previo: ResultadoDePrevisualizacion | null, form: FormData) => {
    const r = await previsualizar(previo, form);
    if (r.ok) setFilas(r.datos.filas);
    else avisarSiCorresponde(r);
    return r;
  }, null);

  const [resultadoCrudo, confirmar, importando] = useActionState(async (previo: ResultadoDeImportacion | null, form: FormData) => {
    const r = await importar(previo, form);
    if (!r.ok) {
      avisarSiCorresponde(r);
      return r;
    }
    cerrar();
    avisar.exito(r.datos.creados === 1 ? "1 prospecto importado" : `${r.datos.creados} prospectos importados`);
    return r;
  }, null);
  const resultado = useResultadoVivo(resultadoCrudo, abierto);
  const problemaDeArchivo = useResultadoVivo(vistaPrevia, abierto);

  const validas = filas?.filter((f) => f.datos) ?? [];
  const invalidas = filas?.filter((f) => !f.datos) ?? [];

  function cerrar() {
    setFilas(null);
    setAbierto(false);
  }

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Importar
      </Boton>
      <Panel
        titulo="Importar prospectos"
        subtitulo={filas ? `${validas.length} ${validas.length === 1 ? "válido" : "válidos"} · ${invalidas.length} con problemas` : undefined}
        abierto={abierto}
        alCerrar={cerrar}
        ancho="lg"
        pie={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Link href="/prospectos/plantilla" prefetch={false} className="text-xs text-texto-tenue underline-offset-2 hover:underline">
              Descargar plantilla
            </Link>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              {filas ? (
                <Boton type="submit" form={idImportar} disabled={importando || validas.length === 0}>
                  {importando ? "Importando…" : `Importar ${validas.length} ${validas.length === 1 ? "válido" : "válidos"}`}
                </Boton>
              ) : (
                <Boton type="submit" form={idRevisar} disabled={revisando}>
                  {revisando ? "Leyendo…" : "Revisar archivo"}
                </Boton>
              )}
            </div>
          </div>
        }
      >
        {!filas ? (
          <form id={idRevisar} action={revisar} className="flex flex-col gap-4">
            <label htmlFor={`${id}-archivo`} className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-borde-fuerte px-6 py-10 text-center text-sm text-texto-cuerpo hover:bg-superficie-sutil">
              <span className="font-medium text-texto-titulo">Elige el archivo CSV</span>
              <span className="text-xs text-texto-tenue">Contacto, correo, teléfono, cargo, empresa, giro, país, canal, campaña, puntaje, notas</span>
              <input id={`${id}-archivo`} name="archivo" type="file" accept=".csv,text/csv" required className="mt-2 text-xs" />
            </label>
            <AvisosDeAccion resultado={problemaDeArchivo && !problemaDeArchivo.ok ? problemaDeArchivo : null} />
          </form>
        ) : (
          <form id={idImportar} action={confirmar} className="flex flex-col gap-4">
            <input type="hidden" name="filas" value={JSON.stringify(validas.map((f) => f.datos))} />
            <div className="max-h-[55vh] overflow-auto rounded-md border border-borde">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-superficie-sutil">
                  <tr className="text-left">
                    <th className="eyebrow px-3 py-2 font-medium">Fila</th>
                    <th className="eyebrow px-3 py-2 font-medium">Prospecto</th>
                    <th className="eyebrow px-3 py-2 font-medium">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.fila} className={clsx("border-t border-borde", !f.datos && "bg-coral/[0.04]")}>
                      <td className="tabular px-3 py-2 text-texto-tenue">{f.fila}</td>
                      <td className="px-3 py-2 text-texto-titulo">{f.resumen}</td>
                      <td className="px-3 py-2">
                        {f.datos ? (
                          <span className="text-xs font-medium text-exito">Lista</span>
                        ) : (
                          <ul className="text-xs text-coral">
                            {f.problemas.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setFilas(null)} className="self-start text-xs text-texto-tenue underline-offset-2 hover:underline">
              Elegir otro archivo
            </button>
            <AvisosDeAccion resultado={resultado} />
          </form>
        )}
      </Panel>
    </>
  );
}
