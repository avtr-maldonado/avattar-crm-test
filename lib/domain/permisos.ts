import type { Role } from "@prisma/client";
import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import { auditedTransaction } from "@/lib/audit";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

/**
 * La matriz de roles y permisos se edita desde Administración · §5.2 y
 * decisiones §40.
 *
 * ## Quién · por rol, no por permiso
 *
 * Es la única puerta del sistema que se decide por el rol y no por una fila de
 * la matriz: un permiso «editar permisos» se podría quitar a sí mismo, y el
 * sistema quedaría sin nadie que pudiera devolverlo. Y por lo mismo **la
 * columna de Administración no se edita desde aquí**: es la llave de la casa;
 * se cambia en la base, con intención.
 *
 * ## Qué cambia
 *
 * Una celda: concedido o no, y para los permisos con tope (autorizar
 * descuento, RN-04) la fracción máxima. Cada cambio queda en la bitácora
 * (INV-09). La caché de permisos del proceso la invalida la acción que llama
 * aquí: este módulo no conoce la sesión de Next.
 */
const ROLES: readonly Role[] = ["VENDEDOR", "GERENTE_PAIS", "DIRECCION", "ADMINISTRADOR", "PREVENTA"];

/** Los permisos que llevan tope: la matriz solo admite `limite` en ellos. */
export const PERMISOS_CON_TOPE: ReadonlySet<string> = new Set(["AUTORIZAR_DESCUENTO"]);

export type CambioDePermiso = {
  role: Role;
  code: string;
  granted: boolean;
  /** Fracción (`0.3000` = 30 %). Solo en permisos con tope; `null` lo quita. */
  limite?: string | null;
};

export async function cambiarPermiso(session: Session, cambio: CambioDePermiso): Promise<ResultadoAccion> {
  if (session.role !== "ADMINISTRADOR") {
    return falla("AUTORIZACION", "La matriz de permisos la edita Administración.");
  }
  if (!ROLES.includes(cambio.role)) {
    return falla("VALIDACION", { campo: "role", mensaje: "Ese rol no existe." });
  }
  if (cambio.role === "ADMINISTRADOR") {
    return falla("VALIDACION", {
      campo: "role",
      mensaje: "La columna de Administración no se edita desde aquí: es la que permite editar las demás.",
    });
  }

  const permiso = await prisma.permission.findUnique({ where: { code: cambio.code }, select: { id: true, code: true } });
  if (!permiso) {
    return falla("VALIDACION", { campo: "code", mensaje: "Ese permiso no existe." });
  }

  let limite: string | null = null;
  if (cambio.granted && cambio.limite != null && cambio.limite.trim() !== "") {
    if (!PERMISOS_CON_TOPE.has(permiso.code)) {
      return falla("VALIDACION", { campo: "limite", mensaje: "Este permiso no lleva tope: se concede o no." });
    }
    let fraccion;
    try {
      fraccion = money(cambio.limite.trim());
    } catch {
      return falla("VALIDACION", { campo: "limite", mensaje: "Escribe el tope como fracción o porcentaje válido." });
    }
    if (fraccion.lte(0) || fraccion.gt(1)) {
      return falla("VALIDACION", { campo: "limite", mensaje: "El tope va de 1 % a 100 %." });
    }
    limite = fraccion.toFixed(4);
  }

  const previo = await prisma.rolePermission.findUnique({
    where: { role_permissionId: { role: cambio.role, permissionId: permiso.id } },
    select: { granted: true, limitValue: true },
  });
  const antes = { role: cambio.role, code: permiso.code, granted: previo?.granted ?? false, limite: previo?.limitValue?.toString() ?? null };
  const despues = { role: cambio.role, code: permiso.code, granted: cambio.granted, limite };
  if (antes.granted === despues.granted && antes.limite === despues.limite) return ok(null);

  await auditedTransaction(async (tx, audit) => {
    await tx.rolePermission.upsert({
      where: { role_permissionId: { role: cambio.role, permissionId: permiso.id } },
      update: { granted: cambio.granted, limitValue: limite },
      create: { role: cambio.role, permissionId: permiso.id, granted: cambio.granted, limitValue: limite },
    });
    await audit({
      entity: "RolePermission",
      entityId: `${cambio.role}:${permiso.code}`,
      action: "EDITAR_PERMISO",
      byUserId: session.userId,
      before: antes,
      after: despues,
    });
  });

  return ok(null);
}
