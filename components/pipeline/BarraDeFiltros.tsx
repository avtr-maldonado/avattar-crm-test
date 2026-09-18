"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Boton } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";

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
export type OpcionDeFiltro = { valor: string; etiqueta: string };

export type FiltrosActivos = {
  org: string[];
  owner: string[];
  pipeline: string | null;
  dateField: string;
  period: string;
  from: string | null;
  to: string | null;
  atRisk: boolean;
};

export type CatalogosDeFiltro = {
  org: OpcionDeFiltro[];
  owner: OpcionDeFiltro[];
  pipeline: OpcionDeFiltro[];
  camposDeFecha: OpcionDeFiltro[];
  preajustes: OpcionDeFiltro[];
};

export function BarraDeFiltros({
  ruta,
  catalogos,
  activos,
  visibles,
}: {
  /** Sin parámetros: la barra reconstruye la URL desde `activos`. */
  ruta: string;
  catalogos: CatalogosDeFiltro;
  activos: FiltrosActivos;
  /** Qué controles ofrece el rol (`filtrosVisibles`). */
  visibles: string[];
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
    const p = new URLSearchParams();

    for (const id of f.org) p.append("org", id);
    for (const id of f.owner) p.append("owner", id);
    if (f.pipeline) p.set("pipeline", f.pipeline);
    if (f.atRisk) p.set("atRisk", "1");

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
          onClick={() => iniciar(() => router.push(ruta))}
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

function resumenDeUno(opciones: OpcionDeFiltro[], elegido: string | null): string {
  if (!elegido) return "todos";
  return opciones.find((o) => o.valor === elegido)?.etiqueta ?? "uno";
}

function resumenDeVarios(opciones: OpcionDeFiltro[], elegidos: string[]): string {
  if (elegidos.length === 0) return "todos";
  if (elegidos.length === 1) {
    return opciones.find((o) => o.valor === elegidos[0])?.etiqueta ?? "1 elegido";
  }
  return `${elegidos.length} elegidos`;
}

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

// ───────────────────────────────────────────────────────────── La pastilla

function Desplegable({
  etiqueta,
  resumen,
  activo,
  abierto,
  alAlternar,
  ancho = "w-72",
  className,
  children,
}: {
  etiqueta: string;
  resumen: string;
  activo: boolean;
  abierto: boolean;
  alAlternar: (abierto: boolean) => void;
  ancho?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) alAlternar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      alAlternar(false);
      disparador.current?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, alAlternar]);

  return (
    <div ref={raiz} className={clsx("relative transition-opacity duration-rapido", className)}>
      <button
        ref={disparador}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => alAlternar(!abierto)}
        className={clsx(
          "flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs",
          "transition-colors duration-rapido ease-estandar",
          activo
            ? "border-acento bg-superficie-tinte text-blue-700"
            : "border-borde bg-superficie-pagina text-texto-tenue hover:bg-superficie-sutil",
          abierto && "bg-superficie-sutil",
        )}
      >
        <span className="font-medium">{etiqueta}</span>
        <span aria-hidden className="opacity-60">
          ·
        </span>
        <span className="max-w-[12rem] truncate">{resumen}</span>
        <Icono
          nombre="chevron"
          className={clsx(
            "size-3 transition-transform duration-rapido ease-estandar",
            abierto && "rotate-180",
          )}
        />
      </button>

      <dialog
        id={idPanel}
        open={abierto}
        aria-label={etiqueta}
        className={clsx(
          // El `<dialog>` nativo llega centrado con márgenes automáticos; aquí
          // se ancla bajo su pastilla.
          "absolute inset-auto left-0 top-full z-20 m-0 mt-1.5 max-w-[calc(100vw-2rem)]",
          "animate-aparecer rounded-md border border-borde bg-superficie-tarjeta p-0 text-texto-cuerpo shadow-md",
          ancho,
        )}
      >
        {abierto && children}
      </dialog>
    </div>
  );
}

// ──────────────────────────────────────────────────── Contenido de un panel

function ListaDeUno({
  opciones,
  elegido,
  alElegir,
}: {
  opciones: OpcionDeFiltro[];
  elegido: string | null;
  alElegir: (valor: string | null) => void;
}) {
  return (
    <ul className="max-h-72 overflow-y-auto py-1">
      <li>
        <BotonDeOpcion elegido={elegido === null} onClick={() => alElegir(null)}>
          Todos
        </BotonDeOpcion>
      </li>
      {opciones.map((o) => (
        <li key={o.valor}>
          <BotonDeOpcion elegido={elegido === o.valor} onClick={() => alElegir(o.valor)}>
            {o.etiqueta}
          </BotonDeOpcion>
        </li>
      ))}
    </ul>
  );
}

function BotonDeOpcion({
  elegido,
  onClick,
  children,
}: {
  elegido: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-sm",
        "transition-colors duration-rapido hover:bg-superficie-sutil",
        elegido ? "font-medium text-texto-titulo" : "text-texto-cuerpo",
      )}
    >
      <span className="truncate">{children}</span>
      {elegido && <span className="shrink-0 text-acento">✓</span>}
    </button>
  );
}

function ListaDeVarios({
  opciones,
  elegidosAlAbrir,
  buscable = false,
  vacio,
  alAplicar,
}: {
  opciones: OpcionDeFiltro[];
  /**
   * El nombre lo dice: es **el valor de arranque**, no un valor controlado.
   *
   * `Desplegable` solo renderiza su contenido mientras está abierto, así que
   * este componente se monta al abrir y se desmonta al cerrar: el borrador nace
   * de lo que está aplicado y no puede quedarse viejo, porque no sobrevive a un
   * cambio de lo aplicado. Aplicar navega **y** cierra.
   */
  elegidosAlAbrir: string[];
  buscable?: boolean;
  vacio: string;
  alAplicar: (valores: string[]) => void;
}) {
  // Borrador: se navega una vez, al aplicar. Ver la nota del módulo.
  const [borrador, setBorrador] = useState<string[]>(elegidosAlAbrir);
  const [texto, setTexto] = useState("");
  // `includes` dentro del `map` recorrería la lista entera por cada opción.
  const enBorrador = new Set(borrador);

  const filtradas = texto.trim()
    ? opciones.filter((o) => o.etiqueta.toLocaleLowerCase("es").includes(texto.toLocaleLowerCase("es")))
    : opciones;

  function alternar(valor: string) {
    setBorrador((b) => (b.includes(valor) ? b.filter((v) => v !== valor) : [...b, valor]));
  }

  if (opciones.length === 0) {
    return <p className="px-4 py-4 text-xs text-texto-tenue">{vacio}</p>;
  }

  return (
    <div>
      {buscable && opciones.length > 8 && (
        <div className="border-b border-borde p-2">
          <input
            type="search"
            aria-label="Buscar dentro de la lista"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar…"
            autoComplete="off"
            className="w-full rounded-sm border border-borde bg-superficie-pagina px-2.5 py-1.5 text-sm outline-none transition-colors duration-rapido focus:border-acento focus:shadow-ring"
          />
        </div>
      )}

      <ul className="max-h-64 overflow-y-auto py-1">
        {filtradas.length === 0 ? (
          <li className="px-4 py-3 text-xs text-texto-tenue">Nada con «{texto.trim()}».</li>
        ) : (
          filtradas.map((o) => (
            <li key={o.valor}>
              <label className="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-sm text-texto-cuerpo transition-colors duration-rapido hover:bg-superficie-sutil">
                <input
                  type="checkbox"
                  checked={enBorrador.has(o.valor)}
                  onChange={() => alternar(o.valor)}
                  className="size-4 shrink-0 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
                />
                <span className="truncate">{o.etiqueta}</span>
              </label>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-borde px-3 py-2">
        <button
          type="button"
          onClick={() => setBorrador([])}
          disabled={borrador.length === 0}
          className="text-xs text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          Ninguno
        </button>
        <Boton onClick={() => alAplicar(borrador)} className="px-3 py-1 text-xs">
          Aplicar
        </Boton>
      </div>
    </div>
  );
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

      <p className="mt-3 text-xs leading-snug text-texto-tenue">
        El periodo siempre dice sobre qué fecha aplica. Sin eso, dos personas con la misma pantalla
        obtienen números distintos.
      </p>

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
