import { prisma } from "@/lib/db";

/**
 * La configuración del sistema · P-11.
 *
 * Todo lo que INV-05 saca del código vive aquí: umbrales de política comercial,
 * probabilidades y días de estancamiento por etapa, pesos MEDDIC, y la matriz
 * de permisos. Esta pantalla es lo que hace verificable el invariante — si un
 * umbral no aparece en P-11, es que está escrito en algún lado donde no debería.
 *
 * **No lleva alcance por rol.** No es un descuido: es configuración del sistema,
 * y quien llega aquí ya pasó por `requirePermission`. La autorización de esta
 * pantalla es de permiso, no de alcance de datos, y por eso se resuelve arriba
 * con `forbidden()` en vez de recortar filas.
 */
export async function configuracionDePipelines() {
  return prisma.pipeline.findMany({
    select: {
      id: true,
      name: true,
      countryCode: true,
      currency: true,
      isRenewal: true,
      active: true,
      stages: {
        select: {
          id: true,
          name: true,
          position: true,
          probability: true,
          staleAfterDays: true,
          gateMode: true,
          gateRequires: true,
          isClosing: true,
          _count: { select: { opportunities: true } },
        },
        orderBy: { position: "asc" },
      },
      meddicWeights: {
        select: { component: true, weight: true },
      },
    },
    orderBy: [{ isRenewal: "asc" }, { name: "asc" }],
  });
}

export async function configuracionDePolitica() {
  return prisma.country.findMany({
    select: {
      code: true,
      name: true,
      currency: true,
      taxRate: true,
      taxLabel: true,
      timezone: true,
      fiscalYearStartMonth: true,
      commercialPolicy: {
        select: {
          marginFloor: true,
          lineMarginFloor: true,
          discountThresholdMgmt: true,
          discountThresholdDir: true,
          approvalSlaHours: true,
          meddicMinToClosing: true,
          meddicMinToWin: true,
          meddicMinToCommit: true,
          healthyCoverageMin: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Los catálogos, con cuántas veces se usa cada valor.
 *
 * El conteo importa: MD-05 dice que los catálogos **se desactivan, nunca se
 * eliminan**, y saber si un motivo de pérdida se usó cien veces o ninguna es la
 * diferencia entre desactivarlo con tranquilidad y romper reportes históricos.
 */
export async function configuracionDeCatalogos() {
  const [tiposActividad, tiposDocumento, motivosPerdida, rolesComite, origenes, familias] =
    await Promise.all([
      prisma.activityType.findMany({
        select: { id: true, name: true, active: true, _count: { select: { activities: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.documentType.findMany({
        select: {
          id: true,
          name: true,
          active: true,
          isContract: true,
          _count: { select: { documents: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.lossReason.findMany({
        select: {
          id: true,
          name: true,
          active: true,
          requiresCompetitor: true,
          _count: { select: { opportunities: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.committeeRole.findMany({
        select: { id: true, name: true, active: true, _count: { select: { people: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.opportunitySource.findMany({
        select: {
          id: true,
          name: true,
          active: true,
          _count: { select: { opportunities: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.productFamily.findMany({
        select: { id: true, name: true, active: true, _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

  return { tiposActividad, tiposDocumento, motivosPerdida, rolesComite, origenes, familias };
}

/**
 * La matriz de permisos de §5.2, tal como está en la base.
 *
 * Se devuelve como matriz —permiso × rol— y no como lista plana, porque la
 * pregunta que alguien trae a esta pantalla es «¿quién puede ver el costo?», no
 * «¿qué permisos tiene el vendedor?».
 */
export async function configuracionDePermisos() {
  const permisos = await prisma.permission.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      rolePermissions: { select: { role: true, granted: true, limitValue: true } },
    },
    orderBy: { code: "asc" },
  });

  return permisos.map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    porRol: Object.fromEntries(
      p.rolePermissions.map((rp) => [
        rp.role,
        { granted: rp.granted, limite: rp.limitValue?.toString() ?? null },
      ]),
    ),
  }));
}

/** Cuántos usuarios activos hay de cada rol. Contexto para leer la matriz. */
export async function usuariosPorRol() {
  const filas = await prisma.user.groupBy({
    by: ["role"],
    where: { deletedAt: null, active: true },
    _count: true,
  });
  return Object.fromEntries(filas.map((f) => [f.role, f._count]));
}

/**
 * Los dos catálogos que el alta de oportunidad necesita, y solo esos.
 *
 * `configuracionDeCatalogos` trae seis con sus conteos de uso, que es lo que
 * P-11 necesita para decidir si desactivar algo rompe reportes. Traerlos todos
 * aquí sería pagar cinco consultas de más en la pantalla que más se abre.
 */
export async function catalogosParaAlta() {
  const [origenes, rolesComite, tiposDocumento] = await Promise.all([
    prisma.opportunitySource.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.committeeRole.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Para la pestaña de documentos: `isContract` es lo que satisface la
    // compuerta CONTRATO_O_OC_CARGADO.
    prisma.documentType.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { origenes, rolesComite, tiposDocumento };
}

/** Los tipos de actividad activos, para el formulario de registro (§12.4). */
export async function tiposDeActividad() {
  return prisma.activityType.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Las familias activas, para el selector del alta y edición de productos. */
export async function familiasDeProducto() {
  return prisma.productFamily.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Los motivos de pérdida vigentes, para el panel de «Perdida» (AC-20, RN-16). */
export async function motivosDePerdida() {
  return prisma.lossReason.findMany({
    where: { active: true },
    select: { id: true, name: true, requiresCompetitor: true },
    orderBy: { name: "asc" },
  });
}
