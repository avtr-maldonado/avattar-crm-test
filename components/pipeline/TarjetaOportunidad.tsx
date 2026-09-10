import Link from "next/link";
import type { RiskFlag } from "@/lib/dto";
import { ETIQUETA_BANDERA } from "@/lib/etiquetas";
import { Avatar, Pastilla } from "@/components/ui/primitivas";

/**
 * Tarjeta del kanban · §11 P-01.
 *
 * «Nombre, organización, importe, margen, puntaje MEDDIC, fecha de cierre,
 * iniciales del propietario y bandera de riesgo si aplica.»
 *
 * Recibe todo ya calculado y formateado. No consulta, no formatea dinero y no
 * decide banderas: eso vive en `lib/domain` y `lib/money`, probado con tests
 * unitarios. «La UI nunca recalcula por su cuenta» (§4.3).
 *
 * El margen es **la señal más importante de toda la interfaz** (§13.1): verde
 * en o sobre el piso, coral debajo. Por eso viaja como `margenBajoElPiso`, un
 * booleano ya resuelto contra `CommercialPolicy`, y no como un umbral que la
 * tarjeta tuviera que comparar.
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
};

export function TarjetaOportunidad({ o }: { o: DatosTarjeta }) {
  return (
    <Link
      href={`/oportunidades/${o.id}`}
      // Los enlaces son arrastrables de nacimiento: sin esto el navegador
      // inicia su propio arrastre de la URL y pisa el del tablero.
      draggable={false}
      className="block rounded-md border border-borde bg-superficie-tarjeta p-3 shadow-xs transition-shadow duration-rapido ease-estandar hover:shadow-sm"
    >
      <p className="text-sm font-medium leading-snug text-texto-titulo">{o.nombre}</p>
      <p className="mt-0.5 truncate text-xs text-texto-tenue">{o.organizacion}</p>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="tabular text-sm font-semibold text-texto-titulo">{o.importe}</span>
        {o.margen && (
          <span
            className={
              o.margenBajoElPiso
                ? "tabular text-xs font-semibold text-coral"
                : "tabular text-xs font-medium text-exito"
            }
          >
            {o.margen} mg
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="tabular text-xs text-texto-tenue">{o.cierre}</span>

        <div className="ml-auto flex items-center gap-1.5">
          {o.meddicScore !== null && <PuntajeMeddic valor={o.meddicScore} />}
          <Avatar iniciales={o.propietario.iniciales} titulo={o.propietario.nombre} />
        </div>
      </div>

      {o.banderas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {o.banderas.map((b) => (
            <Pastilla key={b} tono={b === "MARGEN_BAJO" ? "peligro" : "alerta"}>
              {ETIQUETA_BANDERA[b]}
            </Pastilla>
          ))}
        </div>
      )}
    </Link>
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
