import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";

/**
 * Los hitos de facturación · `HF-01`, `HF-04`.
 *
 * El cuadre vive en `milestone.ts`, que es puro. Aquí lo que escribe.
 *
 * **Se guarda monto, nunca porcentaje** (§4). El conmutador `%` de la captura
 * convierte antes de enviar: si se guardara el porcentaje, un cambio de
 * cotización reajustaría el calendario de cobro en silencio, y nadie se
 * enteraría de que dejó de cuadrar.
 */

export type EntradaDeHito = {
  /** Al editar uno existente. */
  milestoneId?: string;
  description: string;
  dueDate: Date;
  /** Ya en monto. La conversión desde `%` ocurre antes de llegar aquí. */
  amount: string;
};

function editable(detalle: DetalleOportunidad): ResultadoAccion | null {
  if (detalle.status === "ABIERTA") return null;
  return falla(
    "AUTORIZACION",
    "Una oportunidad cerrada no cambia su calendario de cobro. Reabrirla es de Administración (RN-18).",
  );
}

export async function guardarHito(
  _session: Session,
  detalle: DetalleOportunidad,
  entrada: EntradaDeHito,
): Promise<ResultadoAccion> {
  const bloqueada = editable(detalle);
  if (bloqueada) return bloqueada;

  const description = entrada.description.trim();
  if (description.length < 3) {
    return falla("VALIDACION", {
      campo: "description",
      mensaje: "Di qué se factura en este hito: «Anticipo», «Entrega de la fase 1».",
    });
  }

  const amount = money(entrada.amount);
  if (amount.lte(0)) {
    return falla("VALIDACION", { campo: "amount", mensaje: "El monto tiene que ser mayor que cero." });
  }

  if (entrada.milestoneId) {
    await prisma.milestone.updateMany({
      where: { id: entrada.milestoneId, opportunityId: detalle.id },
      data: { description, dueDate: entrada.dueDate, amount },
    });
  } else {
    const ultimo = await prisma.milestone.findFirst({
      where: { opportunityId: detalle.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await prisma.milestone.create({
      data: {
        opportunityId: detalle.id,
        position: (ultimo?.position ?? 0) + 1,
        description,
        dueDate: entrada.dueDate,
        amount,
      },
    });
  }

  return ok(null);
}

export async function quitarHito(
  _session: Session,
  detalle: DetalleOportunidad,
  milestoneId: string,
): Promise<ResultadoAccion> {
  const bloqueada = editable(detalle);
  if (bloqueada) return bloqueada;

  await prisma.milestone.deleteMany({ where: { id: milestoneId, opportunityId: detalle.id } });
  return ok(null);
}

/**
 * Marca un hito como cumplido, o lo devuelve a pendiente.
 *
 * Es lo que convierte el calendario en seguimiento de cobro: sin esto la
 * pestaña dice qué se va a facturar, pero no qué ya se facturó.
 */
export async function marcarHito(
  _session: Session,
  detalle: DetalleOportunidad,
  milestoneId: string,
  cumplido: boolean,
): Promise<ResultadoAccion> {
  await prisma.milestone.updateMany({
    where: { id: milestoneId, opportunityId: detalle.id },
    data: {
      status: cumplido ? "CUMPLIDO" : "PENDIENTE",
      completedAt: cumplido ? new Date() : null,
    },
  });
  return ok(null);
}
