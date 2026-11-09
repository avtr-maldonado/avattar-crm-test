import Link from "next/link";
import clsx from "clsx";
import { Avatar } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import { Puntaje } from "./PastillaDeEtapa";
import type { DatosDeProspecto } from "./formato";

/**
 * La tarjeta del kanban de prospectos · la misma anatomía que la del pipeline
 * (decisiones §58): nombre en dos líneas, empresa, y abajo el vendedor, los
 * días y el puntaje. El SLA vencido se marca en coral, como una bandera.
 */
export function TarjetaProspecto({ p }: { p: DatosDeProspecto }) {
  const vencido = p.sla === "vencido";
  return (
    <Link
      href={p.href}
      // Los enlaces son arrastrables de nacimiento: sin esto el navegador
      // inicia su propio arrastre de la URL y pisa el del tablero.
      draggable={false}
      title={`${p.contacto} · ${p.empresa}`}
      className={clsx(
        "block rounded-md border px-2.5 py-2 shadow-xs transition-shadow duration-rapido ease-estandar hover:shadow-sm col-angosta:px-2",
        vencido ? "border-coral/60 bg-coral/[0.04]" : "border-borde bg-superficie-tarjeta",
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-texto-titulo col-angosta:text-xs">{p.contacto}</p>
        {vencido && <Icono nombre="riesgo" className="size-4 shrink-0 text-coral" />}
      </div>
      <p className="mt-0.5 truncate text-xs text-texto-tenue">{p.empresa}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {p.vendedor ? <Avatar iniciales={p.vendedor.iniciales} titulo={p.vendedor.nombre} /> : <span className="text-xs text-texto-tenue">Sin asignar</span>}
        <span className="tabular whitespace-nowrap text-xs text-texto-tenue">
          {p.dias} {p.dias === 1 ? "día" : "días"}
        </span>
        <span className="ml-auto flex shrink-0 items-center">
          <Puntaje valor={p.score} />
        </span>
      </div>
    </Link>
  );
}
