"use client";

import Decimal from "decimal.js";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Avatar, Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import { Seleccion } from "@/components/ui/formulario";
import { iniciales } from "@/lib/etiquetas";
import { conflictosDeMargen, leerCuota, type ConflictoDeMargen } from "./margen";
import {
  SIN_VINCULO,
  alternarTodos,
  alternarUno,
  estanTodos,
  hayVinculo,
  teclearConVinculo,
} from "./vinculos";

export type FilaDeObjetivos = {
  userId: string;
  nombre: string;
  iniciales: string;
  /** Q1 a Q4, como cadenas sin formato: «260000». */
  cuotas: string[];
  /** Lo guardado en la OTRA métrica, trimestre a trimestre · §54. La hoja
   *  captura una a la vez, pero el margen compara las dos. */
  contraparte: string[];
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

function usd(d: Decimal): string {
  return USD.format(d.toString() as unknown as number);
}

const CEROS = ["0", "0", "0", "0"];
const TRIMESTRES = [1, 2, 3, 4] as const;

function totalDe(f: FilaDeObjetivos): Decimal {
  return f.cuotas.reduce((acc, c) => acc.plus(leerCuota(c)), new Decimal(0));
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
  // Qué trimestres van atados, por vendedor · §53. Ayuda de captura, no dato:
  // no viaja al servidor. La tabla se remonta al cambiar de métrica o de año
  // (la `key` de la pantalla), así que el vínculo dura lo que dura la hoja.
  const [vinculos, setVinculos] = useState<Record<string, boolean[]>>({});
  const vinculosDe = (userId: string) => vinculos[userId] ?? SIN_VINCULO;
  const [candidato, setCandidato] = useState("");
  // El veredicto del servidor que ya no vale · §54. Se descarta al descartar y
  // al teclear: en cuanto las cifras cambian, lo que dijo era sobre otras.
  const [descartado, setDescartado] = useState<Resultado | null>(null);
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
    filas.reduce((acc, f) => acc.plus(leerCuota(f.cuotas[q - 1] ?? "0")), new Decimal(0)),
  );
  const totalCompania = porTrimestre.reduce((acc, t) => acc.plus(t), new Decimal(0));

  const enFilas = new Set(filas.map((f) => f.userId));
  const elegibles = candidatos.filter((c) => !enFilas.has(c.id));

  function teclear(userId: string, i: number, valor: string) {
    setDescartado(resultado);
    const vinculados = vinculosDe(userId);
    setFilas((previas) =>
      previas.map((f) =>
        f.userId === userId ? { ...f, cuotas: teclearConVinculo(f.cuotas, vinculados, i, valor) } : f,
      ),
    );
  }

  /** El eslabón de la fila: ata los cuatro trimestres o los suelta. */
  function alternarFila(userId: string) {
    setVinculos((previos) => ({ ...previos, [userId]: alternarTodos(previos[userId] ?? SIN_VINCULO) }));
  }

  /** El eslabón de una celda: suelta o vuelve a atar ese trimestre solo. */
  function alternarTrimestre(userId: string, i: number) {
    setVinculos((previos) => ({ ...previos, [userId]: alternarUno(previos[userId] ?? SIN_VINCULO, i) }));
  }

  function agregar() {
    const c = candidatos.find((x) => x.id === candidato);
    if (!c) return;
    setFilas((previas) => [
      ...previas,
      {
        userId: c.id,
        nombre: c.nombre,
        iniciales: iniciales(c.nombre),
        cuotas: [...CEROS],
        contraparte: [...CEROS],
        esQuienMira: false,
      },
    ]);
    setEliminados((previos) => previos.filter((id) => id !== c.id));
    setCandidato("");
  }

  function eliminar(userId: string) {
    setFilas((previas) => previas.filter((f) => f.userId !== userId));
    // Se quita su vínculo: si vuelve a agregarse, empieza suelto.
    setVinculos((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== userId)));
    if (originales.has(userId)) setEliminados((previos) => [...new Set([...previos, userId])]);
  }

  function descartar() {
    setFilas(filasIniciales.map((f) => ({ ...f, cuotas: [...f.cuotas] })));
    setEliminados([]);
    setVinculos({});
    setDescartado(resultado);
  }

  // El margen arriba del 100 %, evaluado sobre lo que hay en pantalla · §54.
  // Antes solo lo sabía el servidor, así que el aviso aparecía al guardar, no
  // decía de quién y se quedaba ahí aunque ya se hubiera corregido.
  const conflictos = conflictosDeMargen(filas, metrica);
  const trimestresEnConflicto = new Map(conflictos.map((x) => [x.userId, new Set(x.trimestres)]));

  // Los problemas del servidor nombran la celda en el texto, así que van todos
  // en una sola lista: no hay un campo por celda al que colgarlos. El veredicto
  // descartado no cuenta: era sobre cifras que ya cambiaron.
  const vivo = resultado === descartado ? null : resultado;
  const problemas =
    vivo && !vivo.ok && vivo.motivo !== "AUTORIZACION" && vivo.motivo !== "CONFLICTO"
      ? [...new Set(vivo.problemas.map((p) => p.mensaje))]
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
                <FilaDeLaHoja
                  key={f.userId}
                  f={f}
                  puedeFijar={puedeFijar}
                  vinculados={vinculosDe(f.userId)}
                  enConflicto={trimestresEnConflicto.get(f.userId)}
                  alTeclear={teclear}
                  alAtarFila={alternarFila}
                  alAtarTrimestre={alternarTrimestre}
                  alEliminar={eliminar}
                />
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

      <AvisoDeLaHoja conflictos={conflictos} problemas={problemas} />

      {puedeFijar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde bg-superficie-sutil px-5 py-3">
          <p className="text-xs text-texto-tenue">
            {sucio ? `${cambiadas.length + eliminados.length} ${cambiadas.length + eliminados.length === 1 ? "fila" : "filas"} con cambios sin guardar.` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Boton variante="fantasma" type="button" onClick={descartar} disabled={!sucio || enviando}>
              Descartar
            </Boton>
            {/* Un botón que el servidor va a rechazar no se ofrece: con margen
                arriba del 100 % la hoja entera se rechaza, no solo esa fila. */}
            <Boton type="submit" disabled={!sucio || enviando || conflictos.length > 0}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Una fila de la hoja: el vendedor, sus cuatro trimestres y su total.
 *
 * Sale del cuerpo de la tabla porque ahí dentro conviven tres cosas —la
 * captura, los eslabones de §53 y las marcas de §54— y juntas ya no se leían.
 */
function FilaDeLaHoja({
  f,
  puedeFijar,
  vinculados,
  enConflicto,
  alTeclear,
  alAtarFila,
  alAtarTrimestre,
  alEliminar,
}: {
  f: FilaDeObjetivos;
  puedeFijar: boolean;
  vinculados: readonly boolean[];
  /** Los trimestres de esta fila que piden margen arriba del 100 %. */
  enConflicto: Set<number> | undefined;
  alTeclear: (userId: string, i: number, valor: string) => void;
  alAtarFila: (userId: string) => void;
  alAtarTrimestre: (userId: string, i: number) => void;
  alEliminar: (userId: string) => void;
}) {
  return (
    <tr
                        className={clsx(
                "transition-colors duration-rapido hover:bg-superficie-sutil",
                f.esQuienMira && "bg-superficie-tinte",
              )}
            >
              <td className="px-5 py-2">
                <div className="flex items-center gap-2.5">
                  <Avatar iniciales={f.iniciales} />
                  <span className="truncate font-medium text-texto-titulo">{f.nombre}</span>
                  {puedeFijar && (
                    <BotonDeVinculo
                      atado={estanTodos(vinculados)}
                      etiqueta={`Atar los cuatro trimestres de ${f.nombre}`}
                      alPulsar={() => alAtarFila(f.userId)}
                      className="ml-auto"
                    />
                  )}
                </div>
              </td>
              {TRIMESTRES.map((q) => {
                const c = f.cuotas[q - 1] ?? "0";
                return (
                  <td key={q} className="tabular px-3 py-1.5 text-right">
                    {puedeFijar ? (
                      <div className="flex items-center justify-end gap-1">
                        {/* El eslabón de celda aparece solo cuando la fila usa el
                            control: una fila que nunca lo tocó se ve como siempre. */}
                        {hayVinculo(vinculados) && (
                          <BotonDeVinculo
                            atado={vinculados[q - 1] ?? false}
                            etiqueta={`${vinculados[q - 1] ? "Soltar" : "Atar"} el Q${q} de ${f.nombre}`}
                            alPulsar={() => alAtarTrimestre(f.userId, q - 1)}
                          />
                        )}
                        <CeldaDeCuota
                          valor={c}
                          etiqueta={`${f.nombre} · Q${q}`}
                          atado={vinculados[q - 1] ?? false}
                          problema={enConflicto?.has(q) ?? false}
                          alCambiar={(v) => alTeclear(f.userId, q - 1, v)}
                        />
                      </div>
                    ) : (
                      <span className={leerCuota(c).isZero() ? "text-texto-tenue" : "text-texto-cuerpo"}>
                        {usd(leerCuota(c))}
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
                    onClick={() => alEliminar(f.userId)}
                    className="text-xs text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-coral hover:underline"
                  >
                    Eliminar
                  </button>
                </td>
              )}
            </tr>
  );
}

/**
 * Lo que impide guardar, debajo de la hoja · §54.
 *
 * Dos orígenes en un solo lugar: el margen arriba del 100 %, que se calcula
 * aquí y nombra a cada vendedor con sus trimestres, y lo que el servidor haya
 * rechazado, que nombra la celda en su propio texto.
 */
function AvisoDeLaHoja({
  conflictos,
  problemas,
}: {
  conflictos: ConflictoDeMargen[];
  problemas: string[];
}) {
  if (conflictos.length === 0 && problemas.length === 0) return null;

  return (
    <div
      role="alert"
      className="mx-5 mb-3 mt-3 rounded-sm border border-peligro bg-coral/[0.06] px-3.5 py-2.5 text-sm text-texto-cuerpo"
    >
      {conflictos.length > 0 && (
        <>
          <p>La utilidad no puede ser mayor que la venta: sería un margen arriba del 100 %.</p>
          <ul className="mt-1.5 list-disc pl-5">
            {conflictos.map((x) => (
              <li key={x.userId}>
                <span className="font-medium text-texto-titulo">{x.nombre}</span> ·{" "}
                {x.trimestres.map((q) => `Q${q}`).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {problemas.length > 0 && (
        <ul className={clsx("list-disc pl-5", conflictos.length > 0 && "mt-2")}>
          {problemas.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
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
  atado = false,
  problema = false,
  alCambiar,
}: {
  valor: string;
  etiqueta: string;
  /** Atado al resto de la fila (§53): se marca para que no sorprenda que cambien juntos. */
  atado?: boolean;
  /** Pide margen arriba del 100 % (§54): se señala la celda, no solo el aviso de abajo. */
  problema?: boolean;
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
      className={clsx(
        "w-28 rounded-sm border px-2 py-1 text-right text-texto-cuerpo outline-none transition-colors duration-rapido hover:border-borde focus:border-acento focus:bg-superficie-pagina focus:shadow-ring",
        problema
          ? "border-peligro bg-coral/[0.06]"
          : atado
            ? "border-acento/40 bg-acento/[0.05]"
            : "border-transparent bg-transparent",
      )}
    />
  );
}

/**
 * El eslabón · §53. El mismo botón para la fila y para la celda: lo que cambia
 * es a qué se aplica, y eso lo dice su etiqueta.
 */
function BotonDeVinculo({
  atado,
  etiqueta,
  alPulsar,
  className,
}: {
  atado: boolean;
  etiqueta: string;
  alPulsar: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-pressed={atado}
      aria-label={etiqueta}
      title={etiqueta}
      className={clsx(
        "rounded-sm p-1 transition-colors duration-rapido focus:shadow-ring focus:outline-none",
        atado ? "text-acento hover:bg-acento/10" : "text-texto-tenue hover:bg-superficie-sutil hover:text-texto-cuerpo",
        className,
      )}
    >
      <Icono nombre={atado ? "vinculo" : "vinculoRoto"} className="size-4" />
    </button>
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
