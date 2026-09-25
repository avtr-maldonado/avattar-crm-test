import Link from "next/link";
import { clsx } from "clsx";
import type { RiskFlag } from "@/lib/dto";
import { ETIQUETA_BANDERA } from "@/lib/etiquetas";
import { Icono } from "@/components/ui/iconos";
import { Avatar, Pastilla } from "@/components/ui/primitivas";

/**
 * Tarjeta del kanban · §11 P-01.
 *
 * «Nombre, organización, importe, margen, puntaje MEDDIC, fecha de cierre,
 * iniciales del propietario y bandera de riesgo si aplica.» Los ocho datos
 * siguen aquí, en **cuatro líneas**: un tablero de cinco columnas se lee de
 * corrido solo si cada tarjeta cabe en el alto de una mano.
 *
 *   nombre en dos líneas                                   ⚠
 *   organización · cierre
 *   (JM) importe                             margen  MEDDIC
 *
 * ## Lo que se fue y a dónde
 *
 * Las pastillas de riesgo eran una fila entera para decir «Estancada». Ahora es
 * el triángulo de la esquina: su color dice la gravedad —coral si cuesta dinero
 * o clientes, apagado si solo va lento (§13.1)— y su `title` dice cuáles. El
 * nombre del propietario vive en el `title` del avatar, como en el resto de la
 * interfaz.
 *
 * Recibe todo ya calculado y formateado. No consulta, no formatea dinero y no
 * decide banderas: eso vive en `lib/domain` y `lib/money`, probado con tests
 * unitarios. «La UI nunca recalcula por su cuenta» (§4.3).
 *
 * El margen sigue siendo **la señal más importante de toda la interfaz**
 * (§13.1): verde en o sobre el piso, coral debajo. Viaja como
 * `margenBajoElPiso`, un booleano ya resuelto contra `CommercialPolicy`.
 */
export type DatosTarjeta = {
  id: string;
  folio: string;
  nombre: string;
  organizacion: string;
  /** Ya formateado: «$2,850,000.00». */
  importe: string;
  /** Ya formateado: «31.0 %». Nulo mientras no hay cotización. */
  margen: string | null;
  margenBajoElPiso: boolean;
  meddicScore: number | null;
  /** Ya formateado: «15 oct 2026». */
  cierre: string;
  propietario: { nombre: string; iniciales: string };
  banderas: RiskFlag[];
  /** §25 · una ganada se ve verde y una perdida coral, cuando el filtro las deja ver. */
  estatus: "ABIERTA" | "GANADA" | "PERDIDA";
};

// Borde de color y relleno tenue del mismo color (24-sep-2026): verde es
// ganar, coral es perder. La pastilla dice cuál es, por si el color no basta.
const SUPERFICIE_POR_ESTATUS: Record<DatosTarjeta["estatus"], string> = {
  ABIERTA: "border-borde bg-superficie-tarjeta",
  GANADA: "border-exito bg-exito/10",
  PERDIDA: "border-coral bg-coral/10",
};

export function TarjetaOportunidad({ o }: { o: DatosTarjeta }) {
  return (
    <Link
      href={`/oportunidades/${o.id}`}
      // Los enlaces son arrastrables de nacimiento: sin esto el navegador
      // inicia su propio arrastre de la URL y pisa el del tablero.
      draggable={false}
      title={o.estatus === "ABIERTA" ? o.nombre : `${o.nombre} · ${o.estatus === "GANADA" ? "Ganada" : "Perdida"}`}
      className={clsx(
        "block rounded-md border px-2.5 py-2 shadow-xs transition-shadow duration-rapido ease-estandar hover:shadow-sm col-angosta:px-2",
        SUPERFICIE_POR_ESTATUS[o.estatus],
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Dos líneas de nombre como máximo. El título completo queda en `title`. */}
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-texto-titulo col-angosta:text-xs">
          {o.nombre}
        </p>
        {o.estatus !== "ABIERTA" ? (
          <Pastilla tono={o.estatus === "GANADA" ? "exito" : "peligro"}>
            {o.estatus === "GANADA" ? "Ganada" : "Perdida"}
          </Pastilla>
        ) : null}
        {o.banderas.length > 0 && <SenalDeRiesgo banderas={o.banderas} />}
      </div>

      {/* Si algo no cabe se recorta el nombre de la cuenta, que se deduce del
          contexto; la fecha no se recorta, porque «15 oct» a medias no dice nada. */}
      <p className="mt-0.5 flex items-baseline gap-1 text-xs text-texto-tenue">
        <span className="truncate">{o.organizacion}</span>
        <span className="tabular shrink-0 whitespace-nowrap">· {o.cierre}</span>
      </p>

      {/* El importe nunca se trunca: es el número. En una columna angosta, el
          margen y el puntaje bajan a una segunda línea, alineados a la derecha. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Avatar iniciales={o.propietario.iniciales} titulo={o.propietario.nombre} />
        <span className="tabular whitespace-nowrap text-sm font-semibold text-texto-titulo col-angosta:text-xs">
          {o.importe}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {o.margen && (
            <span
              className={clsx(
                "tabular text-xs",
                o.margenBajoElPiso ? "font-semibold text-coral" : "font-medium text-exito",
              )}
            >
              {o.margen}
            </span>
          )}
          {o.meddicScore !== null && <PuntajeMeddic valor={o.meddicScore} />}
        </span>
      </div>
    </Link>
  );
}

/**
 * La bandera, sin la fila que ocupaba.
 *
 * Coral cuando cuesta dinero o clientes —margen bajo el piso, sin siguiente
 * paso—; apagado cuando solo es un problema de ritmo (§13.1). El `title` lista
 * las banderas, así que el detalle no se pierde: se consulta.
 */
function SenalDeRiesgo({ banderas }: { banderas: RiskFlag[] }) {
  const grave = banderas.some((b) => b !== "ESTANCADA");
  const cuales = banderas.map((b) => ETIQUETA_BANDERA[b]).join(" · ");

  return (
    <span
      role="img"
      aria-label={`En riesgo: ${cuales}`}
      title={cuales}
      className={clsx("mt-px shrink-0", grave ? "text-coral" : "text-navy-500")}
    >
      <Icono nombre="riesgo" className="size-4" />
    </span>
  );
}

/**
 * §7.4 · «Rojo bajo 50, ámbar 50–69, verde 70 o más.»
 *
 * Los cortes son de presentación, no umbrales de negocio: los que gatean —
 * entrar a cierre, ganar, comprometer— viven en `CommercialPolicy` y los evalúa
 * `lib/domain`. Este color solo dice de un vistazo si el trabajo va o no va.
 */
function PuntajeMeddic({ valor }: { valor: number }) {
  const tono = valor >= 70 ? "exito" : valor >= 50 ? "alerta" : "peligro";
  return (
    <Pastilla tono={tono} titulo={`Puntaje MEDDIC: ${valor} de 100`}>
      <span className="tabular">{valor}</span>
    </Pastilla>
  );
}
