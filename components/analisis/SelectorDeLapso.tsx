"use client";

import { useState } from "react";
import clsx from "clsx";
import { Boton, ControlSegmentado } from "@/components/ui/primitivas";
import { MES_CORTO } from "@/lib/tiempo";
import { esFechaDePared, TIPOS_DE_LAPSO, type Lapso, type TipoDeLapso } from "@/lib/filters/lapso";

const TRIMESTRES = [1, 2, 3, 4] as const;

/** El año con el que arranca el selector: el del lapso aplicado. */
function anioDe(l: Lapso): number {
  switch (l.tipo) {
    case "anio":
    case "trimestre":
      return l.fiscalYear;
    case "mes":
      return l.anio;
    case "rango":
      return Number(l.desde.slice(0, 4));
  }
}

/**
 * El contenido de la pastilla «Lapso» de Análisis (decisiones §45): cuatro
 * modos en un conmutador —año fiscal, trimestre fiscal, mes, rango— y debajo
 * lo que cada uno pide. Año, trimestre y mes aplican al pulsar; el rango, con
 * «Aplicar» cuando las dos fechas existen y van en orden.
 *
 * Como `ListaDeVarios`, se monta al abrir y se desmonta al cerrar: el borrador
 * nace del lapso aplicado y no sobrevive a un cambio.
 */
export function SelectorDeLapso({ lapso, anios, alAplicar }: { lapso: Lapso; anios: number[]; alAplicar: (l: Lapso) => void }) {
  const [tipo, setTipo] = useState<TipoDeLapso>(() => lapso.tipo);
  const [anio, setAnio] = useState(() => anioDe(lapso));
  const [desde, setDesde] = useState(() => (lapso.tipo === "rango" ? lapso.desde : ""));
  const [hasta, setHasta] = useState(() => (lapso.tipo === "rango" ? lapso.hasta : ""));
  const rangoValido = esFechaDePared(desde) && esFechaDePared(hasta) && desde <= hasta;

  const opcionesDeAnio = anios.map((a) => ({ valor: String(a), etiqueta: String(a) }));
  const anioComoTexto = String(anio);

  return (
    <div className="space-y-3 p-3">
      <ControlSegmentado opciones={TIPOS_DE_LAPSO} activa={tipo} alElegir={setTipo} />

      {tipo === "anio" ? (
        <ul className="-mx-1">
          {anios.map((a) => {
            const elegido = lapso.tipo === "anio" && lapso.fiscalYear === a;
            return (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => alAplicar({ tipo: "anio", fiscalYear: a })}
                  className={clsx(
                    "tabular flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-sm transition-colors duration-rapido hover:bg-superficie-sutil",
                    elegido ? "font-medium text-texto-titulo" : "text-texto-cuerpo",
                  )}
                >
                  Año fiscal {a}
                  {elegido ? <span className="text-acento">✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tipo === "trimestre" || tipo === "mes" ? (
        <ControlSegmentado opciones={opcionesDeAnio} activa={anioComoTexto} alElegir={(v) => setAnio(Number(v))} />
      ) : null}

      {tipo === "trimestre" ? (
        <div className="grid grid-cols-4 gap-1.5">
          {TRIMESTRES.map((q) => (
            <Ficha
              key={q}
              elegida={lapso.tipo === "trimestre" && lapso.fiscalYear === anio && lapso.quarter === q}
              onClick={() => alAplicar({ tipo: "trimestre", fiscalYear: anio, quarter: q })}
            >
              Q{q}
            </Ficha>
          ))}
        </div>
      ) : null}

      {tipo === "mes" ? (
        <div className="grid grid-cols-4 gap-1.5">
          {MES_CORTO.map((m, i) => (
            <Ficha
              key={m}
              elegida={lapso.tipo === "mes" && lapso.anio === anio && lapso.mes === i + 1}
              onClick={() => alAplicar({ tipo: "mes", anio, mes: i + 1 })}
            >
              {m}
            </Ficha>
          ))}
        </div>
      ) : null}

      {tipo === "rango" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Fecha etiqueta="Del" valor={desde} alCambiar={setDesde} />
            <Fecha etiqueta="Al" valor={hasta} alCambiar={setHasta} />
          </div>
          <div className="flex justify-end">
            <Boton disabled={!rangoValido} onClick={() => rangoValido && alAplicar({ tipo: "rango", desde, hasta })} className="px-3 py-1 text-xs">
              Aplicar
            </Boton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Ficha({ elegida, onClick, children }: { elegida: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={onClick}
      className={clsx(
        "tabular rounded-sm border px-2 py-1.5 text-sm transition-colors duration-rapido focus:shadow-ring focus:outline-none",
        elegida ? "border-acento bg-superficie-tinte font-medium text-texto-titulo" : "border-borde text-texto-cuerpo hover:bg-superficie-sutil",
      )}
    >
      {children}
    </button>
  );
}

function Fecha({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: string; alCambiar: (v: string) => void }) {
  return (
    <label className="block text-xs text-texto-tenue">
      {etiqueta}
      <input
        type="date"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="tabular mt-1 w-full rounded-sm border border-borde bg-superficie-pagina px-2 py-1.5 text-sm text-texto-cuerpo outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring"
      />
    </label>
  );
}
