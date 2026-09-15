"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { COOKIE_OFICINA, UN_ANIO_EN_SEGUNDOS } from "@/lib/preferencias";
import { buscarGlobal, type ResultadosDeBusqueda } from "@/lib/scope/busqueda";

/**
 * Las acciones que la barra superior necesita en toda la aplicación.
 *
 * Viven en el layout del grupo y llegan a los componentes cliente por
 * contexto (`ProveedorDeBarra`), no por props de cada pantalla: ocho pantallas
 * pasando las mismas dos funciones sería ruido, y un componente de
 * `components/` importando de `app/` invertiría la dirección de las capas.
 */

/**
 * Cambia la oficina activa. Se valida contra los países del usuario: la
 * oficina nunca amplía el alcance (AC-05). El layout se revalida entero porque
 * los contadores del menú dependen de ella.
 */
export async function elegirOficinaAccion(pais: string): Promise<ResultadoAccion> {
  const session = await requireSession();
  const valida = session.countryCodes.find((c) => c === pais);
  if (!valida) return falla("AUTORIZACION", `No operas en ${pais}.`);

  (await cookies()).set(COOKIE_OFICINA, valida, {
    path: "/",
    maxAge: UN_ANIO_EN_SEGUNDOS,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
  return ok(null);
}

/** El buscador global: dentro del alcance del rol, en las tres entidades. */
export async function buscarGlobalAccion(texto: string): Promise<ResultadosDeBusqueda> {
  const session = await requireSession();
  return buscarGlobal(session, texto);
}
