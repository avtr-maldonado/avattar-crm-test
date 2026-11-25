import { Prisma } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import { can, type Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

/**
 * Canales y campañas de prospectos administrables · decisiones §68.
 *
 * Quien gestiona prospectos (`GESTIONAR_PROSPECTOS`) los da de alta, los
 * renombra y los desactiva. «Eliminar» es desactivar (MD-05): los prospectos
 * los siguen referenciando y su historia no se reescribe. Lo inactivo sale del
 * alta, la edición y la importación; se queda en los filtros. Cada cambio deja
 * `EDITAR_CATALOGO` en la misma transacción (INV-09); un guardado que no cambia
 * nada no escribe.
 */
const SIN_PERMISO = "Administrar canales y campañas es de quien gestiona prospectos.";
const MAXIMO = 80;

type Problema = { campo: string; mensaje: string };

/** El nombre como se guarda: sin espacios en los extremos ni repetidos. */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

export function validarNombre(nombre: string): string | null {
  const n = normalizarNombre(nombre);
  if (n.length < 2) return "Escribe el nombre.";
  if (n.length > MAXIMO) return `El nombre admite hasta ${MAXIMO} caracteres.`;
  return null;
}

/**
 * Las opciones activas más el valor que el prospecto ya tiene, si está inactivo:
 * sin él, el `<select>` caería en otra opción y el guardado cambiaría el canal
 * o la campaña sin que nadie lo pidiera.
 */
export function conservandoActual<T extends { id: string; name: string }>(
  activos: T[],
  actual: { id: string; name: string } | null,
  marca = "(inactivo)",
): { id: string; name: string }[] {
  if (!actual || activos.some((a) => a.id === actual.id)) return activos;
  return [...activos, { id: actual.id, name: `${actual.name} ${marca}` }];
}

type Catalogo = "canal" | "campana";

/** El homónimo se busca sin importar mayúsculas; el nombre ya llega normalizado. */
async function homonimo(catalogo: Catalogo, nombre: string, salvo?: string): Promise<Problema | null> {
  const where = { name: { equals: nombre, mode: "insensitive" as const }, ...(salvo ? { id: { not: salvo } } : {}) };
  const otro =
    catalogo === "canal"
      ? await prisma.leadChannel.findFirst({ where, select: { name: true } })
      : await prisma.leadCampaign.findFirst({ where, select: { name: true } });
  if (!otro) return null;
  const que = catalogo === "canal" ? "un canal" : "una campaña";
  return { campo: "name", mensaje: `Ya existe ${que} «${otro.name}».` };
}

function nombreValido(nombre: string): Problema | null {
  const m = validarNombre(nombre);
  return m ? { campo: "name", mensaje: m } : null;
}

/** La carrera entre dos altas iguales la resuelve el índice único; se reporta igual que el homónimo. */
function esDuplicado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function duplicado(nombre: string): ResultadoAccion<never> {
  return falla("VALIDACION", { campo: "name", mensaje: `Ya existe «${nombre}».` });
}

// ─────────────────────────────────────────────────────────────── Canales

export async function crearCanal(session: Session, input: { name: string }): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "GESTIONAR_PROSPECTOS")) return falla("AUTORIZACION", SIN_PERMISO);
  const name = normalizarNombre(input.name);
  const problema = nombreValido(name) ?? (await homonimo("canal", name));
  if (problema) return falla("VALIDACION", problema);

  try {
    const creado = await auditedTransaction(async (tx, audit) => {
      const c = await tx.leadChannel.create({ data: { name }, select: { id: true } });
      await audit({ entity: "LeadChannel", entityId: c.id, action: "EDITAR_CATALOGO", byUserId: session.userId, after: { name, active: true } });
      return c;
    });
    return ok(creado);
  } catch (e) {
    if (esDuplicado(e)) return duplicado(name);
    throw e;
  }
}

export async function editarCanal(
  session: Session,
  id: string,
  cambios: { name?: string; active?: boolean },
): Promise<ResultadoAccion<null>> {
  if (!can(session, "GESTIONAR_PROSPECTOS")) return falla("AUTORIZACION", SIN_PERMISO);
  const actual = await prisma.leadChannel.findUnique({ where: { id }, select: { name: true, active: true } });
  if (!actual) return falla("CONFLICTO", "Ese canal ya no existe.");

  const antes: Record<string, string | boolean> = {};
  const despues: Record<string, string | boolean> = {};
  if (cambios.name !== undefined) {
    const name = normalizarNombre(cambios.name);
    if (name !== actual.name) {
      const problema = nombreValido(name) ?? (await homonimo("canal", name, id));
      if (problema) return falla("VALIDACION", problema);
      antes.name = actual.name;
      despues.name = name;
    }
  }
  if (cambios.active !== undefined && cambios.active !== actual.active) {
    antes.active = actual.active;
    despues.active = cambios.active;
  }
  if (Object.keys(despues).length === 0) return ok(null);

  try {
    await auditedTransaction(async (tx, audit) => {
      await tx.leadChannel.update({ where: { id }, data: despues });
      await audit({ entity: "LeadChannel", entityId: id, action: "EDITAR_CATALOGO", byUserId: session.userId, before: antes, after: despues });
    });
    return ok(null);
  } catch (e) {
    if (esDuplicado(e)) return duplicado(String(despues.name));
    throw e;
  }
}

// ────────────────────────────────────────────────────────────── Campañas

/** El canal de una campaña es opcional; si se elige uno nuevo, debe estar activo. */
async function canalParaCampana(channelId: string): Promise<Problema | null> {
  const canal = await prisma.leadChannel.findFirst({ where: { id: channelId, active: true }, select: { id: true } });
  return canal ? null : { campo: "channelId", mensaje: "Ese canal no existe o está inactivo." };
}

export async function crearCampana(
  session: Session,
  input: { name: string; channelId?: string | null },
): Promise<ResultadoAccion<{ id: string }>> {
  if (!can(session, "GESTIONAR_PROSPECTOS")) return falla("AUTORIZACION", SIN_PERMISO);
  const name = normalizarNombre(input.name);
  const channelId = input.channelId || null;
  const problemas = [
    nombreValido(name) ?? (await homonimo("campana", name)),
    channelId ? await canalParaCampana(channelId) : null,
  ].filter((p): p is Problema => p !== null);
  if (problemas.length > 0) return falla("VALIDACION", ...problemas);

  try {
    const creada = await auditedTransaction(async (tx, audit) => {
      const c = await tx.leadCampaign.create({ data: { name, channelId }, select: { id: true } });
      await audit({ entity: "LeadCampaign", entityId: c.id, action: "EDITAR_CATALOGO", byUserId: session.userId, after: { name, channelId, active: true } });
      return c;
    });
    return ok(creada);
  } catch (e) {
    if (esDuplicado(e)) return duplicado(name);
    throw e;
  }
}

export async function editarCampana(
  session: Session,
  id: string,
  cambios: { name?: string; channelId?: string | null; active?: boolean },
): Promise<ResultadoAccion<null>> {
  if (!can(session, "GESTIONAR_PROSPECTOS")) return falla("AUTORIZACION", SIN_PERMISO);
  const actual = await prisma.leadCampaign.findUnique({ where: { id }, select: { name: true, channelId: true, active: true } });
  if (!actual) return falla("CONFLICTO", "Esa campaña ya no existe.");

  const antes: Record<string, string | boolean | null> = {};
  const despues: Record<string, string | boolean | null> = {};
  const problemas: Problema[] = [];
  if (cambios.name !== undefined) {
    const name = normalizarNombre(cambios.name);
    if (name !== actual.name) {
      const problema = nombreValido(name) ?? (await homonimo("campana", name, id));
      if (problema) problemas.push(problema);
      antes.name = actual.name;
      despues.name = name;
    }
  }
  if (cambios.channelId !== undefined) {
    const channelId = cambios.channelId || null;
    if (channelId !== actual.channelId) {
      const problema = channelId ? await canalParaCampana(channelId) : null;
      if (problema) problemas.push(problema);
      antes.channelId = actual.channelId;
      despues.channelId = channelId;
    }
  }
  if (problemas.length > 0) return falla("VALIDACION", ...problemas);
  if (cambios.active !== undefined && cambios.active !== actual.active) {
    antes.active = actual.active;
    despues.active = cambios.active;
  }
  if (Object.keys(despues).length === 0) return ok(null);

  try {
    await auditedTransaction(async (tx, audit) => {
      await tx.leadCampaign.update({ where: { id }, data: despues });
      await audit({ entity: "LeadCampaign", entityId: id, action: "EDITAR_CATALOGO", byUserId: session.userId, before: antes, after: despues });
    });
    return ok(null);
  } catch (e) {
    if (esDuplicado(e)) return duplicado(String(despues.name));
    throw e;
  }
}
