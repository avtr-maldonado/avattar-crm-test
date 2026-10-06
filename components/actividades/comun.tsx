import Link from "next/link";
import clsx from "clsx";
import { ETIQUETA_DE_ESTADO_DE_AGENDA, type EstadoDeAgenda } from "@/lib/domain/agenda";
import { Pastilla } from "@/components/ui/primitivas";
import type { ActividadDeTablero } from "./formato";

/** Las piezas que comparten las tres vistas de Actividades (decisiones §42). */
const TONO_DE_ESTADO: Record<EstadoDeAgenda, "neutro" | "acento" | "exito" | "peligro"> = {
  por_realizar: "neutro",
  en_progreso: "acento",
  realizada: "exito",
  vencida: "peligro",
};

export function PastillaDeEstado({ estado }: { estado: EstadoDeAgenda }) {
  return <Pastilla tono={TONO_DE_ESTADO[estado]}>{ETIQUETA_DE_ESTADO_DE_AGENDA[estado]}</Pastilla>;
}

/**
 * El nombre de la oportunidad de una actividad, con enlace a su ficha. Si la
 * oportunidad ya no está al alcance de quien mira —a Preventa se le quitó el
 * apoyo, un vendedor dejó de ser propietario— no hay enlace: el nombre se
 * queda, apagado, con «Sin acceso» y la razón al pasar el cursor (§46). Un
 * enlace que termina en 404 es peor que ningún enlace.
 */
export function EnlaceAOportunidad({ a, className }: { a: ActividadDeTablero; className?: string }) {
  if (!a.opportunity) return null;
  if (!a.opportunity.accesible) {
    return (
      <span
        title="Ya no tienes acceso a esta oportunidad"
        className={clsx("inline-flex max-w-full items-center gap-1.5 text-texto-tenue", className?.includes("block") && "flex")}
      >
        <span className="truncate">{a.opportunity.name}</span>
        <Pastilla tono="neutro" titulo="Ya no tienes acceso a esta oportunidad">
          Sin acceso
        </Pastilla>
      </span>
    );
  }
  return (
    <Link href={`/oportunidades/${a.opportunity.id}`} className={className ?? "truncate text-texto-tenue hover:text-acento"}>
      {a.opportunity.name}
    </Link>
  );
}
