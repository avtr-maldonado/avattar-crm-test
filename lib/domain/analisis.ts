import { money, type Money } from "@/lib/money";
import { trimestreDe } from "@/lib/filters/dates";
import { explainRiskFlags } from "./riskFlags";

/**
 * Los reportes de P-09 · Análisis · agregaciones puras, con `Decimal` (INV-03).
 *
 * Nada aquí lee la base ni conoce la sesión: recibe listas ya acotadas por
 * `lib/scope` y devuelve filas listas para formatear. Las reglas de fecha son
 * las de §10.2 y no se negocian: las ventas se cuentan por `actualCloseDate`,
 * el forecast por `expectedCloseDate`, el ciclo de venta va del alta al cierre
 * real y la antigüedad se mide con el reloj de hoy.
 *
 * Sin datos, las funciones devuelven listas vacías y promedios nulos: la
 * pantalla dice «sin datos suficientes», nunca un cero que parezca resultado
 * (C-02, Q-06).
 */

// ═══════════════════════════════════════════════════════════════ Tipos

export type LineaVendida = {
  productId: string | null;
  descripcion: string;
  importe: Money;
  /** Solo con VER_COSTO (INV-02). */
  costo?: Money;
};

export type VentaGanada = {
  id: string;
  amount: Money;
  actualCloseDate: Date;
  createdAt: Date;
  businessType: string;
  organization: { id: string; name: string };
  owner: { id: string; name: string };
  cotizacion: {
    netSubtotal: Money;
    /** Solo con VER_COSTO (INV-02). */
    totalCost?: Money;
    grossProfit?: Money;
    lineas: LineaVendida[];
  } | null;
};

export type OportunidadAbierta = {
  id: string;
  folio: string;
  name: string;
  amount: Money;
  expectedCloseDate: Date;
  createdAt: Date;
  stageEnteredAt: Date;
  lastActivityAt: Date | null;
  nextActivityAt: Date | null;
  forecastCategory: string;
  meddicScore: number | null;
  businessType: string;
  organization: { id: string; name: string };
  owner: { id: string; name: string };
  stage: { name: string; position: number; probability: Money; staleAfterDays: number; isClosing: boolean };
  /** Sin el texto de la evidencia: solo si la hay. */
  meddic?: { component: string; status: string; conEvidencia: boolean }[];
};

export type ActividadHecha = {
  completedAt: Date;
  tipo: string;
  usuario: { id: string; name: string };
};

export type FilaAgrupada = {
  clave: string;
  etiqueta: string;
  importe: Money;
  /** Nula donde no llegó costo (INV-02) o no hay cotización. */
  utilidad: Money | null;
  /** Oportunidades distintas. */
  cuantas: number;
  /** Fracción del total. */
  participacion: Money;
};

/** Una fila del histórico: además, cuánto cambió contra el periodo anterior (fracción; nula en el primero o si el anterior fue cero). */
export type FilaHistorica = FilaAgrupada & { variacion: Money | null };

export type TotalAgrupado = { importe: Money; utilidad: Money | null; cuantas: number };

export type DimensionDeVenta = "trimestre" | "cliente" | "producto" | "tipo";

const CERO = money(0);
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

function trimestreEtiquetado(fecha: Date, fiscalYearStartMonth: number) {
  const t = trimestreDe(fecha, fiscalYearStartMonth);
  return {
    clave: `${t.fiscalYear}-Q${t.quarter}`,
    etiqueta: `Q${t.quarter} ${t.fiscalYear}`,
    orden: t.fiscalYear * 4 + t.quarter,
  };
}

// ═══════════════════════════════════════════════════ Acumulador común

type Acumulado = {
  clave: string;
  etiqueta: string;
  orden: number;
  importe: Money;
  utilidad: Money | null;
  ids: Set<string>;
};

function acumular(
  mapa: Map<string, Acumulado>,
  llave: { clave: string; etiqueta: string; orden?: number },
  importe: Money,
  utilidad: Money | null | undefined,
  id: string,
) {
  let a = mapa.get(llave.clave);
  if (!a) {
    a = { clave: llave.clave, etiqueta: llave.etiqueta, orden: llave.orden ?? 0, importe: CERO, utilidad: null, ids: new Set() };
    mapa.set(llave.clave, a);
  }
  a.importe = a.importe.plus(importe);
  if (utilidad != null) a.utilidad = (a.utilidad ?? CERO).plus(utilidad);
  a.ids.add(id);
}

function cerrar(
  mapa: Map<string, Acumulado>,
  total: TotalAgrupado,
  orden: "cronologico" | "importe",
): FilaAgrupada[] {
  return [...mapa.values()]
    .sort((x, y) => (orden === "cronologico" ? x.orden - y.orden : y.importe.minus(x.importe).toNumber()))
    .map((a) => ({
      clave: a.clave,
      etiqueta: a.etiqueta,
      importe: a.importe,
      utilidad: a.utilidad,
      cuantas: a.ids.size,
      participacion: total.importe.isZero() ? CERO : a.importe.div(total.importe),
    }));
}

function totalDe(ventas: readonly VentaGanada[]): TotalAgrupado {
  let importe = CERO;
  let utilidad: Money | null = null;
  for (const v of ventas) {
    importe = importe.plus(v.amount);
    const u = v.cotizacion?.grossProfit;
    if (u) utilidad = (utilidad ?? CERO).plus(u);
  }
  return { importe, utilidad, cuantas: ventas.length };
}

// ═══════════════════════════════════ 1 · Avance contra objetivo, agrupado

/**
 * Lo ganado, agrupado por trimestre, cliente, producto o tipo de negocio.
 *
 * Por producto se reparte cada venta entre las líneas de su cotización; lo que
 * se ganó sin cotización va en una fila aparte, porque decir que no vendió
 * nada sería mentir. La cuota no se reparte por cliente ni por producto —no
 * existe a ese nivel—: la pantalla la pone en el total.
 */
export function agruparVentas(
  ventas: readonly VentaGanada[],
  dimension: DimensionDeVenta,
  opciones: { fiscalYearStartMonth: number; etiquetaDeTipo: Record<string, string> },
): { filas: FilaAgrupada[]; total: TotalAgrupado } {
  const mapa = new Map<string, Acumulado>();
  const total = totalDe(ventas);

  for (const v of ventas) {
    const utilidad = v.cotizacion?.grossProfit ?? null;
    switch (dimension) {
      case "trimestre":
        acumular(mapa, trimestreEtiquetado(v.actualCloseDate, opciones.fiscalYearStartMonth), v.amount, utilidad, v.id);
        break;
      case "cliente":
        acumular(mapa, { clave: v.organization.id, etiqueta: v.organization.name }, v.amount, utilidad, v.id);
        break;
      case "tipo":
        acumular(mapa, { clave: v.businessType, etiqueta: opciones.etiquetaDeTipo[v.businessType] ?? v.businessType }, v.amount, utilidad, v.id);
        break;
      case "producto":
        if (v.cotizacion && v.cotizacion.lineas.length > 0) {
          for (const l of v.cotizacion.lineas) {
            acumular(
              mapa,
              { clave: l.productId ?? `libre:${l.descripcion}`, etiqueta: l.descripcion },
              l.importe,
              l.costo ? l.importe.minus(l.costo) : null,
              v.id,
            );
          }
        } else {
          acumular(mapa, { clave: "__sin_cotizacion", etiqueta: "Sin cotización", orden: Number.MAX_SAFE_INTEGER }, v.amount, utilidad, v.id);
        }
        break;
    }
  }

  return { filas: cerrar(mapa, total, dimension === "trimestre" ? "cronologico" : "importe"), total };
}

export type EstadoDeTrimestre = "cerrado" | "en_curso" | "futuro";
export type TrimestreConCuota = FilaAgrupada & {
  cuota: Money;
  cumplimiento: Money | null;
  /** Un trimestre que no ha empezado no se mide: no se le puede reclamar la cuota. */
  estado: EstadoDeTrimestre;
};

/**
 * Los cuatro trimestres del año fiscal, aunque no se haya vendido en alguno,
 * con la cuota consolidada de cada uno y el cumplimiento. La cuota llega ya
 * sumada por la pantalla desde los renglones de objetivos (§10.3: se suma de lo
 * visible). Sin cuota el cumplimiento es nulo, no cero (C-02).
 */
export function completarTrimestres(
  filas: readonly FilaAgrupada[],
  fiscalYear: number,
  cuotasPorTrimestre: readonly Money[],
  enCurso: { fiscalYear: number; quarter: number },
): TrimestreConCuota[] {
  const ordenEnCurso = enCurso.fiscalYear * 4 + enCurso.quarter;
  return [1, 2, 3, 4].map((q) => {
    const clave = `${fiscalYear}-Q${q}`;
    const fila = filas.find((f) => f.clave === clave) ?? {
      clave,
      etiqueta: `Q${q} ${fiscalYear}`,
      importe: CERO,
      utilidad: null,
      cuantas: 0,
      participacion: CERO,
    };
    const cuota = cuotasPorTrimestre[q - 1] ?? CERO;
    const orden = fiscalYear * 4 + q;
    const estado: EstadoDeTrimestre = orden < ordenEnCurso ? "cerrado" : orden === ordenEnCurso ? "en_curso" : "futuro";
    return { ...fila, cuota, cumplimiento: cuota.isZero() ? null : fila.importe.div(cuota), estado };
  });
}

// ═══════════════════════════════════════════════ 2 · Histórico de venta

export function historicoDeVentas(
  ventas: readonly VentaGanada[],
  agrupar: "anio" | "trimestre",
  fiscalYearStartMonth: number,
): { filas: FilaHistorica[]; total: TotalAgrupado } {
  const mapa = new Map<string, Acumulado>();
  const total = totalDe(ventas);
  for (const v of ventas) {
    const llave =
      agrupar === "anio"
        ? (() => {
            const { fiscalYear } = trimestreDe(v.actualCloseDate, fiscalYearStartMonth);
            return { clave: String(fiscalYear), etiqueta: String(fiscalYear), orden: fiscalYear };
          })()
        : trimestreEtiquetado(v.actualCloseDate, fiscalYearStartMonth);
    acumular(mapa, llave, v.amount, v.cotizacion?.grossProfit ?? null, v.id);
  }
  // La variación es contra el periodo anterior **con ventas**: un trimestre
  // sin nada en medio no se inventa como cero, porque el histórico agrupa lo
  // que hubo, no un calendario.
  const filas = cerrar(mapa, total, "cronologico").map((f, i, todas) => {
    const anterior = i > 0 ? todas[i - 1]!.importe : null;
    const variacion = anterior && !anterior.isZero() ? f.importe.minus(anterior).div(anterior) : null;
    return { ...f, variacion };
  });
  return { filas, total };
}

// ═══════════════════════════════════════════════════ 3 · Rentabilidad

export type FilaDeRentabilidad = {
  clave: string;
  etiqueta: string;
  importe: Money;
  costo: Money;
  utilidad: Money;
  /** Fracción. Un importe en cero da margen cero, no una división por cero. */
  margen: Money;
  cuantas: number;
};

/**
 * Importe, costo, utilidad y margen de lo ganado, por producto, tipo o cliente.
 *
 * Solo entran las ventas cuya cotización trae costo: sin costo no hay
 * rentabilidad que calcular, y el lector lo omite sin `VER_COSTO` (INV-02). Por
 * producto se usan las líneas; por cliente y por tipo, los totales de la
 * cotización, que ya están cuadrados (RN-07).
 */
export function rentabilidad(
  ventas: readonly VentaGanada[],
  dimension: "producto" | "tipo" | "cliente",
  etiquetaDeTipo: Record<string, string>,
): { filas: FilaDeRentabilidad[]; total: Omit<FilaDeRentabilidad, "clave" | "etiqueta"> } {
  type Parcial = { clave: string; etiqueta: string; importe: Money; costo: Money; ids: Set<string> };
  const mapa = new Map<string, Parcial>();
  let importeTotal = CERO;
  let costoTotal = CERO;
  const idsTotal = new Set<string>();

  const sumar = (llave: { clave: string; etiqueta: string }, importe: Money, costo: Money, id: string) => {
    let p = mapa.get(llave.clave);
    if (!p) {
      p = { ...llave, importe: CERO, costo: CERO, ids: new Set() };
      mapa.set(llave.clave, p);
    }
    p.importe = p.importe.plus(importe);
    p.costo = p.costo.plus(costo);
    p.ids.add(id);
    importeTotal = importeTotal.plus(importe);
    costoTotal = costoTotal.plus(costo);
    idsTotal.add(id);
  };

  for (const v of ventas) {
    const c = v.cotizacion;
    if (!c || c.totalCost === undefined) continue;
    if (dimension === "producto") {
      for (const l of c.lineas) {
        if (l.costo === undefined) continue;
        sumar({ clave: l.productId ?? `libre:${l.descripcion}`, etiqueta: l.descripcion }, l.importe, l.costo, v.id);
      }
    } else if (dimension === "cliente") {
      sumar({ clave: v.organization.id, etiqueta: v.organization.name }, c.netSubtotal, c.totalCost, v.id);
    } else {
      sumar({ clave: v.businessType, etiqueta: etiquetaDeTipo[v.businessType] ?? v.businessType }, c.netSubtotal, c.totalCost, v.id);
    }
  }

  const margenDe = (importe: Money, utilidad: Money) => (importe.isZero() ? CERO : utilidad.div(importe));
  const filas = [...mapa.values()]
    .map((p) => {
      const utilidad = p.importe.minus(p.costo);
      return { clave: p.clave, etiqueta: p.etiqueta, importe: p.importe, costo: p.costo, utilidad, margen: margenDe(p.importe, utilidad), cuantas: p.ids.size };
    })
    .sort((x, y) => y.importe.minus(x.importe).toNumber());
  const utilidadTotal = importeTotal.minus(costoTotal);

  return {
    filas,
    total: { importe: importeTotal, costo: costoTotal, utilidad: utilidadTotal, margen: margenDe(importeTotal, utilidadTotal), cuantas: idsTotal.size },
  };
}

// ═══════════════════════════════════════════════ 4 · Embudo de forecast

export type SubgrupoDeEmbudo = { clave: string; etiqueta: string; total: Money; ponderado: Money; cuantas: number };
export type TrimestreDeEmbudo = SubgrupoDeEmbudo & { subgrupos: SubgrupoDeEmbudo[] };

/**
 * Las abiertas por trimestre de cierre estimado, y dentro por cliente o por
 * vendedor. El ponderado es importe × probabilidad de etapa (RN-01); la
 * probabilidad mínima y las categorías de pronóstico recortan antes de agrupar.
 */
export function embudoDeForecast(
  abiertas: readonly OportunidadAbierta[],
  opciones: {
    segunda: "cliente" | "vendedor";
    probabilidadMinima: Money | null;
    categorias: ReadonlySet<string>;
    fiscalYearStartMonth: number;
  },
): { trimestres: TrimestreDeEmbudo[]; total: SubgrupoDeEmbudo } {
  type Parcial = SubgrupoDeEmbudo & { orden: number; hijos: Map<string, SubgrupoDeEmbudo> };
  const mapa = new Map<string, Parcial>();
  const total: SubgrupoDeEmbudo = { clave: "total", etiqueta: "Total", total: CERO, ponderado: CERO, cuantas: 0 };

  for (const o of abiertas) {
    if (opciones.probabilidadMinima !== null && o.stage.probability.lt(opciones.probabilidadMinima)) continue;
    if (opciones.categorias.size > 0 && !opciones.categorias.has(o.forecastCategory)) continue;

    const t = trimestreEtiquetado(o.expectedCloseDate, opciones.fiscalYearStartMonth);
    let p = mapa.get(t.clave);
    if (!p) {
      p = { ...t, total: CERO, ponderado: CERO, cuantas: 0, hijos: new Map() };
      mapa.set(t.clave, p);
    }
    const ponderado = o.amount.times(o.stage.probability);
    const llave = opciones.segunda === "cliente" ? o.organization : o.owner;
    let h = p.hijos.get(llave.id);
    if (!h) {
      h = { clave: llave.id, etiqueta: llave.name, total: CERO, ponderado: CERO, cuantas: 0 };
      p.hijos.set(llave.id, h);
    }
    for (const g of [p, h, total]) {
      g.total = g.total.plus(o.amount);
      g.ponderado = g.ponderado.plus(ponderado);
      g.cuantas += 1;
    }
  }

  const trimestres = [...mapa.values()]
    .sort((x, y) => x.orden - y.orden)
    .map((p) => ({
      clave: p.clave,
      etiqueta: p.etiqueta,
      total: p.total,
      ponderado: p.ponderado,
      cuantas: p.cuantas,
      subgrupos: [...p.hijos.values()].sort((x, y) => y.total.minus(x.total).toNumber()),
    }));
  return { trimestres, total };
}

// ═══════════════════════════════════════════════════ 5 · Ciclo de venta

export type PromedioDeCiclo = { clave: string; etiqueta: string; promedioDias: number; cuantas: number };

function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

/** Días del alta al cierre real. Promedio y mediana: la mediana aguanta el negocio de dos años que sesga el promedio. */
export function cicloDeVenta(
  ventas: readonly VentaGanada[],
  fiscalYearStartMonth: number,
): {
  promedioDias: number | null;
  medianaDias: number | null;
  cuantas: number;
  porVendedor: PromedioDeCiclo[];
  porTrimestre: PromedioDeCiclo[];
} {
  const dias = ventas.map((v) => diasEntre(v.createdAt, v.actualCloseDate));
  type Parcial = { clave: string; etiqueta: string; orden: number; dias: number[] };
  const porVendedor = new Map<string, Parcial>();
  const porTrimestre = new Map<string, Parcial>();

  ventas.forEach((v, i) => {
    const d = dias[i]!;
    let pv = porVendedor.get(v.owner.id);
    if (!pv) porVendedor.set(v.owner.id, (pv = { clave: v.owner.id, etiqueta: v.owner.name, orden: 0, dias: [] }));
    pv.dias.push(d);
    const t = trimestreEtiquetado(v.actualCloseDate, fiscalYearStartMonth);
    let pt = porTrimestre.get(t.clave);
    if (!pt) porTrimestre.set(t.clave, (pt = { ...t, dias: [] }));
    pt.dias.push(d);
  });

  const aFila = (p: Parcial): PromedioDeCiclo => ({ clave: p.clave, etiqueta: p.etiqueta, promedioDias: promedio(p.dias)!, cuantas: p.dias.length });

  return {
    promedioDias: promedio(dias),
    medianaDias: mediana(dias),
    cuantas: ventas.length,
    porVendedor: [...porVendedor.values()]
      .sort((x, y) => y.dias.length - x.dias.length || x.etiqueta.localeCompare(y.etiqueta))
      .map(aFila),
    porTrimestre: [...porTrimestre.values()].sort((x, y) => x.orden - y.orden).map(aFila),
  };
}

// ══════════════════════════════════════════ 6 · Antigüedad y estancamiento

export type DetalleDeAntiguedad = {
  id: string;
  folio: string;
  nombre: string;
  cliente: string;
  vendedor: string;
  etapa: string;
  importe: Money;
  diasEnEtapa: number;
  limite: number;
  edadDias: number;
  estancada: boolean;
  sinActividad: boolean;
  vencida: boolean;
};

export type AntiguedadPorVendedor = {
  clave: string;
  etiqueta: string;
  cuantas: number;
  estancadas: number;
  sinActividad: number;
  vencidas: number;
  edadPromedioDias: number | null;
};

/**
 * Lo que se está quedando, medido hoy. Estancada y sin actividad salen de las
 * mismas banderas del kanban (`explainRiskFlags`, RN-03 y RN-10): un reporte
 * que las calculara aparte diría otra cosa que el tablero. Vencida es cierre
 * estimado en el pasado y todavía abierta.
 */
export function antiguedadYEstancamiento(
  abiertas: readonly OportunidadAbierta[],
  ahora: Date,
): {
  resumen: { cuantas: number; estancadas: number; sinActividad: number; vencidas: number; importeEstancado: Money; edadPromedioDias: number | null };
  porVendedor: AntiguedadPorVendedor[];
  detalle: DetalleDeAntiguedad[];
} {
  const detalle: DetalleDeAntiguedad[] = abiertas.map((o) => {
    const banderas = explainRiskFlags(o, o.stage, ahora).map((e) => e.flag);
    return {
      id: o.id,
      folio: o.folio,
      nombre: o.name,
      cliente: o.organization.name,
      vendedor: o.owner.name,
      etapa: o.stage.name,
      importe: o.amount,
      diasEnEtapa: diasEntre(o.stageEnteredAt, ahora),
      limite: o.stage.staleAfterDays,
      edadDias: diasEntre(o.createdAt, ahora),
      estancada: banderas.includes("ESTANCADA"),
      sinActividad: banderas.includes("SIN_ACTIVIDAD"),
      vencida: o.expectedCloseDate < ahora,
    };
  });

  type Parcial = AntiguedadPorVendedor & { edades: number[] };
  const porVendedor = new Map<string, Parcial>();
  let importeEstancado = CERO;
  const resumen = { cuantas: 0, estancadas: 0, sinActividad: 0, vencidas: 0 };

  abiertas.forEach((o, i) => {
    const d = detalle[i]!;
    let p = porVendedor.get(o.owner.id);
    if (!p) {
      p = { clave: o.owner.id, etiqueta: o.owner.name, cuantas: 0, estancadas: 0, sinActividad: 0, vencidas: 0, edadPromedioDias: null, edades: [] };
      porVendedor.set(o.owner.id, p);
    }
    for (const g of [p, resumen]) {
      g.cuantas += 1;
      if (d.estancada) g.estancadas += 1;
      if (d.sinActividad) g.sinActividad += 1;
      if (d.vencida) g.vencidas += 1;
    }
    p.edades.push(d.edadDias);
    if (d.estancada) importeEstancado = importeEstancado.plus(o.amount);
  });

  return {
    resumen: { ...resumen, importeEstancado, edadPromedioDias: promedio(detalle.map((d) => d.edadDias)) },
    porVendedor: [...porVendedor.values()]
      .sort((x, y) => y.cuantas - x.cuantas || x.etiqueta.localeCompare(y.etiqueta))
      .map(({ edades, ...p }) => ({ ...p, edadPromedioDias: promedio(edades) })),
    detalle: [...detalle].sort((x, y) => y.importe.minus(x.importe).toNumber()).slice(0, 20),
  };
}

// ═══════════════════════════════════════════ 8 · Actividad por vendedor

export type ActividadDeVendedor = {
  clave: string;
  etiqueta: string;
  hechas: number;
  porTipo: Record<string, number>;
  abiertas: number;
  /** Abiertas sin siguiente actividad, o con la siguiente ya vencida (RN-10). */
  sinSiguientePaso: number;
};

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function actividadPorVendedor(
  actividades: readonly ActividadHecha[],
  abiertas: readonly OportunidadAbierta[],
  ahora: Date,
): { tipos: string[]; porVendedor: ActividadDeVendedor[]; porMes: { clave: string; etiqueta: string; hechas: number }[] } {
  const tipos = [...new Set(actividades.map((a) => a.tipo))].sort((a, b) => a.localeCompare(b));
  const porVendedor = new Map<string, ActividadDeVendedor>();
  const de = (u: { id: string; name: string }) => {
    let p = porVendedor.get(u.id);
    if (!p) {
      p = { clave: u.id, etiqueta: u.name, hechas: 0, porTipo: {}, abiertas: 0, sinSiguientePaso: 0 };
      porVendedor.set(u.id, p);
    }
    return p;
  };

  const porMes = new Map<string, { clave: string; etiqueta: string; hechas: number }>();
  for (const a of actividades) {
    const p = de(a.usuario);
    p.hechas += 1;
    p.porTipo[a.tipo] = (p.porTipo[a.tipo] ?? 0) + 1;
    const anio = a.completedAt.getUTCFullYear();
    const mes = a.completedAt.getUTCMonth();
    const clave = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    let m = porMes.get(clave);
    if (!m) porMes.set(clave, (m = { clave, etiqueta: `${MES_CORTO[mes]} ${anio}`, hechas: 0 }));
    m.hechas += 1;
  }
  for (const o of abiertas) {
    const p = de(o.owner);
    p.abiertas += 1;
    if (o.nextActivityAt === null || o.nextActivityAt <= ahora) p.sinSiguientePaso += 1;
  }

  return {
    tipos,
    porVendedor: [...porVendedor.values()].sort((x, y) => y.hechas - x.hechas || x.etiqueta.localeCompare(y.etiqueta)),
    porMes: [...porMes.values()].sort((x, y) => x.clave.localeCompare(y.clave)),
  };
}

// ═══════════════════════════════════════════════════ 9 · Salud MEDDIC

export type SaludPorEtapa = {
  clave: string;
  etiqueta: string;
  cuantas: number;
  promedio: number | null;
  bajoMinimo: number;
  sinCalificar: number;
};

export function saludMeddic(
  abiertas: readonly OportunidadAbierta[],
  minimoCierre: number,
): {
  porEtapa: SaludPorEtapa[];
  /** Componentes parciales o confirmados sin evidencia, en todo el abierto. */
  sinEvidencia: number;
  enCierreBajoMinimo: { id: string; folio: string; nombre: string; puntaje: number | null }[];
} {
  type Parcial = SaludPorEtapa & { orden: number; puntajes: number[] };
  const porEtapa = new Map<string, Parcial>();
  let sinEvidencia = 0;
  const enCierreBajoMinimo: { id: string; folio: string; nombre: string; puntaje: number | null }[] = [];

  for (const o of abiertas) {
    const etapa = o.stage;
    const puntaje = o.meddicScore;
    let p = porEtapa.get(etapa.name);
    if (!p) {
      p = { clave: etapa.name, etiqueta: etapa.name, orden: etapa.position, cuantas: 0, promedio: null, bajoMinimo: 0, sinCalificar: 0, puntajes: [] };
      porEtapa.set(etapa.name, p);
    }
    p.cuantas += 1;
    if (puntaje === null) p.sinCalificar += 1;
    else {
      p.puntajes.push(puntaje);
      if (puntaje < minimoCierre) p.bajoMinimo += 1;
    }
    for (const m of o.meddic ?? []) {
      if ((m.status === "PARCIAL" || m.status === "CONFIRMADO") && !m.conEvidencia) sinEvidencia += 1;
    }
    if (etapa.isClosing && (puntaje ?? 0) < minimoCierre) {
      enCierreBajoMinimo.push({ id: o.id, folio: o.folio, nombre: o.name, puntaje });
    }
  }

  return {
    porEtapa: [...porEtapa.values()]
      .sort((x, y) => x.orden - y.orden)
      .map((e) => ({
        clave: e.clave,
        etiqueta: e.etiqueta,
        cuantas: e.cuantas,
        promedio: promedio(e.puntajes),
        bajoMinimo: e.bajoMinimo,
        sinCalificar: e.sinCalificar,
      })),
    sinEvidencia,
    enCierreBajoMinimo,
  };
}
