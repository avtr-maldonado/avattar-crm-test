import type { LeadStage } from "@/lib/dto";
import { ETIQUETA_DE_ETAPA, TONO_DE_ETAPA } from "@/lib/domain/leadStages";
import { ETIQUETA_DE_SLA, TONO_DE_SLA, type EstadoDeSla } from "@/lib/domain/leadSla";
import { Pastilla } from "@/components/ui/primitivas";

/** La etapa como pastilla de color: azul lo que avanza, verde lo que ventas tomó, coral lo que salió (§58). */
export function PastillaDeEtapa({ etapa }: { etapa: LeadStage }) {
  return <Pastilla tono={TONO_DE_ETAPA[etapa]}>{ETIQUETA_DE_ETAPA[etapa]}</Pastilla>;
}

/** El SLA de primer contacto, calculado al leer (INV-11). */
export function PastillaDeSla({ estado }: { estado: EstadoDeSla }) {
  return <Pastilla tono={TONO_DE_SLA[estado]}>{ETIQUETA_DE_SLA[estado]}</Pastilla>;
}

/** El puntaje 0–100 como cápsula: verde de 80, azul de 60, neutro abajo. */
export function Puntaje({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-xs text-texto-tenue">—</span>;
  const tono = valor >= 80 ? "exito" : valor >= 60 ? "acento" : "neutro";
  return <Pastilla tono={tono}>{valor}</Pastilla>;
}
