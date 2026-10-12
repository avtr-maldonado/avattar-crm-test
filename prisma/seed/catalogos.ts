import type { MeddicComponent, PrismaClient } from "@prisma/client";
import { PERMISOS_POR_ROL } from "./permisos";
import {
  ETAPAS_RENOVACION,
  ETAPAS_VENTA,
  FAMILIAS_PRODUCTO,
  GATE_MODE_INICIAL,
  MOTIVOS_PERDIDA,
  ORIGENES,
  PAISES,
  PESOS_MEDDIC,
  PIPELINES,
  POLITICA_BASE,
  ROLES_COMITE,
  TIPOS_ACTIVIDAD,
  TIPOS_DOCUMENTO,
} from "./datos";

/**
 * Lo que un ambiente necesita para existir, sin un solo dato de negocio.
 *
 * Países y su política comercial, la matriz de permisos de §5.2, los seis
 * catálogos, y los pipelines con sus etapas y pesos MEDDIC. Nada de usuarios,
 * cuentas, personas, oportunidades ni productos: eso es escenario (§15) o es
 * trabajo real, y ninguno de los dos pertenece a un ambiente recién creado.
 *
 * Se separó del seed del escenario el 12 de octubre de 2026, al preparar el
 * ambiente productivo (plan D3): antes `prisma/seed.ts` sembraba configuración
 * y demostración de corrido, así que no había forma de poblar una base nueva
 * sin arrastrar quince oportunidades inventadas.
 *
 * Idempotente, como el seed del que salió: todo va por `upsert` con una llave
 * natural. Correrlo dos veces no duplica nada, y correrlo sobre un ambiente
 * vivo **no** pisa lo que el negocio haya ajustado en pantalla salvo en lo que
 * estas listas declaran. Ahí está el cuidado: la matriz de permisos es
 * editable desde Administración (§40), así que volver a correr esto la
 * devuelve a la del código. Es la razón por la que en producción se corre una
 * vez, al crear el ambiente, y después no.
 *
 * Devuelve el mapa de etapas por pipeline porque el escenario lo necesita para
 * colgar sus oportunidades; en producción se ignora.
 */
export async function sembrarCatalogos(prisma: PrismaClient) {
  // ── Países y política comercial ────────────────────────────────────────
  // En serie, por la misma razón que los catálogos de abajo: la política de
  // cada país espera a su país por la llave foránea, y el pooler en modo
  // sesión no da para abrir una conexión por cada upsert.
  for (const pais of PAISES) {
    await prisma.country.upsert({
      where: { code: pais.code },
      update: {
        name: pais.name,
        taxRate: pais.taxRate,
        taxLabel: pais.taxLabel,
        timezone: pais.timezone,
      },
      create: { ...pais, fiscalYearStartMonth: 1 },
    });
    await prisma.commercialPolicy.upsert({
      where: { countryCode: pais.code },
      update: POLITICA_BASE,
      create: { countryCode: pais.code, ...POLITICA_BASE },
    });
  }
  console.log(`  ${PAISES.length} países con su política comercial`);

  // ── Permisos y la matriz de §5.2 ───────────────────────────────────────
  for (const [code, meta] of Object.entries(PERMISOS_POR_ROL)) {
    const permiso = await prisma.permission.upsert({
      where: { code },
      update: { name: meta.nombre, description: meta.descripcion },
      create: { code, name: meta.nombre, description: meta.descripcion },
    });
    for (const [role, valor] of Object.entries(meta.roles)) {
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as never, permissionId: permiso.id } },
        update: { granted: valor.granted, limitValue: valor.limite ?? null },
        create: {
          role: role as never,
          permissionId: permiso.id,
          granted: valor.granted,
          limitValue: valor.limite ?? null,
        },
      });
    }
  }
  console.log(`  ${Object.keys(PERMISOS_POR_ROL).length} permisos con su matriz por rol`);

  // ── Catálogos ──────────────────────────────────────────────────────────
  // Las seis listas son independientes entre sí, pero van en serie: en
  // paralelo son medio centenar de `upsert` a la vez, y el pooler en modo
  // sesión de un proyecto nuevo corta en quince conexiones
  // (`EMAXCONNSESSION`). Pasó el 12-oct-2026 sembrando producción. Son
  // cuarenta y tantas filas: el paralelismo no compraba nada.
  for (const name of TIPOS_ACTIVIDAD) {
    await prisma.activityType.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const t of TIPOS_DOCUMENTO) {
    await prisma.documentType.upsert({
      where: { name: t.name },
      update: { isContract: t.isContract },
      create: t,
    });
  }
  for (const m of MOTIVOS_PERDIDA) {
    await prisma.lossReason.upsert({
      where: { name: m.name },
      update: { requiresCompetitor: m.requiresCompetitor },
      create: m,
    });
  }
  for (const name of ROLES_COMITE) {
    await prisma.committeeRole.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of ORIGENES) {
    await prisma.opportunitySource.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of FAMILIAS_PRODUCTO) {
    await prisma.productFamily.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(
    `  catálogos: ${TIPOS_ACTIVIDAD.length} tipos de actividad, ${TIPOS_DOCUMENTO.length} de documento, ` +
      `${MOTIVOS_PERDIDA.length} motivos de pérdida, ${ROLES_COMITE.length} roles de comité, ` +
      `${ORIGENES.length} orígenes, ${FAMILIAS_PRODUCTO.length} familias`,
  );

  // ── Pipelines, etapas y pesos MEDDIC ───────────────────────────────────
  const etapasPorPipeline = new Map<string, Map<string, string>>();
  for (const p of PIPELINES) {
    const existente = await prisma.pipeline.findFirst({
      where: { name: p.nombre },
      select: { id: true },
    });
    const pipeline = existente
      ? await prisma.pipeline.update({
          where: { id: existente.id },
          data: { countryCode: p.pais, isRenewal: p.renovacion },
        })
      : await prisma.pipeline.create({
          data: { name: p.nombre, countryCode: p.pais, isRenewal: p.renovacion },
        });

    const etapas = p.renovacion ? ETAPAS_RENOVACION : ETAPAS_VENTA;
    const mapa = new Map<string, string>();
    for (const e of etapas) {
      const fila = await prisma.stage.upsert({
        where: { pipelineId_position: { pipelineId: pipeline.id, position: e.position } },
        update: {
          name: e.name,
          probability: e.probability,
          staleAfterDays: e.staleAfterDays,
          gateRequires: [...e.gateRequires],
          gateMode: GATE_MODE_INICIAL,
          isClosing: e.isClosing,
        },
        create: {
          pipelineId: pipeline.id,
          name: e.name,
          position: e.position,
          probability: e.probability,
          staleAfterDays: e.staleAfterDays,
          gateRequires: [...e.gateRequires],
          gateMode: GATE_MODE_INICIAL,
          isClosing: e.isClosing,
        },
      });
      mapa.set(e.name, fila.id);
    }
    etapasPorPipeline.set(p.nombre, mapa);

    for (const [component, weight] of Object.entries(PESOS_MEDDIC)) {
      await prisma.meddicWeight.upsert({
        where: {
          pipelineId_component: {
            pipelineId: pipeline.id,
            component: component as MeddicComponent,
          },
        },
        update: { weight },
        create: { pipelineId: pipeline.id, component: component as MeddicComponent, weight },
      });
    }
  }
  console.log(`  ${PIPELINES.length} pipelines con sus etapas y pesos MEDDIC`);

  return { etapasPorPipeline };
}
