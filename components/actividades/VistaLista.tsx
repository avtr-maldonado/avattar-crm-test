import Link from "next/link";
import clsx from "clsx";
import { formatUSD, type Money } from "@/lib/money";
import { estadoDeAgenda, ORDEN_DE_ESTADOS, type RelojDeAgenda } from "@/lib/domain/agenda";
import { Avatar, Boton, EstadoVacio } from "@/components/ui/primitivas";
import { EnlaceAOportunidad, PastillaDeEstado } from "./comun";
import { rangoDeHoras, type ActividadDeTablero, type EditorDe, type Formatos } from "./formato";

export type OportunidadSinPaso = {
  id: string;
  name: string;
  amount: Money;
  lastActivityAt: Date | null;
  organization: { name: string };
  stage: { name: string };
  owner: { name: string; initials: string };
};

/**
 * Vista de lista · una fila por actividad, condensada: qué, estado, tipo,
 * cuándo y quién. Primero la deuda, al final lo hecho. Debajo, las
 * oportunidades sin próximo paso, que no son actividades pero sí pendientes
 * (RN-10): es la lista que hace que la regla exista en la práctica.
 */
export function VistaLista({
  actividades,
  sinProxima,
  reloj,
  f,
  editorDe,
}: {
  actividades: ActividadDeTablero[];
  sinProxima: OportunidadSinPaso[];
  reloj: RelojDeAgenda;
  f: Formatos;
  editorDe: EditorDe;
}) {
  const ordenadas = actividades
    .map((a) => ({ a, estado: estadoDeAgenda(a, reloj) }))
    .sort((x, y) => ORDEN_DE_ESTADOS.indexOf(x.estado) - ORDEN_DE_ESTADOS.indexOf(y.estado) || x.a.startsAt.getTime() - y.a.startsAt.getTime());

  if (ordenadas.length === 0 && sinProxima.length === 0) {
    return (
      <EstadoVacio
        titulo="Nada pendiente"
        explicacion="No hay actividades por hacer ni hechas en las últimas dos semanas, y todas tus oportunidades abiertas tienen un próximo paso."
        accion={
          <Boton href="/oportunidades" variante="secundario">
            Ir al pipeline
          </Boton>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-x-auto rounded-md border border-borde bg-superficie-tarjeta">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead className="bg-superficie-sutil">
            <tr className="text-left">
              <Th>Actividad</Th>
              <Th>Estado</Th>
              <Th>Tipo</Th>
              <Th>Fecha</Th>
              <Th>Responsable</Th>
              <Th>
                <span className="sr-only">Editar</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr className="border-t border-borde">
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-texto-tenue">
                  Sin actividades por hacer ni hechas en las últimas dos semanas.
                </td>
              </tr>
            ) : (
              ordenadas.map(({ a, estado }) => (
                <tr key={a.id} className={clsx("border-t border-borde", estado === "realizada" && "text-texto-tenue")}>
                  <td className="px-3 py-2">
                    <p className={clsx("font-medium", estado === "realizada" ? "text-texto-tenue" : "text-texto-titulo")}>{a.subject}</p>
                    <EnlaceAOportunidad a={a} className="block truncate text-xs text-texto-tenue hover:text-acento" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <PastillaDeEstado estado={estado} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-texto-cuerpo">{a.type.name}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-texto-cuerpo">
                    {f.fecha.format(a.startsAt)} · {rangoDeHoras(a, f)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <Avatar iniciales={a.user.initials} titulo={a.user.name} />
                      <span className="text-texto-cuerpo">{a.user.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{editorDe(a)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {sinProxima.length > 0 ? (
        <section className="overflow-x-auto rounded-md border border-borde bg-superficie-tarjeta">
          <div className="flex items-baseline gap-2 border-b border-borde px-3 py-2.5">
            <h2 className="text-sm font-semibold text-texto-titulo">Oportunidades sin próximo paso</h2>
            <span className="tabular text-xs text-texto-tenue">{sinProxima.length}</span>
          </div>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <tbody>
              {sinProxima.map((o) => (
                <tr key={o.id} className="border-t border-borde first:border-t-0">
                  <td className="px-3 py-2">
                    <Link href={`/oportunidades/${o.id}`} className="font-medium text-texto-titulo hover:text-acento">
                      {o.name}
                    </Link>
                    <p className="truncate text-xs text-texto-tenue">
                      {o.organization.name} · {o.stage.name}
                    </p>
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-texto-tenue">
                    {o.lastActivityAt ? `última actividad ${f.fecha.format(o.lastActivityAt)}` : "sin actividad registrada"}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium text-texto-cuerpo">{formatUSD(o.amount)}</td>
                  <td className="px-3 py-2">
                    <Avatar iniciales={o.owner.initials} titulo={o.owner.name} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Boton href={`/oportunidades/${o.id}`} variante="secundario">
                      Agendar
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="eyebrow whitespace-nowrap px-3 py-2 font-medium">{children}</th>;
}
