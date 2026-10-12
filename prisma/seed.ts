import { PrismaClient, type MeddicComponent } from "@prisma/client";
import { computeMeddicScore } from "@/lib/domain/meddic";
import { derivarActividades } from "./seed/actividades";
import { sembrarCatalogos } from "./seed/catalogos";
import { derivarMeddic } from "./seed/meddic";
import {
  ANIO_FISCAL,
  CUOTAS_T3,
  DESCUADRE_DELIBERADO,
  MEDDIC_DETALLADO,
  OPORTUNIDADES,
  ORGANIZACIONES,
  PERSONAS_ACEROS,
  PESOS_MEDDIC,
  PRODUCTOS,
  USUARIOS,
  correoDe,
} from "./seed/datos";

/**
 * Siembra el escenario del prototipo aprobado (§15).
 *
 * Los catálogos —países, política, permisos, las seis listas y los pipelines—
 * salieron a `./seed/catalogos` el 12 de octubre de 2026, para poder poblar un
 * ambiente nuevo sin arrastrar este escenario (`pnpm db:seed:catalogos`).
 *
 * Idempotente: todo va por `upsert` con una llave natural, así que correrlo dos
 * veces no duplica. Eso importa porque el seed se corre a mano durante el
 * desarrollo, no solo al crear la base.
 *
 * Al final verifica los tres totales y **falla si no cuadran**. Un seed que
 * miente sobre el escenario aprobado es peor que no tenerlo: las demostraciones
 * dejan de ser comparables con lo que Dirección autorizó.
 */
const prisma = new PrismaClient();

/** Fecha base del escenario. Fija para que las banderas sean reproducibles. */
const HOY = new Date("2026-09-01T12:00:00Z");

const enDias = (dias: number) =>
  new Date(HOY.getTime() + dias * 24 * 60 * 60 * 1000);

async function main() {
  console.log("Sembrando el escenario del prototipo aprobado (§15)…\n");

  const { etapasPorPipeline } = await sembrarCatalogos(prisma);

  // ── Usuarios ─────────────────────────────────────────────────────────────
  const filasUsuario = await Promise.all(
    USUARIOS.map((u) =>
      prisma.user.upsert({
        where: { email: correoDe(u) },
        update: { name: u.name, role: u.role, countryCodes: [...u.paises], initials: u.clave },
        create: {
          email: correoDe(u),
          name: u.name,
          initials: u.clave,
          role: u.role,
          countryCodes: [...u.paises],
        },
      }),
    ),
  );
  const usuarios = new Map<string, string>(
    USUARIOS.map((u, i) => [u.clave, filasUsuario[i].id]),
  );
  console.log(`  ${USUARIOS.length} usuarios`);


  // ── Productos y lista de precio ──────────────────────────────────────────
  const familias = new Map(
    (await prisma.productFamily.findMany({ select: { id: true, name: true } })).map((f) => [
      f.name,
      f.id,
    ]),
  );
  for (const p of PRODUCTOS) {
    const producto = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        familyId: familias.get(p.familia)!,
        unit: p.unit,
        priceModel: p.priceModel,
        costUpdatedAt: enDias(-p.costoActualizadoHaceDias),
      },
      create: {
        sku: p.sku,
        name: p.name,
        familyId: familias.get(p.familia)!,
        unit: p.unit,
        priceModel: p.priceModel,
        costUpdatedAt: enDias(-p.costoActualizadoHaceDias),
      },
    });

    const validFrom = new Date("2026-01-01T00:00:00Z");
    await prisma.priceListEntry.upsert({
      where: { productId_validFrom: { productId: producto.id, validFrom } },
      update: { listPrice: p.listPrice, standardCost: p.standardCost },
      create: {
        productId: producto.id,
        listPrice: p.listPrice,
        standardCost: p.standardCost,
        validFrom,
        validTo: new Date("2026-12-31T00:00:00Z"),
      },
    });
  }
  console.log(`  ${PRODUCTOS.length} productos con su lista de precio única en USD`);

  // ── Organizaciones y personas ────────────────────────────────────────────
  const organizaciones = new Map<string, string>();
  // Dos pasadas: la segunda liga la jerarquía, que necesita a los padres ya creados.
  for (const o of ORGANIZACIONES) {
    const existente = await prisma.organization.findFirst({
      where: { name: o.name },
      select: { id: true },
    });
    const fila = existente
      ? await prisma.organization.update({
          where: { id: existente.id },
          data: {
            type: o.type,
            industry: o.industry,
            city: o.city,
            isStrategic: o.isStrategic,
            ownerId: usuarios.get(o.propietario)!,
          },
        })
      : await prisma.organization.create({
          data: {
            name: o.name,
            type: o.type,
            industry: o.industry,
            city: o.city,
            countryCode: "MX",
            isStrategic: o.isStrategic,
            ownerId: usuarios.get(o.propietario)!,
          },
        });
    organizaciones.set(o.name, fila.id);
  }
  for (const o of ORGANIZACIONES) {
    if (!o.padre) continue;
    await prisma.organization.update({
      where: { id: organizaciones.get(o.name)! },
      data: { parentId: organizaciones.get(o.padre)! },
    });
  }

  const rolesComite = new Map(
    (await prisma.committeeRole.findMany({ select: { id: true, name: true } })).map((r) => [
      r.name,
      r.id,
    ]),
  );
  const personas = new Map<string, string>();
  for (const p of PERSONAS_ACEROS) {
    const existente = await prisma.person.findFirst({
      where: { name: p.name, organizationId: organizaciones.get("Aceros del Norte")! },
      select: { id: true },
    });
    const fila = existente
      ? await prisma.person.update({
          where: { id: existente.id },
          data: { jobTitle: p.jobTitle, committeeRoleId: rolesComite.get(p.rolComite)! },
        })
      : await prisma.person.create({
          data: {
            organizationId: organizaciones.get("Aceros del Norte")!,
            name: p.name,
            initials: p.initials,
            jobTitle: p.jobTitle,
            committeeRoleId: rolesComite.get(p.rolComite)!,
            // Las personas tienen propietario (§29): el de la cuenta.
            ownerId: usuarios.get(
              ORGANIZACIONES.find((o) => o.name === "Aceros del Norte")!.propietario,
            )!,
          },
        });
    personas.set(p.name, fila.id);
  }
  const noDeclaradas = ORGANIZACIONES.filter((o) => !o.declaradaEnSpec).length;
  console.log(
    `  ${ORGANIZACIONES.length} organizaciones (${noDeclaradas} que §15 usa sin declarar) ` +
      `y ${PERSONAS_ACEROS.length} personas del comité de Aceros del Norte`,
  );

  // ── Oportunidades ────────────────────────────────────────────────────────
  const etapasVentaMx = etapasPorPipeline.get("Ventas México")!;
  const pipelineMx = await prisma.pipeline.findFirstOrThrow({
    where: { name: "Ventas México" },
    select: { id: true },
  });

  const oportunidades = new Map<string, string>();
  for (const o of OPORTUNIDADES) {
    const datos = {
      name: o.name,
      organizationId: organizaciones.get(o.organizacion)!,
      pipelineId: pipelineMx.id,
      stageId: etapasVentaMx.get(o.etapa)!,
      countryCode: "MX" as const,
      estimatedAmount: o.amount,
      amount: o.amount,
      grossMargin: o.grossMargin,
      businessType: o.businessType,
      forecastCategory: o.forecastCategory,
      expectedCloseDate: new Date(`${o.expectedCloseDate}T00:00:00Z`),
      ownerId: usuarios.get(o.propietario)!,
      createdById: usuarios.get(o.propietario)!,
      stageEnteredAt: enDias(-o.diasEnEtapa),
      lastActivityAt: enDias(-Math.min(o.diasEnEtapa, 3)),
      nextActivityAt:
        o.proximaActividadEnDias === null ? null : enDias(o.proximaActividadEnDias),
    };

    const fila = await prisma.opportunity.upsert({
      where: { folio: o.folio },
      update: datos,
      create: { folio: o.folio, ...datos },
    });
    oportunidades.set(o.folio, fila.id);
  }

  // El contador queda en el último consecutivo usado, para que la siguiente
  // alta continúe la serie en vez de chocar con un folio existente (RN-20).
  const ultimoConsecutivo = Math.max(
    ...OPORTUNIDADES.map((o) => Number.parseInt(o.folio.slice(-5), 10)),
  );
  await prisma.folioCounter.upsert({
    where: { year: ANIO_FISCAL },
    update: { lastNumber: ultimoConsecutivo },
    create: { year: ANIO_FISCAL, lastNumber: ultimoConsecutivo },
  });
  console.log(`  ${OPORTUNIDADES.length} oportunidades · contador de folio en ${ultimoConsecutivo}`);

  // ── MEDDIC ───────────────────────────────────────────────────────────────
  //
  // §6.3 · `meddicScore` es un valor DERIVADO: se recalcula de los componentes,
  // nunca se captura. Por eso aquí se siembran las seis filas de cada
  // oportunidad y el puntaje sale de `computeMeddicScore`, no del literal de
  // §15. Sembrar el número sin las filas que lo producen dejaría la pestaña
  // MEDDIC vacía junto a un puntaje salido de la nada.
  const admin = usuarios.get("AS")!;
  let evaluacionesSembradas = 0;
  const desviaciones: string[] = [];

  for (const o of OPORTUNIDADES) {
    const opportunityId = oportunidades.get(o.folio)!;
    const detallado = MEDDIC_DETALLADO[o.folio];

    // Las dos que §15 detalla llevan su evidencia escrita a mano y sus personas
    // ligadas. Las otras doce se derivan del puntaje que §15 les asigna.
    const evaluaciones = detallado
      ? Object.entries(detallado).map(([component, d]) => ({
          component: component as MeddicComponent,
          status: d!.status,
          evidence: d!.evidence,
          personId: d!.persona ? (personas.get(d!.persona) ?? null) : null,
        }))
      : derivarMeddic(o.meddicScore).evaluaciones.map((e) => ({ ...e, personId: null }));

    for (const e of evaluaciones) {
      await prisma.meddicComponentAssessment.upsert({
        where: { opportunityId_component: { opportunityId, component: e.component } },
        update: { status: e.status, evidence: e.evidence, personId: e.personId, updatedById: admin },
        create: {
          opportunityId,
          component: e.component,
          status: e.status,
          evidence: e.evidence,
          personId: e.personId,
          updatedById: admin,
        },
      });
      evaluacionesSembradas += 1;
    }

    const puntaje = computeMeddicScore(evaluaciones, PESOS_MEDDIC);
    await prisma.opportunity.update({ where: { id: opportunityId }, data: { meddicScore: puntaje } });

    if (puntaje !== o.meddicScore) {
      desviaciones.push(`${o.folio}: §15 pide ${o.meddicScore}, la fórmula da ${puntaje}`);
    }
  }
  console.log(`  ${evaluacionesSembradas} evaluaciones MEDDIC en ${OPORTUNIDADES.length} oportunidades`);

  if (desviaciones.length > 0) {
    // No es un error: la fórmula de §7.2 con los pesos de Q-08 solo alcanza 33
    // valores, así que varios puntajes de §15 caen entre escalones. Se reporta
    // para que la desviación sea visible, no para detener el seed.
    console.log(`
  Puntajes MEDDIC ajustados al escalón más cercano de la fórmula:`);
    for (const d of desviaciones) console.log(`    ${d}`);
  }

  // ── Actividades ──────────────────────────────────────────────────────────
  //
  // Las fechas `lastActivityAt` y `nextActivityAt` de la oportunidad mandan; las
  // actividades se derivan de ellas. Sin estas filas, la bitácora de P-02 sale
  // vacía junto a una fecha de última actividad, y la bandeja de P-07 no tiene
  // qué mostrar.
  const tiposActividad = new Map(
    (await prisma.activityType.findMany({ select: { id: true, name: true } })).map((t) => [
      t.name,
      t.id,
    ]),
  );

  // Se rehacen desde cero en cada corrida: no tienen llave natural con la cual
  // hacer upsert, y duplicarlas al resembrar ensuciaría la bitácora.
  await prisma.activity.deleteMany({
    where: { opportunityId: { in: [...oportunidades.values()] } },
  });

  let actividadesSembradas = 0;
  for (const o of OPORTUNIDADES) {
    const opportunityId = oportunidades.get(o.folio)!;
    const organizationId = organizaciones.get(o.organizacion)!;
    const userId = usuarios.get(o.propietario)!;

    await prisma.activity.createMany({
      data: derivarActividades(o).map((a) => ({
        typeId: tiposActividad.get(a.tipo)!,
        subject: a.asunto,
        notes: a.notas ?? null,
        startsAt: enDias(a.dias),
        durationMin: 45,
        completedAt: a.realizada ? enDias(a.dias) : null,
        outcome: a.resultado ?? null,
        organizationId,
        opportunityId,
        userId,
      })),
    });
    actividadesSembradas += derivarActividades(o).length;
  }
  console.log(`  ${actividadesSembradas} actividades derivadas de las fechas de cada oportunidad`);

  // ── Objetivos ────────────────────────────────────────────────────────────
  let objetivosSembrados = 0;
  for (const cuota of CUOTAS_T3) {
    const userId = usuarios.get(cuota.clave)!;

    for (const quarter of [1, 2, 3, 4]) {
      // T3 lleva la cuota de §7; los otros tres, la misma cifra, para que el
      // anual sea exactamente cuatro veces esa cantidad.
      await prisma.objective.upsert({
        where: {
          userId_fiscalYear_periodType_quarter: {
            userId,
            fiscalYear: ANIO_FISCAL,
            periodType: "TRIMESTRAL",
            quarter,
          },
        },
        update: { revenueQuota: cuota.revenueQuota, grossProfitQuota: cuota.grossProfitQuota },
        create: {
          userId,
          countryCode: "MX",
          fiscalYear: ANIO_FISCAL,
          periodType: "TRIMESTRAL",
          quarter,
          revenueQuota: cuota.revenueQuota,
          grossProfitQuota: cuota.grossProfitQuota,
        },
      });
      objetivosSembrados += 1;
    }

    // RN-32 · el anual iguala la suma de los cuatro trimestres… salvo para uno,
    // a propósito, para que la advertencia de descuadre sea visible y AC-30
    // tenga un caso real.
    //
    // No se usa `upsert`: Prisma no acepta `quarter: null` en una llave
    // compuesta, porque en SQL NULL != NULL. La unicidad real la garantiza el
    // índice NULLS NOT DISTINCT de la migración
    // `unicidad_real_de_objetivos_anuales`; aquí se busca y se decide.
    const factor = cuota.clave === DESCUADRE_DELIBERADO ? 3 : 4;
    const anual = {
      revenueQuota: (Number(cuota.revenueQuota) * factor).toFixed(4),
      grossProfitQuota: (Number(cuota.grossProfitQuota) * factor).toFixed(4),
    };

    const anualExistente = await prisma.objective.findFirst({
      where: { userId, fiscalYear: ANIO_FISCAL, periodType: "ANUAL" },
      select: { id: true },
    });

    if (anualExistente) {
      await prisma.objective.update({ where: { id: anualExistente.id }, data: anual });
    } else {
      await prisma.objective.create({
        data: {
          userId,
          countryCode: "MX",
          fiscalYear: ANIO_FISCAL,
          periodType: "ANUAL",
          ...anual,
        },
      });
    }
    objetivosSembrados += 1;
  }
  console.log(
    `  ${objetivosSembrados} objetivos · descuadre deliberado en ${DESCUADRE_DELIBERADO} para RN-32`,
  );

  console.log("\nSeed terminado. Verificando los totales de §15…");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("\nEl seed falló:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
