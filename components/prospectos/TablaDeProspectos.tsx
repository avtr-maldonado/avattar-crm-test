"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import type { CountryCode } from "@/lib/dto";
import { Avatar, Boton } from "@/components/ui/primitivas";
import { FilaEnlazada } from "@/components/ui/FilaEnlazada";
import { AsignarProspectos, type VendedorAsignable } from "./AsignarProspectos";
import { DescartarProspecto, type MotivoDeDescarte } from "./DescartarProspecto";
import { MenuDeAcciones, type AccionDeMenu } from "./MenuDeAcciones";
import { PastillaDeEtapa, PastillaDeSla, Puntaje } from "./PastillaDeEtapa";
import type { DatosDeProspecto } from "./formato";

type Panel = { tipo: "asignar"; ids: string[]; pais: CountryCode } | { tipo: "descartar"; id: string; nombre: string } | null;

/**
 * La lista de prospectos · decisiones §58. Una fila por prospecto con la etapa
 * como pastilla, el puntaje, el vendedor, el SLA y el menú «…». Las casillas
 * solo aparecen en lo que la sesión puede asignar; con algo marcado, la barra
 * de arriba ofrece asignarlo todo de una vez.
 */
export function TablaDeProspectos({
  filas,
  vendedoresPorPais,
  motivos,
  acciones,
  vacio,
}: {
  filas: DatosDeProspecto[];
  vendedoresPorPais: Record<string, VendedorAsignable[]>;
  motivos: MotivoDeDescarte[];
  acciones: {
    asignar: (previo: ResultadoAccion<{ asignados: number }> | null, form: FormData) => Promise<ResultadoAccion<{ asignados: number }>>;
    descartar: (previo: ResultadoAccion | null, form: FormData) => Promise<ResultadoAccion>;
  };
  vacio: React.ReactNode;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);

  if (filas.length === 0) return <>{vacio}</>;

  const asignables = filas.filter((f) => f.puede.asignar);
  const todasMarcadas = asignables.length > 0 && asignables.every((f) => seleccion.has(f.id));
  const marcadas = filas.filter((f) => seleccion.has(f.id));
  // Una asignación masiva es de una sola oficina: los vendedores válidos son los de ese país.
  const paisesMarcados = new Set(marcadas.map((f) => f.countryCode));
  const paisDeSeleccion = paisesMarcados.size === 1 ? marcadas[0]!.countryCode : null;

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function accionesDe(f: DatosDeProspecto): AccionDeMenu[] {
    return [
      { etiqueta: "Ver", href: f.href },
      ...(f.puede.asignar ? [{ etiqueta: f.vendedor ? "Reasignar" : "Asignar", onClick: () => setPanel({ tipo: "asignar", ids: [f.id], pais: f.countryCode }) }] : []),
      ...(f.puede.actividad ? [{ etiqueta: "Registrar actividad", href: `${f.href}&t=actividades&accion=actividad` }] : []),
      ...(f.puede.convertir ? [{ etiqueta: "Convertir a oportunidad", href: `${f.href}&accion=convertir` }] : []),
      ...(f.puede.descartar ? [{ etiqueta: "Descartar", tono: "peligro" as const, onClick: () => setPanel({ tipo: "descartar", id: f.id, nombre: f.contacto }) }] : []),
    ];
  }

  return (
    <div className="space-y-3">
      {marcadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-acento/40 bg-superficie-tinte px-4 py-2.5 text-sm">
          <span className="tabular font-medium text-texto-titulo">
            {marcadas.length} {marcadas.length === 1 ? "seleccionado" : "seleccionados"}
          </span>
          {paisDeSeleccion ? (
            <Boton onClick={() => setPanel({ tipo: "asignar", ids: marcadas.map((f) => f.id), pais: paisDeSeleccion })} className="px-3 py-1 text-xs">
              Asignar vendedor
            </Boton>
          ) : (
            <span className="text-xs text-texto-tenue">Elige prospectos de un solo país para asignarlos juntos.</span>
          )}
          <button type="button" onClick={() => setSeleccion(new Set())} className="ml-auto text-xs text-texto-tenue underline-offset-2 hover:underline">
            Quitar selección
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-borde bg-superficie-tarjeta">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead className="bg-superficie-sutil">
            <tr className="text-left">
              <th className="w-10 px-3 py-2">
                {asignables.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los asignables"
                    checked={todasMarcadas}
                    onChange={() => setSeleccion(todasMarcadas ? new Set() : new Set(asignables.map((f) => f.id)))}
                    className="size-4 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
                  />
                )}
              </th>
              <Th>Contacto</Th>
              <Th>Empresa</Th>
              <Th>Canal</Th>
              <Th>Campaña</Th>
              <Th>Etapa</Th>
              <Th alineada>Puntaje</Th>
              <Th>Vendedor</Th>
              <Th>Ingreso</Th>
              <Th alineada>Días</Th>
              <Th>Próxima actividad</Th>
              <Th>SLA</Th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaEnlazada key={f.id} href={f.href} className={clsx("border-t border-borde transition-colors duration-rapido hover:bg-superficie-sutil", f.sla === "vencido" && "bg-coral/[0.04]", seleccion.has(f.id) && "bg-superficie-tinte")}>
                <td className="px-3 py-2">
                  {f.puede.asignar && (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar a ${f.contacto}`}
                      checked={seleccion.has(f.id)}
                      onChange={() => alternar(f.id)}
                      className="size-4 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar iniciales={f.iniciales} titulo={f.contacto} />
                    <div className="min-w-0">
                      <Link href={f.href} className="block truncate font-medium text-texto-titulo hover:text-acento">
                        {f.contacto}
                      </Link>
                      {f.correo && <p className="truncate text-xs text-texto-tenue">{f.correo}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-texto-cuerpo">{f.empresa}</td>
                <td className="whitespace-nowrap px-3 py-2 text-texto-cuerpo">{f.canal}</td>
                <td className="px-3 py-2 text-texto-cuerpo">{f.campana ?? <span className="text-texto-tenue">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <PastillaDeEtapa etapa={f.etapa} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Puntaje valor={f.score} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-texto-cuerpo">{f.vendedor?.nombre ?? <span className="text-texto-tenue">—</span>}</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-texto-cuerpo">{f.ingreso}</td>
                <td className="tabular px-3 py-2 text-right text-texto-cuerpo">{f.dias}</td>
                <td className="whitespace-nowrap px-3 py-2 text-texto-cuerpo">{f.proximaActividad ?? <span className="text-texto-tenue">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <PastillaDeSla estado={f.sla} />
                </td>
                <td className="px-2 py-2 text-right">
                  <MenuDeAcciones etiqueta={`Acciones de ${f.contacto}`} acciones={accionesDe(f)} />
                </td>
              </FilaEnlazada>
            ))}
          </tbody>
        </table>
      </div>

      <AsignarProspectos
        ids={panel?.tipo === "asignar" ? panel.ids : []}
        vendedores={panel?.tipo === "asignar" ? (vendedoresPorPais[panel.pais] ?? []) : []}
        abierto={panel?.tipo === "asignar"}
        alCerrar={() => {
          setPanel(null);
          setSeleccion(new Set());
        }}
        accion={acciones.asignar}
      />
      <DescartarProspecto
        leadId={panel?.tipo === "descartar" ? panel.id : ""}
        nombre={panel?.tipo === "descartar" ? panel.nombre : ""}
        motivos={motivos}
        abierto={panel?.tipo === "descartar"}
        alCerrar={() => setPanel(null)}
        accion={acciones.descartar}
      />
    </div>
  );
}

function Th({ children, alineada = false }: { children: React.ReactNode; alineada?: boolean }) {
  return <th className={clsx("eyebrow whitespace-nowrap px-3 py-2 font-medium", alineada && "text-right")}>{children}</th>;
}
