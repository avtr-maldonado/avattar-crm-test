import { clsx } from "clsx";
import { Avatar } from "@/components/ui/primitivas";

/**
 * La tabla del equipo · §10.3.
 *
 * «Gerente de país: tabla del equipo de su oficina, con la nota de banda sana
 * de cobertura y cuántos vendedores están por debajo.»
 *
 * El total **se suma de los renglones visibles**, nunca de una consulta aparte
 * que ignore el alcance (§10.3). Por eso llega ya calculado desde la pantalla,
 * que es quien tiene las filas que la sesión alcanzó: este componente no sabe
 * consultar nada y no podría saltarse el alcance aunque quisiera.
 *
 * Las cifras van en columna con `tabular`: son cinco columnas de dinero y sin
 * eso los dígitos de ancho variable las desalinean (§13.2).
 */
export type RenglonDeEquipo = {
  id: string;
  nombre: string;
  iniciales: string;
  cuota: string;
  logrado: string;
  /** 0 a 1, o nulo si no tiene cuota fijada. */
  cumplimiento: number | null;
  /** «+$50,000» o «−$120,000», ya con signo. Vacío si entra a la par. */
  arrastre: string;
  arrastreEsDeuda: boolean;
  /** «2.4 ×», «Cubierta» o «—». */
  cobertura: string;
  coberturaBaja: boolean;
  esQuienMira: boolean;
};

export function TablaDeEquipo({
  renglones,
  total,
  periodo,
  metrica,
}: {
  renglones: RenglonDeEquipo[];
  total: { cuota: string; logrado: string; cumplimiento: number | null };
  /** «acumulado al T3 2026» o «2026». Va en el encabezado de las columnas. */
  periodo: string;
  /**
   * «Venta» o «Utilidad de venta». Una sola métrica a la vez, elegida con el
   * conmutador de arriba: las dos juntas serían diez columnas de dinero, y una
   * tabla que se lee de reojo deja de leerse.
   */
  metrica: string;
}) {
  const porDebajo = renglones.filter(
    (r) => r.cumplimiento !== null && r.cumplimiento < 1,
  ).length;

  return (
    <section className="rounded-md border border-borde bg-superficie-tarjeta">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borde px-5 py-3.5">
        <h2 className="text-sm font-semibold text-texto-titulo">
          Equipo · {metrica.toLocaleLowerCase("es")} {periodo}
        </h2>
        <p className="text-xs text-texto-tenue">
          {porDebajo === 0
            ? "Nadie por debajo de su cuota acumulada."
            : `${porDebajo} ${porDebajo === 1 ? "persona" : "personas"} por debajo de su cuota acumulada.`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-borde text-left">
              <Th>Vendedor</Th>
              <Th alineada>Cuota {periodo}</Th>
              <Th alineada>Logrado</Th>
              <Th alineada>Cumplimiento</Th>
              <Th alineada>Arrastre</Th>
              <Th alineada>Cobertura</Th>
            </tr>
          </thead>

          <tbody className="divide-y divide-borde">
            {renglones.map((r) => (
              <tr
                key={r.id}
                className={clsx(
                  "transition-colors duration-rapido hover:bg-superficie-sutil",
                  r.esQuienMira && "bg-superficie-tinte/60",
                )}
              >
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar iniciales={r.iniciales} />
                    <span className="truncate font-medium text-texto-titulo">{r.nombre}</span>
                  </div>
                </td>
                <Td>{r.cuota}</Td>
                <Td>{r.logrado}</Td>
                <td className="tabular px-5 py-2.5 text-right">
                  {r.cumplimiento === null ? (
                    <span className="text-texto-tenue">—</span>
                  ) : (
                    <span
                      className={clsx(
                        "font-semibold",
                        r.cumplimiento >= 1 ? "text-exito" : "text-coral",
                      )}
                    >
                      {Math.round(r.cumplimiento * 100)} %
                    </span>
                  )}
                </td>
                <td className="tabular px-5 py-2.5 text-right">
                  {r.arrastre === "" ? (
                    <span className="text-texto-tenue">a la par</span>
                  ) : (
                    <span className={r.arrastreEsDeuda ? "text-coral" : "text-exito"}>
                      {r.arrastre}
                    </span>
                  )}
                </td>
                <td
                  className={clsx(
                    "tabular px-5 py-2.5 text-right",
                    r.coberturaBaja ? "text-coral" : "text-texto-cuerpo",
                  )}
                >
                  {r.cobertura}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-borde-fuerte bg-superficie-sutil font-semibold">
              <td className="px-5 py-2.5 text-texto-titulo">Total del equipo</td>
              <Td>{total.cuota}</Td>
              <Td>{total.logrado}</Td>
              <td className="tabular px-5 py-2.5 text-right">
                {total.cumplimiento === null ? (
                  <span className="text-texto-tenue">—</span>
                ) : (
                  <span className={total.cumplimiento >= 1 ? "text-exito" : "text-coral"}>
                    {Math.round(total.cumplimiento * 100)} %
                  </span>
                )}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-borde px-5 py-2.5 text-xs text-texto-tenue">
        El total sale de sumar los renglones de arriba, no de una consulta aparte: para cada quien
        es el total de lo que alcanza a ver.
      </p>
    </section>
  );
}

function Th({ children, alineada = false }: { children: React.ReactNode; alineada?: boolean }) {
  return (
    <th
      scope="col"
      className={clsx(
        "eyebrow px-5 py-2.5 font-semibold text-texto-tenue",
        alineada && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="tabular px-5 py-2.5 text-right text-texto-cuerpo">{children}</td>;
}
