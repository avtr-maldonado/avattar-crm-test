"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Desplegable, ListaDeUno, ListaDeVarios } from "@/components/ui/Desplegable";
import { resumenDeVarios, type OpcionDeFiltro } from "@/components/ui/resumenDeFiltro";

export type EstadoDeUsuario = "activos" | "inactivos";

export type FiltrosActivosDeUsuarios = {
  estado: EstadoDeUsuario | null;
  roles: string[];
};

const ESTADOS: OpcionDeFiltro[] = [
  { valor: "activos", etiqueta: "Con acceso" },
  { valor: "inactivos", etiqueta: "Sin acceso" },
];

type Clave = "estado" | "rol";

/**
 * Las pastillas de la pestaña Usuarios · estado y rol (decisiones §55).
 *
 * Las mismas de Análisis y del pipeline (`Desplegable`): el estado es de uno,
 * el rol de varios con «Aplicar», y aplicar navega una sola vez reescribiendo
 * la URL (INV-10). La pestaña se conserva: el filtro vive dentro de Usuarios.
 */
export function FiltrosDeUsuarios({ activos, roles }: { activos: FiltrosActivosDeUsuarios; roles: OpcionDeFiltro[] }) {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState<Clave | null>(null);

  function navegar(cambio: Partial<FiltrosActivosDeUsuarios>) {
    const f = { ...activos, ...cambio };
    const p = new URLSearchParams({ p: "usuarios" });
    if (f.estado) p.set("estado", f.estado);
    for (const r of f.roles) p.append("rol", r);
    setAbierto(null);
    iniciar(() => router.push(`/configuracion?${p.toString()}`));
  }

  const hayFiltros = activos.estado !== null || activos.roles.length > 0;
  const atenuado = navegando ? "opacity-60" : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Desplegable
        className={atenuado}
        etiqueta="Estado"
        resumen={ESTADOS.find((e) => e.valor === activos.estado)?.etiqueta ?? "Todos"}
        activo={activos.estado !== null}
        abierto={abierto === "estado"}
        alAlternar={(v) => setAbierto(v ? "estado" : null)}
        ancho="w-48"
      >
        <ListaDeUno
          opciones={ESTADOS}
          elegido={activos.estado}
          alElegir={(v) => navegar({ estado: v === "activos" || v === "inactivos" ? v : null })}
        />
      </Desplegable>

      <Desplegable
        className={atenuado}
        etiqueta="Rol"
        resumen={resumenDeVarios(roles, activos.roles)}
        activo={activos.roles.length > 0}
        abierto={abierto === "rol"}
        alAlternar={(v) => setAbierto(v ? "rol" : null)}
        ancho="w-56"
      >
        <ListaDeVarios opciones={roles} elegidosAlAbrir={activos.roles} vacio="Sin roles." alAplicar={(v) => navegar({ roles: v })} />
      </Desplegable>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => navegar({ estado: null, roles: [] })}
          className={clsx(
            "rounded-pill px-2.5 py-1.5 text-xs font-medium text-texto-tenue underline-offset-2 transition-colors duration-rapido hover:text-texto-cuerpo hover:underline",
            atenuado,
          )}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
