import { falla, ok, type ResultadoAccion } from "@/lib/acciones";
import type { Session } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DetalleOportunidad } from "@/lib/scope/opportunityDetail";

/**
 * Carga y descarga de documentos · E2.
 *
 * ## El bucket tiene que ser privado
 *
 * Aquí viven contratos, órdenes de compra y propuestas de los clientes de
 * Avattar. Con el bucket en público, **cualquiera con la URL descarga el
 * archivo sin autenticarse**, y una URL que se filtra una vez —un correo
 * reenviado, un historial de navegador, una captura— es acceso permanente.
 *
 * Por eso la descarga va por **URL firmada y de vida corta**, generada en el
 * servidor solo para quien alcanza la oportunidad. Eso es lo correcto con el
 * bucket privado; con el bucket público el código sigue siendo correcto pero
 * la protección no sirve, porque la ruta directa también responde.
 *
 * Verificado el 9-sep-2026: el bucket `documentos` está en **público**. Hay que
 * apagarlo en Supabase → Storage → documentos → Public bucket.
 */
const BUCKET = "documentos";

/** Diez minutos: suficiente para abrir el archivo, corto para que no circule. */
const VIGENCIA_DE_LA_FIRMA = 600;

/**
 * Lo que se acepta subir.
 *
 * Lista blanca, no lista negra: enumerar lo prohibido deja fuera lo que nadie
 * previó, y un `.html` o un `.svg` servidos desde el mismo origen son un vector
 * de scripting.
 */
const TIPOS_PERMITIDOS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
]);

const TAMANO_MAXIMO = 25 * 1024 * 1024;

/**
 * Sube un documento y lo liga a la oportunidad.
 *
 * ## La versión se calcula, no se captura
 *
 * Subir un archivo con el mismo nombre y tipo no reemplaza al anterior: crea la
 * versión siguiente. Un contrato no se sobrescribe — se corrige, y las dos
 * versiones tienen que poder mirarse. El archivo viejo se queda en el bucket
 * con su propia ruta.
 */
export async function subirDocumento(
  session: Session,
  detalle: DetalleOportunidad,
  entrada: { typeId: string; archivo: File },
): Promise<ResultadoAccion<{ id: string; version: number }>> {
  const { archivo } = entrada;

  if (archivo.size === 0) {
    return falla("VALIDACION", { campo: "archivo", mensaje: "El archivo llegó vacío." });
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return falla("VALIDACION", {
      campo: "archivo",
      mensaje: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 25 MB.`,
    });
  }
  if (!TIPOS_PERMITIDOS.has(archivo.type)) {
    return falla("VALIDACION", {
      campo: "archivo",
      mensaje: `No se aceptan archivos de tipo «${archivo.type || "desconocido"}». Sí: PDF, Word, Excel, PowerPoint, imágenes y texto.`,
    });
  }

  const tipo = await prisma.documentType.findFirst({
    where: { id: entrada.typeId, active: true },
    select: { id: true, name: true },
  });
  if (!tipo) {
    return falla("VALIDACION", { campo: "typeId", mensaje: "Ese tipo de documento no existe." });
  }

  const anterior = await prisma.document.findFirst({
    where: { opportunityId: detalle.id, typeId: tipo.id, name: archivo.name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (anterior?.version ?? 0) + 1;

  // La ruta lleva la oportunidad y la versión: dos archivos con el mismo nombre
  // nunca se pisan, y el anterior sigue descargable.
  const storageKey = `${detalle.id}/${version}-${Date.now()}-${sanitizar(archivo.name)}`;

  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, archivo, { contentType: archivo.type, upsert: false });

  if (error) {
    return falla("CONFLICTO", `No se pudo guardar el archivo: ${error.message}`);
  }

  // La fila se escribe DESPUÉS de que el archivo existe. Al revés quedaría un
  // documento en la lista que al abrirlo no está.
  const creado = await prisma.document.create({
    data: {
      typeId: tipo.id,
      name: archivo.name,
      version,
      storageKey,
      sizeBytes: archivo.size,
      mimeType: archivo.type,
      opportunityId: detalle.id,
      organizationId: detalle.organization.id,
      uploadedById: session.userId,
    },
    select: { id: true, version: true },
  });

  return ok(creado);
}

/**
 * Una URL firmada para descargar, válida diez minutos.
 *
 * El alcance ya se aplicó al cargar el documento por `lib/scope`: si llegó
 * hasta aquí, la sesión alcanza su oportunidad.
 */
export async function urlDeDescarga(storageKey: string): Promise<ResultadoAccion<{ url: string }>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, VIGENCIA_DE_LA_FIRMA);

  if (error || !data) {
    return falla("CONFLICTO", `No se pudo abrir el archivo: ${error?.message ?? "sin respuesta"}`);
  }
  return ok({ url: data.signedUrl });
}

/**
 * Quita un documento de la oportunidad.
 *
 * ## La fila se borra en duro, y eso es lo que dice el spec
 *
 * `INV-15` **no cubre `Document`**: §6 acota el borrado lógico a Organization,
 * Person, Opportunity, Activity y User. Aquí se borra la fila de verdad.
 *
 * El archivo, en cambio, se queda en el bucket. No es una red de seguridad
 * pensada: es lo que pasa cuando se borra la fila que guardaba su `storageKey`.
 * Queda huérfano —solo recuperable por alguien con acceso a Storage, buscando a
 * mano— y consume espacio para siempre.
 *
 * ## Lo que esto deja sin resolver · `Q-16`
 *
 * Quitar un contrato u orden de compra **apaga la compuerta
 * `CONTRATO_O_OC_CARGADO`** de la etapa de Cierre, y no queda rastro de quién lo
 * hizo: `INV-09` enumera las acciones sensibles y esta no está en la lista, así
 * que `AuditAction` no la admite. Si el negocio quiere el rastro, son dos
 * cambios: agregar `QUITAR_DOCUMENTO` a la unión de `lib/audit` y envolver este
 * borrado en `auditedTransaction`. Está anotado en
 * `docs/decisiones-pendientes.md`.
 */
export async function quitarDocumento(
  _session: Session,
  detalle: DetalleOportunidad,
  documentId: string,
): Promise<ResultadoAccion> {
  await prisma.document.deleteMany({ where: { id: documentId, opportunityId: detalle.id } });
  return ok(null);
}

/** Deja el nombre utilizable como ruta, sin perder de qué archivo se trata. */
function sanitizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}
