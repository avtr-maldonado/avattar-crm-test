"use client";

import Decimal from "decimal.js";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Avatar, Boton } from "@/components/ui/primitivas";
import { Seleccion } from "@/components/ui/formulario";
import { iniciales } from "@/lib/etiquetas";

export type FilaDeObjetivos = {
  userId: string;
  nombre: string;
  iniciales: string;
  /** Q1 a Q4, como cadenas sin formato: «260000». */
  cuotas: string[];
  esQuienMira: boolean;
};

export type CandidatoAObjetivo = { id: string; nombre: string };

type Resultado = ResultadoAccion<{ cambios: number }>;

const USD = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

/** Lo tecleado, como importe. Vacío o ilegible es cero. Sin `number` (INV-03). */
function leer(texto: string): Decimal {
  const limpio = texto.trim().replace(/,/g, "");
  if (limpio === "") return new Decimal(0);
  try {
    const d = new Decimal(limpio);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function usd(d: Decimal): string {
  return USD.format(d.toString() as unknown as number);
}

const CEROS = ["0", "0", "0", "0"];
const TRIMESTRES = [1, 2, 3, 4] as const;

function totalDe(f: FilaDeObjetivos): Decimal {
  return f.cuotas.reduce((acc, c) => acc.plus(leer(c)), new Decimal(0));
}

/**
 * Objetivos por vendedor y trimestre · P-08, decisiones §34.
 *
 * La hoja del negocio, tal cual: una fila por vendedor, Q1 a Q4 y el total
 * anual, con «Total compañía» abajo. Quien fija cuotas (`EDITAR_CATALOGOS`)
 * teclea en las celdas y guarda **una vez**; los demás la leen. Se agrega a
 * quien no tiene fila y se elimina a quien sobra; nada viaja hasta pulsar
 * «Guardar cambios», y solo viaja lo que cambió.
 *
 * Las sumas se hacen con `decimal.js` —la misma librería que Prisma— para
 * que el total que se ve sea el que el servidor va a guardar.
 */
export function TablaDeObjetivos({
  filas: filasIniciales,
  candidatos,
  puedeFijar,
  pais,
  anio,
  metrica,
  accion,
}: {
  filas: FilaDeObjetivos[];
  /** Quién opera en el país y todavía no tiene fila. */
  candidatos: CandidatoAObjetivo[];
  puedeFijar: boolean;
  pais: string;
  anio: number;
  metrica: "VENTA" | "UTILIDAD";
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<FilaDeObjetivos[]>(() =>
    filasIniciales.map((f) => ({ ...f, cuotas: [...f.cuotas] })),
  );
  const [eliminados, setEliminados] = useState<string[]>([]);
  const [candidato, setCandidato] = useState("");
  const yaAtendido = useRef<Resultado | null>(null);

  const [resultado, enviar, enviando] = useActionState(accion, null);

  useEffect(() => {
    if (!resultado || yaAtendido.current === resultado) return;
    yaAtendido.current = resultado;
    if (!resultado.ok) {
      avisarSiCorresponde(resultado);
      return;
    }
    avisar.exito(
      resultado.datos.cambios === 0 ? "Nada que guardar" : "Objetivos guardados",
      resultado.datos.cambios === 0
        ? "Ninguna cuota cambió de valor."
        : `${resultado.datos.cambios} ${resultado.datos.cambios === 1 ? "cuota" : "cuotas"} en la bitácora.`,
    );
    // La página relee y remonta esta tabla con lo guardado como punto de partida.
    router.refresh();
  }, [resultado, router]);

  const originales = new Map(filasIniciales.map((f) => [f.userId, f.cuotas.join("|")]));
  const cambiadas = filas.filter((f) => originales.get(f.userId) !== f.cuotas.join("|"));
  const sucio = cambiadas.length > 0 || eliminados.length > 0;

  const porTrimestre = TRIMESTRES.map((q) =>
    filas.reduce((acc, f) => acc.plus(leer(f.cuotas[q - 1] ?? "0")), new Decimal(0)),
  );
  const totalCompania = porTrimestre.reduce((acc, t) => acc.plus(t), new Decimal(0));

  const enFilas = new Set(filas.map((f) => f.userId));
  const elegibles = candidatos.filter((c) => !enFilas.has(c.id));

  function teclear(userId: string, i: number, valor: string) {
    setFilas((previas) =>
      previas.map((f) => (f.userId === userId ? { ...f, cuotas: f.cuotas.map((c, j) => (j === i ? valor : c)) } : f)),
    );
  }

  function agregar() {
    const c = candidatos.find((x) => x.id === candidato);
    if (!c) return;
    setFilas((previas) => [
      ...previas,
      { userId: c.id, nombre: c.nombre, iniciales: iniciales(c.nombre), cuotas: [...CEROS], esQuienMira: false },
    ]);
    setEliminados((previos) => previos.filter((id) => id !== c.id));
    setCandidato("");
  }

  function eliminar(userId: string) {
    setFilas((previas) => previas.filter((f) => f.userId !== userId));
    if (originales.has(userId)) setEliminados((previos) => [...new Set([...previos, userId])]);
  }

  function descartar() {
    setFilas(filasIniciales.map((f) => ({ ...f, cuotas: [...f.cuotas] })));
    setEliminados([]);
  }

  // Los problemas nombran la celda en el texto («Q2: la utilidad…»), así que
  // van todos en una sola lista: no hay un campo por celda al que colgarlos.
  const problemas =
    resultado && !resultado.ok && resultado.motivo !== "AUTORIZACION" && resultado.motivo !== "CONFLICTO"
      ? [...new Set(resultado.problemas.map((p) => p.mensaje))]
      : [];

  const cambios = JSON.stringify({
    filas: cambiadas.map((f) => ({ userId: f.userId, cuotas: f.cuotas.map((c) => c.trim() || "0") })),
    eliminar: eliminados,
  });

  return (
    <form action={enviar} className="rounded-md border border-borde bg-superficie-tarjeta">
      <input type="hidden" name="countryCode" value={pais} />
      <input type="hidden" name="fiscalYear" value={anio} />
      <input type="hidden" name="metrica" value={metrica} />
      <input type="hidden" name="cambios" value={cambios} />

      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-texto-titulo">Objetivos por vendedor y trimestre</h2>
        </div>
        {puedeFijar && elegibles.length > 0 && (
          <div className="flex items-center gap-2">
            <Seleccion
              aria-label="Vendedor por agregar"
              value={candidato}
              onChange={(e) => setCandidato(e.target.value)}
              className="w-56"
            >
              <option value="">Elegir vendedor…</option>
              {elegibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Seleccion>
            <Boton
              variante="secundario"
              type="button"
              onClick={agregar}
              disabled={candidato === ""}
              className="whitespace-nowrap"
            >
              + Agregar vendedor
            </Boton>
          </div>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-texto-tenue">
          {puedeFijar
            ? "Nadie tiene cuota este año. Agrega al primer vendedor y captura sus cuatro trimestres."
            : "Nadie tiene cuota fijada este año todavía."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-borde text-left">
                <Th>Vendedor</Th>
                <Th alineada>Q1</Th>
                <Th alineada>Q2</Th>
                <Th alineada>Q3</Th>
                <Th alineada>Q4</Th>
                <Th alineada>Total anual</Th>
                {puedeFijar && <Th alineada>&nbsp;</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f) => (
                <tr
                  key={f.userId}
                  className={clsx(
                    "transition-colors duration-rapido hover:bg-superficie-sutil",
                    f.esQuienMira && "bg-superficie-tinte",
                  )}
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar iniciales={f.iniciales} />
                      <span className="truncate font-medium text-texto-titulo">{f.nombre}</span>
                    </div>
                  </td>
                  {TRIMESTRES.map((q) => {
                    const c = f.cuotas[q - 1] ?? "0";
                    return (
                      <td key={q} className="tabular px-3 py-1.5 text-right">
                        {puedeFijar ? (
                          <CeldaDeCuota
                            valor={c}
                            etiqueta={`${f.nombre} · Q${q}`}
                            alCambiar={(v) => teclear(f.userId, q - 1, v)}
                          />
                        ) : (
                          <span className={leer(c).isZero() ? "text-texto-tenue" : "text-texto-cuerpo"}>
                            {usd(leer(c))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="tabular px-5 py-2 text-right font-semibold text-texto-titulo">
                    {usd(totalDe(f))}
                  </td>
                  {puedeFijar && (
                    <td className="px-5 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => eliminar(f.userId)}
                        className="text-xs text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-coral hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borde-fuerte bg-superficie-sutil font-semibold">
                <td className="px-5 py-2.5 text-texto-titulo">Total compañía</td>
                {TRIMESTRES.map((q) => (
                  <td key={q} className="tabular px-3 py-2.5 pr-5 text-right text-texto-titulo">
                    {usd(porTrimestre[q - 1]!)}
                  </td>
                ))}
                <td className="tabular px-5 py-2.5 text-right text-texto-titulo">{usd(totalCompania)}</td>
                {puedeFijar && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {problemas.length > 0 && (
        <ul role="alert" className="mx-5 mb-3 mt-3 list-disc rounded-sm border border-peligro bg-coral/[0.06] py-2.5 pl-8 pr-3.5 text-sm text-texto-cuerpo">
          {problemas.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {puedeFijar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde bg-superficie-sutil px-5 py-3">
          <p className="text-xs text-texto-tenue">
            {sucio ? `${cambiadas.length + eliminados.length} ${cambiadas.length + eliminados.length === 1 ? "fila" : "filas"} con cambios sin guardar.` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={descartar} disabled={!sucio || enviando}>
              Descartar
            </Boton>
            <Boton type="submit" disabled={!sucio || enviando}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Una celda de la hoja: en reposo muestra la cifra con separadores («260,000»),
 * al entrar deja los dígitos limpios para teclear. Lo que se guarda en el
 * estado nunca lleva comas: es lo que viaja al servidor tal cual.
 */
function CeldaDeCuota({
  valor,
  etiqueta,
  alCambiar,
}: {
  valor: string;
  etiqueta: string;
  alCambiar: (v: string) => void;
}) {
  const [enFoco, setEnFoco] = useState(false);
  const visible = enFoco ? valor : conSeparadores(valor);
  return (
    <input
      inputMode="decimal"
      aria-label={etiqueta}
      value={visible}
      onFocus={() => setEnFoco(true)}
      onBlur={() => setEnFoco(false)}
      onChange={(e) => alCambiar(e.target.value.replace(/,/g, ""))}
      className="w-28 rounded-sm border border-transparent bg-transparent px-2 py-1 text-right text-texto-cuerpo outline-none transition-colors duration-rapido hover:border-borde focus:border-acento focus:bg-superficie-pagina focus:shadow-ring"
    />
  );
}

const SEPARADORES = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

function conSeparadores(texto: string): string {
  const limpio = texto.trim();
  if (limpio === "" || !/^\d+(\.\d{1,4})?$/.test(limpio)) return texto;
  return SEPARADORES.format(limpio as unknown as number);
}

function Th({ children, alineada = false }: { children: React.ReactNode; alineada?: boolean }) {
  return (
    <th className={clsx("eyebrow px-5 py-2.5 font-medium", alineada && "text-right")}>{children}</th>
  );
}
