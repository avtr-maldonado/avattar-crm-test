"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deZod, falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { requireSession } from "@/lib/auth/session";
import { crearUsuario, darAcceso, editarUsuario } from "@/lib/domain/usuario";
import { getUsuario } from "@/lib/scope/usuarios";

/**
 * Las mutaciones de Administración · P-11. Por ahora, usuarios.
 *
 * Validan con Zod, cargan por `lib/scope` y delegan en `lib/domain`, que es
 * quien decide con `ADMINISTRAR_USUARIOS` y escribe la bitácora (INV-09).
 */
export type ResultadoDeUsuario = ResultadoAccion<{ id: string } | null>;

const ROLES = ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"] as const;
const PAISES = ["MX", "CO", "CL"] as const;
type Pais = (typeof PAISES)[number];

const esquemaBase = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo."),
  role: z.enum(ROLES, { message: "Elige un rol." }),
});

const esquemaAlta = esquemaBase.extend({
  email: z.string().trim().email("Ese correo no tiene forma de correo."),
});

const esquemaEdicion = esquemaBase.extend({
  userId: z.string().min(1),
  active: z.coerce.boolean().optional(),
});

const esquemaAcceso = esquemaAlta.extend({
  authUserId: z.string().min(1),
});

/**
 * Las casillas de país llegan repetidas en el `FormData` bajo el mismo nombre;
 * `Object.fromEntries` se quedaría con la última. El dominio exige al menos uno.
 */
function paisesDe(form: FormData): Pais[] {
  return form
    .getAll("countryCodes")
    .map(String)
    .filter((v): v is Pais => (PAISES as readonly string[]).includes(v));
}

export async function crearUsuarioAccion(
  _previo: ResultadoDeUsuario | null,
  form: FormData,
): Promise<ResultadoDeUsuario> {
  const datos = esquemaAlta.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const r = await crearUsuario(session, {
    email: d.email,
    name: d.name,
    role: d.role,
    countryCodes: paisesDe(form),
  });
  if (!r.ok) return r;

  revalidatePath("/admin");
  return ok(r.datos);
}

export async function editarUsuarioAccion(
  _previo: ResultadoDeUsuario | null,
  form: FormData,
): Promise<ResultadoDeUsuario> {
  const datos = esquemaEdicion.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const usuario = await getUsuario(session, d.userId).catch(() => null);
  if (!usuario) return falla("AUTORIZACION", "No encontramos ese usuario, o no puedes administrarlo.");

  const r = await editarUsuario(session, usuario, {
    name: d.name,
    role: d.role,
    countryCodes: paisesDe(form),
    // Una casilla que no se marca no viaja: su ausencia ES «inactivo».
    active: d.active ?? false,
  });
  if (!r.ok) return r;

  revalidatePath("/admin");
  return ok(null);
}

export async function darAccesoAccion(
  _previo: ResultadoDeUsuario | null,
  form: FormData,
): Promise<ResultadoDeUsuario> {
  const datos = esquemaAcceso.safeParse(Object.fromEntries(form));
  if (!datos.success) return deZod(datos.error);
  const d = datos.data;

  const session = await requireSession();
  const r = await darAcceso(session, {
    authUserId: d.authUserId,
    email: d.email,
    name: d.name,
    role: d.role,
    countryCodes: paisesDe(form),
  });
  if (!r.ok) return r;

  revalidatePath("/admin");
  return ok(r.datos);
}
