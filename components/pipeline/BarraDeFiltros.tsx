"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Boton } from "@/components/ui/primitivas";
import { Desplegable, ListaDeUno, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeUno, resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";

/**
 * La barra de filtros · §9, AC-23.
 *
 * ## Cada pastilla dice su valor, no su nombre
 *
 * «Cierre estimado · Este trimestre», no «Fecha». Es la corrección de la deuda
 * que AC-23 señala: la pantalla abría filtrada y **no había forma de
 * enterarse**. Una etiqueta genérica repite el problema; una pastilla que
 * enuncia lo que está aplicado convierte la barra en una frase que describe lo
 * que se está viendo.
 *
 * Por eso tampoco hay pastillas escondidas tras un «Más filtros»: las cinco que
 * existen se ven siempre, apagadas cuando no filtran.
 *
 * ## El campo de fecha y el rango se eligen juntos
 *
 * En el mismo desplegable, y no se puede tener uno sin el otro. «Un rango de
 * fechas sin decir sobre qué campo aplica produce números que nadie puede
 * reproducir» (§9.3): separarlos en dos controles es exactamente cómo se
 * termina con un rango aplicado sobre un campo que nadie eligió.
 *
 * ## Borrador y «Aplicar»
 *
 * Los desplegables de varias opciones trabajan sobre un borrador local y
 * navegan una sola vez. Aplicar en cada clic cuesta un viaje al servidor por
 * casilla —cerca de 300 ms cada uno desde México (docs/latencia.md)— y el
 * cursor se mueve mientras la lista se recarga bajo el dedo. Escape cancela el
 * borrador sin tocar la URL.
 *
 * El estado vive en la URL (INV-10): la vista filtrada se pega en un correo y
 * el botón de regresar funciona.
 */
export type { OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";

/** §25 y §27 · un desplegable de varios, como Vendedor. Vacío = solo abiertas. */
const ESTATUS: OpcionDeFiltro[] = [
  { valor: "ABIERTA", etiqueta: "Abiertas" },
  { valor: "GANADA", etiqueta: "Ganadas" },
  { valor: "PERDIDA", etiqueta: "Perdidas" },
];

/** Solo abiertas es el reposo (§9.2): no se escribe en la URL. */
function esEstatusPorOmision(status: string[]): boolean {
  return status.length === 1 && status[0] === "ABIERTA";
}

export type FiltrosActivos = {
  org: string[];
  owner: string[];
  pipeline: string | null;
  dateField: string;
  period: string;
  from: string | null;
  to: string | null;
  atRisk: boolean;
  /** Lo que se muestra; nunca vacío. */
  status: string[];
  /** Categorías de pronóstico (RN-15); vacío = todas. */
  forecast: string[];
};

export type CatalogosDeFiltro = {
  org: OpcionDeFiltro[];
  owner: OpcionDeFiltro[];
  pipeline: OpcionDeFiltro[];
  camposDeFecha: OpcionDeFiltro[];
  preajustes: OpcionDeFiltro[];
  pronostico: OpcionDeFiltro[];
};

export function BarraDeFiltros({
  ruta,
  catalogos,
  activos,
  visibles,
  conservar = {},
}: {
  /** Sin parámetros: la barra reconstruye la URL desde `activos`. */
  ruta: string;
  catalogos: CatalogosDeFiltro;
  activos: FiltrosActivos;
  /** Qué controles ofrece el rol (`filtrosVisibles`). */
  visibles: string[];
  /**
   * Lo que no es filtro y vive en la URL —la vista, la agrupación del
   * forecast— y debe seguir ahí al aplicar o limpiar. Sin esto, cada filtro
   * devolvía al kanban.
   */
  conservar?: Record<string, string>;
}) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState<string | null>(null);

  /**
   * Reescribe la URL desde cero con los filtros dados.
   *
   * Desde cero y no mutando los actuales: así un parámetro que dejó de aplicar
   * —`from` al salir de PERSONALIZADO— desaparece en vez de quedarse pegado en
   * la URL sin efecto visible.
   */
  function navegar(cambio: Partial<FiltrosActivos>, extra?: Record<string, string>) {
    const f = { ...activos, ...cambio };
    const p = new URLSearchParams(conservar);

    for (const id of f.org) p.append("org", id);
    for (const id of f.owner) p.append("owner", id);
    if (f.pipeline) p.set("pipeline", f.pipeline);
    if (f.atRisk) p.set("atRisk", "1");
    if (!esEstatusPorOmision(f.status)) for (const s of f.status) p.append("status", s);
    for (const c of f.forecast) p.append("forecast", c);

    // El campo va siempre que haya recorte de fechas, nunca implícito (§9.3).
    if (f.period !== "PERSONALIZADO" || f.from || f.to) p.set("dateField", f.dateField);
    if (f.period !== "PERSONALIZADO") p.set("period", f.period);
    if (f.period === "PERSONALIZADO") {
      if (f.from) p.set("from", f.from);
      if (f.to) p.set("to", f.to);
    }

    for (const [clave, valor] of Object.entries(extra ?? {})) p.set(clave, valor);

    setAbierto(null);
    const qs = p.toString();
    iniciar(() => router.push(qs ? `${ruta}?${qs}` : ruta));
  }

  const hayFiltros =
    !esEstatusPorOmision(activos.status) ||
    activos.forecast.length > 0 ||
    activos.org.length > 0 ||
    activos.owner.length > 0 ||
    activos.pipeline !== null ||
    activos.atRisk ||
    activos.period !== "PERSONALIZADO" ||
    activos.from !== null ||
    activos.to !== null;

  // Sin caja propia (`contents`): las pastillas participan una por una en la
  // fila de quien monta la barra. Así, cuando dejan de caber, baja solo la que
  // no cabe y el botón de alta se queda al final de la última línea, en vez de
  // que toda la barra salte en bloque y lo deje solo en la suya. Como no hay
  // caja que atenuar mientras se navega, la atenuación va en cada pastilla.
  const atenuado = navegando ? "opacity-60" : undefined;

  return (
    <div className="contents">
      {visibles.includes("pipeline") && catalogos.pipeline.length > 1 && (
        <Desplegable
          className={atenuado}
          etiqueta="Pipeline"
          resumen={resumenDeUno(catalogos.pipeline, activos.pipeline)}
          activo={activos.pipeline !== null}
          abierto={abierto === "pipeline"}
          alAlternar={(v) => setAbierto(v ? "pipeline" : null)}
        >
          <ListaDeUno
            opciones={catalogos.pipeline}
            elegido={activos.pipeline}
            alElegir={(v) => navegar({ pipeline: v })}
          />
        </Desplegable>
      )}

      {visibles.includes("org") && (
        <Desplegable
          className={atenuado}
          etiqueta="Cliente"
          resumen={resumenDeVarios(catalogos.org, activos.org)}
          activo={activos.org.length > 0}
          abierto={abierto === "org"}
          alAlternar={(v) => setAbierto(v ? "org" : null)}
        >
          <ListaDeVarios
            opciones={catalogos.org}
            elegidosAlAbrir={activos.org}
            buscable
            vacio="No hay cuentas dentro de tu alcance."
            alAplicar={(v) => navegar({ org: v })}
          />
        </Desplegable>
      )}

      {/* AC-24 · «Vendedor» no se ofrece a un vendedor: solo hay una opción
          posible y desplegarlo revelaría la lista de compañeros. */}
      {visibles.includes("owner") && (
        <Desplegable
          className={atenuado}
          etiqueta="Vendedor"
          resumen={resumenDeVarios(catalogos.owner, activos.owner)}
          activo={activos.owner.length > 0}
          abierto={abierto === "owner"}
          alAlternar={(v) => setAbierto(v ? "owner" : null)}
        >
          <ListaDeVarios
            opciones={catalogos.owner}
            elegidosAlAbrir={activos.owner}
            vacio="No hay nadie activo en esta oficina."
            alAplicar={(v) => navegar({ owner: v })}
          />
        </Desplegable>
      )}

      <Desplegable
        className={atenuado}
        etiqueta="Lapso"
        resumen={resumenDeLapso(catalogos, activos)}
        activo={activos.period !== "PERSONALIZADO" || activos.from !== null || activos.to !== null}
        abierto={abierto === "lapso"}
        alAlternar={(v) => setAbierto(v ? "lapso" : null)}
        ancho="w-80"
      >
        <SelectorDeLapso
          catalogos={catalogos}
          alAbrir={activos}
          alAplicar={(v) => navegar(v)}
        />
      </Desplegable>

      {visibles.includes("status") && (
        <Desplegable
          className={atenuado}
          etiqueta="Estatus"
          resumen={resumenDeVarios(ESTATUS, activos.status)}
          activo={!esEstatusPorOmision(activos.status)}
          abierto={abierto === "status"}
          alAlternar={(v) => setAbierto(v ? "status" : null)}
        >
          <ListaDeVarios
            opciones={ESTATUS}
            elegidosAlAbrir={activos.status}
            vacio=""
            // Sin nada marcado vuelve al reposo: un tablero sin estatus no enseña nada.
            alAplicar={(v) => navegar({ status: v.length > 0 ? v : ["ABIERTA"] })}
          />
        </Desplegable>
      )}

      {visibles.includes("forecast") && (
        <Desplegable
          className={atenuado}
          etiqueta="Pronóstico"
          resumen={resumenDeVarios(catalogos.pronostico, activos.forecast)}
          activo={activos.forecast.length > 0}
          abierto={abierto === "forecast"}
          alAlternar={(v) => setAbierto(v ? "forecast" : null)}
        >
          <ListaDeVarios
            opciones={catalogos.pronostico}
            elegidosAlAbrir={activos.forecast}
            vacio=""
            alAplicar={(v) => navegar({ forecast: v })}
          />
        </Desplegable>
      )}

      {visibles.includes("atRisk") && (
        <button
          type="button"
          aria-pressed={activos.atRisk}
          onClick={() => navegar({ atRisk: !activos.atRisk })}
          className={clsx(
            "rounded-pill border px-3 py-1.5 text-xs font-medium",
            "transition-colors duration-rapido ease-estandar",
            activos.atRisk
              ? "border-coral bg-coral/10 text-coral"
              : "border-borde bg-superficie-pagina text-texto-tenue hover:bg-superficie-sutil",
            atenuado,
          )}
        >
          Solo en riesgo
        </button>
      )}

      {hayFiltros && (
        <button
          type="button"
          onClick={() => {
            const qs = new URLSearchParams(conservar).toString();
            iniciar(() => router.push(qs ? `${ruta}?${qs}` : ruta));
          }}
          className={clsx(
            "rounded-pill px-2.5 py-1.5 text-xs font-medium text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline",
            atenuado,
          )}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Los resúmenes

function resumenDeLapso(catalogos: CatalogosDeFiltro, activos: FiltrosActivos): string {
  const campo =
    catalogos.camposDeFecha.find((c) => c.valor === activos.dateField)?.etiqueta ?? "Fecha";

  if (activos.period !== "PERSONALIZADO") {
    const preajuste = catalogos.preajustes.find((p) => p.valor === activos.period)?.etiqueta ?? "";
    return `${campo} · ${preajuste.toLocaleLowerCase("es")}`;
  }
  if (activos.from || activos.to) {
    return `${campo} · ${activos.from ?? "…"} a ${activos.to ?? "hoy"}`;
  }
  return "sin recorte";
}

function SelectorDeLapso({
  catalogos,
  // Se desestructuran aquí para dejar claro qué son: los valores con que arranca
  // el borrador, no props controladas. Misma razón que en `ListaDeVarios`: este
  // panel se monta al abrir y se desmonta al cerrar.
  alAbrir: { dateField, period, from, to },
  alAplicar,
}: {
  catalogos: CatalogosDeFiltro;
  alAbrir: Pick<FiltrosActivos, "dateField" | "period" | "from" | "to">;
  alAplicar: (cambio: Partial<FiltrosActivos>) => void;
}) {
  const [campo, setCampo] = useState(dateField);
  const [preajuste, setPreajuste] = useState(period);
  const [desde, setDesde] = useState(from ?? "");
  const [hasta, setHasta] = useState(to ?? "");
  const id = useId();

  const personalizado = preajuste === "PERSONALIZADO";

  return (
    <div className="p-3">
      <p className="eyebrow text-texto-tenue">Sobre qué fecha</p>
      <select
        aria-label="Campo de fecha"
        value={campo}
        onChange={(e) => setCampo(e.target.value)}
        className="mt-1.5 w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring"
      >
        {catalogos.camposDeFecha.map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.etiqueta}
          </option>
        ))}
      </select>

      <p className="eyebrow mt-3 text-texto-tenue">Qué periodo</p>
      <select
        aria-label="Periodo"
        value={preajuste}
        onChange={(e) => setPreajuste(e.target.value)}
        className="mt-1.5 w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring"
      >
        {catalogos.preajustes.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.etiqueta}
          </option>
        ))}
      </select>

      {personalizado && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-desde`} className="eyebrow text-texto-tenue">
              Desde
            </label>
            <input
              id={`${id}-desde`}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="mt-1 w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:shadow-ring"
            />
          </div>
          <div>
            <label htmlFor={`${id}-hasta`} className="eyebrow text-texto-tenue">
              Hasta
            </label>
            <input
              id={`${id}-hasta`}
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="mt-1 w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:shadow-ring"
            />
          </div>
        </div>
      )}


      <div className="mt-3 flex justify-end">
        <Boton
          onClick={() =>
            alAplicar({
              dateField: campo,
              period: preajuste,
              from: personalizado && desde ? desde : null,
              to: personalizado && hasta ? hasta : null,
            })
          }
          className="px-3 py-1 text-xs"
        >
          Aplicar
        </Boton>
      </div>
    </div>
  );
}
