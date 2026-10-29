"use client";

import { PanelDeDesglose, type FilaDeDesglose } from "@/components/ui/PanelDeDesglose";
import { cuentaDeItems, type SeleccionDeGrafica } from "./seleccion";

/**
 * Qué hay detrás de un punto de una gráfica (decisiones §43).
 *
 * Arriba, los mismos renglones del tooltip, para que la cifra de la barra y
 * su lista se lean juntas; debajo, los ítems que la suman, con enlace a la
 * ficha. Desde §55 lo pinta `PanelDeDesglose`, el mismo molde que el embudo
 * del pipeline: la tabla es la misma en todas partes.
 *
 * `seleccion` se conserva al cerrar para que el panel no se vacíe mientras se
 * desvanece; `abierto` manda.
 */
export function PanelDeDetalle({
  seleccion,
  abierto,
  alCerrar,
}: {
  seleccion: SeleccionDeGrafica | null;
  abierto: boolean;
  alCerrar: () => void;
}) {
  if (!seleccion) return null;
  const { titulo, detalle, items, unidad } = seleccion;

  const filas: FilaDeDesglose[] = items.map((i) => ({
    clave: i.clave,
    titulo: i.titulo,
    subtitulo: i.subtitulo,
    href: i.href,
    nota: i.nota,
    cifras: [{ texto: i.cifra, tono: i.tono }],
  }));
  const conNota = items.some((i) => i.nota);

  return (
    <PanelDeDesglose
      titulo={titulo}
      subtitulo={cuentaDeItems(items.length, unidad)}
      resumen={detalle}
      encabezados={{
        principal: unidad.singular.charAt(0).toLocaleUpperCase("es") + unidad.singular.slice(1),
        nota: conNota ? "Detalle" : undefined,
        cifras: ["Valor"],
      }}
      filas={filas}
      vacio="Nada que listar con los filtros actuales."
      abierto={abierto}
      alCerrar={alCerrar}
    />
  );
}
