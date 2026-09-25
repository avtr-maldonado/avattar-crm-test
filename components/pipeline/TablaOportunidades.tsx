import Link from "next/link";
import { ETIQUETA_BANDERA, tonoDeRiesgo } from "@/lib/etiquetas";
import { Avatar, Pastilla } from "@/components/ui/primitivas";
import type { DatosTarjeta } from "./TarjetaOportunidad";

/**
 * Vista de tabla · §11 P-01.
 *
 * La otra mitad del conmutador. El kanban muestra el proceso; la tabla muestra
 * el conjunto: sirve para comparar importes y márgenes de un vistazo, que en
 * columnas separadas por etapa es imposible.
 *
 * §13.4 · «cifras a la derecha, encabezado fijo». Y todas con `tabular`, o los
 * importes no se alinean y la columna deja de leerse de arriba abajo.
 */
export function TablaOportunidades({
  oportunidades,
  etapaDe,
}: {
  oportunidades: DatosTarjeta[];
  /** Nombre de la etapa por id de oportunidad. */
  etapaDe: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-borde">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-superficie-sutil">
          <tr className="text-left">
            <Th>Folio</Th>
            <Th>Oportunidad</Th>
            <Th>Etapa</Th>
            <Th alineacion="derecha">Importe</Th>
            <Th alineacion="derecha">Margen</Th>
            <Th alineacion="derecha">MEDDIC</Th>
            <Th alineacion="derecha">Cierre</Th>
            <Th>Dueño</Th>
            <Th>Riesgo</Th>
          </tr>
        </thead>
        <tbody>
          {oportunidades.map((o) => (
            <tr
              key={o.id}
              className="border-t border-borde transition-colors duration-rapido hover:bg-superficie-sutil"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/oportunidades/${o.id}`}
                  className="font-mono text-xs text-acento hover:underline"
                >
                  {o.folio}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2 font-medium text-texto-titulo">
                  {o.nombre}
                  {o.estatus !== "ABIERTA" ? (
                    <Pastilla tono={o.estatus === "GANADA" ? "exito" : "peligro"}>
                      {o.estatus === "GANADA" ? "Ganada" : "Perdida"}
                    </Pastilla>
                  ) : null}
                </div>
                <div className="text-xs text-texto-tenue">{o.organizacion}</div>
              </td>
              <td className="px-3 py-2 text-texto-cuerpo">{etapaDe[o.id]}</td>
              <td className="tabular px-3 py-2 text-right font-medium">{o.importe}</td>
              <td className="tabular px-3 py-2 text-right">
                {o.margen ? (
                  <span
                    className={
                      o.margenBajoElPiso ? "font-semibold text-coral" : "text-exito"
                    }
                  >
                    {o.margen}
                  </span>
                ) : (
                  <span className="text-texto-tenue">—</span>
                )}
              </td>
              <td className="tabular px-3 py-2 text-right">
                {o.meddicScore === null ? (
                  <span className="text-texto-tenue">—</span>
                ) : (
                  <span
                    className={
                      o.meddicScore >= 70
                        ? "text-exito"
                        : o.meddicScore >= 50
                          ? "text-navy-500"
                          : "text-coral"
                    }
                  >
                    {o.meddicScore}
                  </span>
                )}
              </td>
              <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{o.cierre}</td>
              <td className="px-3 py-2">
                <Avatar iniciales={o.propietario.iniciales} titulo={o.propietario.nombre} />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {o.banderas.map((b) => (
                    <Pastilla key={b} tono={tonoDeRiesgo(b)}>
                      {ETIQUETA_BANDERA[b]}
                    </Pastilla>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  alineacion = "izquierda",
}: {
  children: React.ReactNode;
  alineacion?: "izquierda" | "derecha";
}) {
  return (
    <th
      className={`eyebrow px-3 py-2 font-medium ${alineacion === "derecha" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}
