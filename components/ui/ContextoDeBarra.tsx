"use client";

import { createContext, useContext } from "react";
import type { ResultadoAccion } from "@/lib/acciones";
import type { CountryCode } from "@/lib/dto";
import type { ResultadosDeBusqueda } from "@/lib/scope/busqueda";

/**
 * Lo que la barra superior necesita saber en cualquier pantalla: la oficina
 * activa, entre cuáles se puede elegir, y las dos acciones globales.
 *
 * Lo provee el layout del grupo una sola vez. Así ninguna pantalla tiene que
 * pasar estas funciones a `BarraSuperior`, y `components/` no importa de
 * `app/`, que invertiría la dirección de las capas.
 */
export type ContextoDeBarra = {
  oficinaActiva: CountryCode;
  oficinas: CountryCode[];
  elegirOficina: (pais: CountryCode) => Promise<ResultadoAccion>;
  buscar: (texto: string) => Promise<ResultadosDeBusqueda>;
};

const Contexto = createContext<ContextoDeBarra | null>(null);

export function ProveedorDeBarra({
  valor,
  children,
}: {
  valor: ContextoDeBarra;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useBarra(): ContextoDeBarra {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useBarra solo funciona dentro de ProveedorDeBarra, que monta el layout de (app).");
  }
  return contexto;
}
