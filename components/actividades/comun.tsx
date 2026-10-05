import Link from "next/link";
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

export function EnlaceAOportunidad({ a, className }: { a: ActividadDeTablero; className?: string }) {
  if (!a.opportunity) return null;
  return (
    <Link href={`/oportunidades/${a.opportunity.id}`} className={className ?? "truncate text-texto-tenue hover:text-acento"}>
      {a.opportunity.name}
    </Link>
  );
}
