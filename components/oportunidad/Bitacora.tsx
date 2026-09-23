import clsx from "clsx";
import {
  FILTROS_DE_BITACORA,
  filtrarBitacora,
  type EventoDeBitacora,
  type TipoDeEvento,
} from "@/lib/domain/bitacora";
import { fechaCortaEn, horaEn } from "@/lib/tiempo";
import { Icono, type NombreDeIcono } from "@/components/ui/iconos";
import { Boton, ControlSegmentado, EstadoVacio, Pastilla } from "@/components/ui/primitivas";

/**
 * La bitácora de la oportunidad · P-02, pestaña Bitácora.
 *
 * Una línea de tiempo, de lo más reciente a lo más viejo, con la forma que el
 * equipo ya conocía de su herramienta anterior: un riel a la izquierda, un
 * punto por evento, y en cada uno qué pasó, cuándo y quién. Los filtros van en
 * la URL (INV-10): una bitácora filtrada se puede pegar en un correo.
 *
 * No calcula nada: los eventos llegan armados y ordenados desde
 * `lib/domain/bitacora`, con el costo ya omitido cuando no hay permiso.
 */
export function Bitacora({
  eventos,
  filtro,
  zona,
  hrefDe,
}: {
  eventos: EventoDeBitacora[];
  filtro: string;
  /** La zona de la oportunidad: las horas se leen como en la captura. */
  zona: string;
  hrefDe: (filtro: string) => string;
}) {
  const visibles = filtrarBitacora(eventos, filtro);
  const fecha = fechaCortaEn(zona);

  return (
    <div className="space-y-4">
      <ControlSegmentado
        opciones={FILTROS_DE_BITACORA.map((f) => ({
          valor: f.valor,
          etiqueta: f.etiqueta,
          contador: f.valor === "todo" ? undefined : filtrarBitacora(eventos, f.valor).length,
        }))}
        activa={FILTROS_DE_BITACORA.some((f) => f.valor === filtro) ? filtro : "todo"}
        hrefDe={hrefDe}
      />

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo="Nada que contar aquí"
          explicacion="No hay eventos de este tipo en la historia de la oportunidad."
          accion={
            <Boton variante="secundario" href={hrefDe("todo")}>
              Ver toda la bitácora
            </Boton>
          }
        />
      ) : (
        <ol className="relative ml-3.5 border-l border-borde pl-8">
          {visibles.map((e) => (
            <li key={`${e.tipo}-${e.id}`} className="relative pb-5 last:pb-0">
              <Marca tipo={e.tipo} />
              <div className="rounded-md border border-borde bg-superficie-tarjeta px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pastilla tono={TONO[e.tipo]}>{ETIQUETA[e.tipo]}</Pastilla>
                  <p className="text-sm font-medium text-texto-titulo">{e.titulo}</p>
                  {e.conAdvertencia && <Pastilla tono="alerta">Avanzó con advertencia</Pastilla>}
                </div>
                {e.detalle && <p className="mt-1 text-sm text-texto-cuerpo">{e.detalle}</p>}
                <p className="tabular mt-1.5 text-xs text-texto-tenue">
                  {fecha.format(e.cuando)} · {horaEn(e.cuando, zona)} · {e.quien}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** El punto del riel, con el dibujo del tipo. Las actividades hechas llevan palomita. */
function Marca({ tipo }: { tipo: TipoDeEvento }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "absolute -left-[2.9rem] top-2.5 flex size-7 items-center justify-center rounded-full border bg-superficie-pagina",
        tipo === "ACTIVIDAD" ? "border-exito text-exito" : "border-borde text-texto-tenue",
      )}
    >
      <Icono nombre={ICONO[tipo]} className="size-3.5" />
    </span>
  );
}

const ETIQUETA: Record<TipoDeEvento, string> = {
  CREACION: "Alta",
  ETAPA: "Etapa",
  CIERRE: "Cierre",
  PROPIETARIO: "Propietario",
  COTIZACION: "Cotización",
  ACTIVIDAD: "Actividad",
};

const TONO: Record<TipoDeEvento, "neutro" | "acento" | "exito" | "alerta"> = {
  CREACION: "neutro",
  ETAPA: "acento",
  CIERRE: "alerta",
  PROPIETARIO: "neutro",
  COTIZACION: "acento",
  ACTIVIDAD: "exito",
};

const ICONO: Record<TipoDeEvento, NombreDeIcono> = {
  CREACION: "oportunidades",
  ETAPA: "oportunidades",
  CIERRE: "actividades",
  PROPIETARIO: "contactos",
  COTIZACION: "productos",
  ACTIVIDAD: "palomita",
};
