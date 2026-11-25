"use client";

import { useTransition } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Icono } from "@/components/ui/iconos";

export type AccionDeMarcar = (leadId: string, activityId: string, hecha: boolean) => Promise<ResultadoAccion<{ id: string }>>;

/**
 * El círculo de estado de una actividad del prospecto, pulsable · decisiones §69.
 * Pendiente (reloj) → hecha; hecha (palomita) → pendiente, para corregir un clic
 * por error sin abrir el panel. Solo se monta para quien puede editar la
 * actividad; para los demás el círculo es el de siempre, sin botón.
 */
export function MarcarActividad({
  leadId,
  activityId,
  asunto,
  hecha,
  accion,
}: {
  leadId: string;
  activityId: string;
  asunto: string;
  hecha: boolean;
  accion: AccionDeMarcar;
}) {
  const [pendiente, iniciar] = useTransition();
  const etiqueta = hecha ? "Regresar a pendiente" : "Marcar como hecha";

  const alPulsar = () =>
    iniciar(async () => {
      const r = await accion(leadId, activityId, !hecha);
      if (!r.ok) {
        avisarSiCorresponde(r);
        if (r.motivo === "VALIDACION") avisar.advertencia(r.problemas[0]?.mensaje ?? "No se pudo guardar.");
        return;
      }
      avisar.exito(hecha ? "Actividad pendiente" : "Actividad hecha", asunto);
    });

  return (
    <button
      type="button"
      onClick={alPulsar}
      disabled={pendiente}
      aria-label={`${etiqueta}: ${asunto}`}
      title={etiqueta}
      className={clsx(
        "group mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill transition-colors duration-rapido ease-estandar focus:shadow-ring focus:outline-none disabled:opacity-60",
        hecha
          ? "bg-exito/10 text-exito hover:bg-superficie-sutil hover:text-texto-tenue"
          : "bg-superficie-sutil text-texto-tenue hover:bg-exito/10 hover:text-exito",
      )}
    >
      {/* Al pasar encima se anticipa lo que hará el clic. */}
      <Icono nombre={hecha ? "palomita" : "reloj"} className="size-3.5 group-hover:hidden" />
      <Icono nombre={hecha ? "reloj" : "palomita"} className="hidden size-3.5 group-hover:block" />
    </button>
  );
}
