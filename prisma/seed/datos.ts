import type {
  BusinessType,
  CountryCode,
  ForecastCategory,
  MeddicComponent,
  MeddicStatus,
  OrganizationType,
  PriceModel,
  Role,
  StageGateMode,
} from "@prisma/client";

/**
 * El escenario del prototipo aprobado · §15.
 *
 * Los datos van aquí como constantes y la orquestación en `prisma/seed.ts`,
 * para que revisar «¿esto es lo que Dirección aprobó?» sea leer un archivo de
 * datos y no perseguir literales entre llamadas a Prisma.
 *
 * ## Tres ajustes deliberados, todos registrados en docs/decisiones-pendientes.md
 *
 * 1. **Cinco organizaciones que §15 no declara.** El spec lista nueve, pero las
 *    catorce oportunidades referencian catorce distintas. Insumos Médicos
 *    Reforma, Logística Tepeyac, Constructora Zaragoza, Seguros Altamira y
 *    Alimentos del Pacífico se usan y nunca se definen. Se crean con los
 *    atributos que su nombre y su oportunidad implican, marcados abajo.
 * 2. **Las banderas de riesgo son las calculadas**, no las declaradas: siete
 *    sobre seis oportunidades, no cinco. INV-11 obliga a calcularlas.
 * 3. **Las cuotas están reescaladas** para que la cobertura del T3 caiga en la
 *    banda sana. Las de §15 dan 0.10× contra un mínimo de 3.0×.
 */

// ───────────────────────────────────────────────────────────── Países

export const PAISES = [
  {
    code: "MX" as CountryCode,
    name: "México",
    taxRate: "0.1600",
    taxLabel: "IVA",
    timezone: "America/Mexico_City",
  },
  {
    code: "CO" as CountryCode,
    name: "Colombia",
    // Q-04 · sin confirmar con contabilidad local.
    taxRate: "0.1900",
    taxLabel: "IVA",
    timezone: "America/Bogota",
  },
  {
    code: "CL" as CountryCode,
    name: "Chile",
    taxRate: "0.1900",
    taxLabel: "IVA",
    timezone: "America/Santiago",
  },
] as const;

/** Política comercial. §15 la fija para México; CO y CL arrancan igual. */
export const POLITICA_BASE = {
  marginFloor: "0.2000",
  lineMarginFloor: "0.1000",
  discountThresholdMgmt: "0.1500",
  discountThresholdDir: "0.3000",
  approvalSlaHours: 24,
  meddicMinToClosing: 70,
  meddicMinToWin: 80,
  meddicMinToCommit: 70,
  healthyCoverageMin: "3.00",
} as const;

// ───────────────────────────────────────────────────────────── Usuarios

export const USUARIOS = [
  { clave: "JM", name: "Jorge Medina", role: "GERENTE_PAIS", paises: ["MX"] },
  { clave: "AL", name: "Ana Lucía Ríos", role: "VENDEDOR", paises: ["MX"] },
  { clave: "PE", name: "Paulina Estrada", role: "VENDEDOR", paises: ["MX"] },
  { clave: "GD", name: "Gabriel Duarte", role: "VENDEDOR", paises: ["MX"] },
  { clave: "VD", name: "Valeria Domínguez", role: "VENDEDOR", paises: ["MX"] },
  { clave: "IC", name: "Iván Cruz", role: "PREVENTA", paises: ["MX"] },
  // §15 pide «un DIRECCION y un ADMINISTRADOR» sin nombrarlos. Se crean como
  // cuentas de rol, no como personas inventadas.
  { clave: "DC", name: "Dirección Comercial", role: "DIRECCION", paises: ["MX", "CO", "CL"] },
  { clave: "AS", name: "Administración del sistema", role: "ADMINISTRADOR", paises: ["MX", "CO", "CL"] },

  // Usuarios reales del equipo. Llevan `correo` explícito porque el suyo no se
  // deriva de las iniciales como el de las cuentas del escenario.
  //
  // Este es el «alta administrativa» del sistema: una fila aquí, y la primera
  // vez que la persona entra por Entra ID se sella el vínculo con su object id.
  // Para dar de alta a alguien más, agrega su renglón y corre `pnpm db:seed`.
  {
    clave: "MM",
    name: "Miguel Maldonado",
    role: "ADMINISTRADOR",
    paises: ["MX", "CO", "CL"],
    correo: "miguel.maldonado@avattar.com",
  },
] as const satisfies readonly {
  clave: string;
  name: string;
  role: Role;
  paises: readonly CountryCode[];
  correo?: string;
}[];

/**
 * El correo del usuario. Las cuentas del escenario lo derivan de sus
 * iniciales; los usuarios reales traen el suyo.
 */
export const correoDe = (u: { clave: string; correo?: string }) =>
  u.correo ?? `${u.clave.toLowerCase()}@avattar.com`;

// ───────────────────────────────────────────────────────────── Pipeline

/** §8.3 · las cinco etapas corporativas con sus compuertas. */
export const ETAPAS_VENTA = [
  {
    name: "Calificación",
    position: 1,
    probability: "0.1000",
    staleAfterDays: 14,
    gateRequires: [] as string[],
    isClosing: false,
  },
  {
    name: "Descubrimiento",
    position: 2,
    probability: "0.2500",
    staleAfterDays: 21,
    gateRequires: ["PERSONA_CON_ROL_DECLARADO"],
    isClosing: false,
  },
  {
    name: "Propuesta",
    position: 3,
    probability: "0.5000",
    staleAfterDays: 30,
    gateRequires: ["PROPUESTA_CARGADA", "MEDDIC_E_CONFIRMADO"],
    isClosing: false,
  },
  {
    name: "Negociación",
    position: 4,
    probability: "0.7500",
    staleAfterDays: 21,
    gateRequires: ["COTIZACION_CONGELADA", "HITOS_CAPTURADOS"],
    isClosing: false,
  },
  {
    name: "Cierre",
    position: 5,
    probability: "0.9000",
    staleAfterDays: 10,
    gateRequires: [
      "CONTRATO_O_OC_CARGADO",
      "HITOS_CUADRADOS",
      "MEDDIC_MIN_CIERRE",
      "SIN_AUTORIZACION_PENDIENTE",
    ],
    isClosing: true,
  },
] as const;

/** Renovaciones tiene tres etapas: el ciclo es más corto y ya hay relación. */
export const ETAPAS_RENOVACION = [
  { name: "Aviso de vencimiento", position: 1, probability: "0.3000", staleAfterDays: 30, gateRequires: [] as string[], isClosing: false },
  { name: "Propuesta de renovación", position: 2, probability: "0.6000", staleAfterDays: 21, gateRequires: ["COTIZACION_CONGELADA"], isClosing: false },
  { name: "Cierre", position: 3, probability: "0.9000", staleAfterDays: 10, gateRequires: ["CONTRATO_O_OC_CARGADO", "HITOS_CUADRADOS"], isClosing: true },
] as const;

export const PIPELINES = [
  { nombre: "Ventas México", pais: "MX" as CountryCode, renovacion: false },
  { nombre: "Ventas Colombia", pais: "CO" as CountryCode, renovacion: false },
  { nombre: "Ventas Chile", pais: "CL" as CountryCode, renovacion: false },
  { nombre: "Renovaciones MX", pais: "MX" as CountryCode, renovacion: true },
] as const;

/** Q-08 · cinco a 17 y el dolor a 15, para que sumen 100. */
export const PESOS_MEDDIC: Record<MeddicComponent, number> = {
  METRICAS: 17,
  DECISOR_ECONOMICO: 17,
  CRITERIOS_DECISION: 17,
  PROCESO_DECISION: 17,
  DOLOR_IDENTIFICADO: 15,
  CAMPEON: 17,
};

// ───────────────────────────────────────────────────────────── Catálogos

/** 13 tipos de actividad (§15). */
export const TIPOS_ACTIVIDAD = [
  "Llamada", "Reunión presencial", "Videollamada", "Correo enviado",
  "Correo recibido", "Demostración", "Taller técnico", "Visita a sitio",
  "Presentación a comité", "Envío de propuesta", "Seguimiento", "Nota interna",
  "Evento o feria",
] as const;

/** 9 tipos de documento; `isContract` en los dos que satisfacen la compuerta. */
export const TIPOS_DOCUMENTO = [
  { name: "Propuesta comercial", isContract: false },
  { name: "Cotización", isContract: false },
  { name: "Contrato", isContract: true },
  { name: "Orden de compra", isContract: true },
  { name: "Ficha técnica", isContract: false },
  { name: "Acta de reunión", isContract: false },
  { name: "Documento legal", isContract: false },
  { name: "Presentación", isContract: false },
  { name: "Otro", isContract: false },
] as const;

/** 8 motivos de pérdida; `requiresCompetitor` solo en «Competidor» (RN-16). */
export const MOTIVOS_PERDIDA = [
  { name: "Precio", requiresCompetitor: false },
  { name: "Competidor", requiresCompetitor: true },
  { name: "Sin presupuesto", requiresCompetitor: false },
  { name: "Proyecto cancelado", requiresCompetitor: false },
  { name: "Fuera de tiempo", requiresCompetitor: false },
  { name: "Alcance no cubierto", requiresCompetitor: false },
  { name: "Decisión interna", requiresCompetitor: false },
  { name: "Sin respuesta", requiresCompetitor: false },
] as const;

/** 7 roles de comité de compra. Son el ancla de MEDDIC E y C (§2.1). */
export const ROLES_COMITE = [
  "Decisor económico", "Decisor técnico", "Campeón", "Influenciador",
  "Usuario final", "Compras", "Bloqueador",
] as const;

export const ORIGENES = [
  "Referido", "Prospección directa", "Campaña", "Partner",
  "Evento", "Cliente existente", "Licitación pública",
] as const;

export const FAMILIAS_PRODUCTO = [
  "Servicios profesionales", "Staffing", "Licenciamiento",
  "Servicios administrados", "Infraestructura", "Capacitación", "Nube",
] as const;

// ───────────────────────────────────────────────────────────── Productos

/**
 * Los ocho SKU de §15.
 *
 * `costoActualizadoHaceDias` no viene del spec: se agrega para que el riesgo
 * C-01 sea visible en pantalla. Sin la integración con Defontana el costo
 * estándar se mantiene a mano, y en una operación real no todos los SKU se
 * actualizan el mismo día. P-06 marca en ámbar los que pasan de 60 días, que es
 * justo la señal que el catálogo v2 pide para que nadie cotice contra un costo
 * viejo y dispare —o deje de disparar— una autorización por un número obsoleto.
 */
export const PRODUCTOS = [
  { sku: "SRV-ARQ-001", name: "Consultoría de arquitectura cloud", familia: "Servicios profesionales", unit: "día", priceModel: "PRECIO_FIJO", listPrice: "18000", standardCost: "9500", costoActualizadoHaceDias: 12 },
  { sku: "STF-DVO-012", name: "Staffing DevOps Senior", familia: "Staffing", unit: "mes", priceModel: "TIEMPO_Y_MATERIALES", listPrice: "165000", standardCost: "118000", costoActualizadoHaceDias: 8 },
  { sku: "LIC-M365-E3", name: "Licencia Microsoft 365 E3", familia: "Licenciamiento", unit: "usuario", priceModel: "RECURRENTE_ANUAL", listPrice: "8400", standardCost: "7900", costoActualizadoHaceDias: 145 },
  { sku: "MSP-SOP-8X5", name: "Soporte administrado 8x5", familia: "Servicios administrados", unit: "mes", priceModel: "RECURRENTE", listPrice: "42000", standardCost: "26000", costoActualizadoHaceDias: 34 },
  { sku: "MSP-SOP-24X7", name: "Soporte administrado 24x7", familia: "Servicios administrados", unit: "mes", priceModel: "RECURRENTE", listPrice: "78000", standardCost: "47000", costoActualizadoHaceDias: 34 },
  { sku: "INF-SRV-R750", name: "Servidor rack Dell R750", familia: "Infraestructura", unit: "pieza", priceModel: "PRECIO_FIJO", listPrice: "310000", standardCost: "268000", costoActualizadoHaceDias: 201 },
  { sku: "CAP-DEVSEC", name: "Capacitación DevSecOps", familia: "Capacitación", unit: "grupo", priceModel: "PRECIO_FIJO", listPrice: "96000", standardCost: "41000", costoActualizadoHaceDias: 19 },
  { sku: "CLD-AWS-CONS", name: "Consumo AWS administrado", familia: "Nube", unit: "GB", priceModel: "POR_CONSUMO", listPrice: "120", standardCost: "96", costoActualizadoHaceDias: 88 },
] as const satisfies readonly {
  sku: string; name: string; familia: string; unit: string;
  priceModel: PriceModel; listPrice: string; standardCost: string;
  costoActualizadoHaceDias: number;
}[];

/** §11 P-06 · sobre esta antigüedad, el costo se marca en ámbar (C-01). */
export const DIAS_COSTO_OBSOLETO = 60;

// ───────────────────────────────────────────────────────── Organizaciones

/**
 * `declaradaEnSpec: false` marca las cinco que §15 usa en las oportunidades
 * pero nunca define. Sus atributos se derivan del nombre y del negocio que
 * llevan; conviene confirmarlos con Dirección antes de la demostración.
 */
export const ORGANIZACIONES = [
  { name: "Aceros del Norte", type: "CLIENTE", industry: "Manufactura", city: "Monterrey", isStrategic: true, padre: "Grupo Industrial Bajío", propietario: "JM", declaradaEnSpec: true },
  { name: "Grupo Industrial Bajío", type: "CLIENTE", industry: "Corporativo", city: "León", isStrategic: false, padre: null, propietario: "AL", declaradaEnSpec: true },
  { name: "Farmacéutica Anáhuac", type: "PROSPECTO", industry: "Salud", city: "Ciudad de México", isStrategic: false, padre: null, propietario: "PE", declaradaEnSpec: true },
  { name: "Hidrosistemas del Valle", type: "CLIENTE", industry: "Energía", city: "Querétaro", isStrategic: false, padre: null, propietario: "JM", declaradaEnSpec: true },
  { name: "Transportes Anáhuac", type: "CLIENTE", industry: "Logística", city: "Ciudad de México", isStrategic: false, padre: null, propietario: "GD", declaradaEnSpec: true },
  { name: "Energía Solar Sonora", type: "PROSPECTO", industry: "Energía", city: "Hermosillo", isStrategic: false, padre: null, propietario: "GD", declaradaEnSpec: true },
  { name: "Nexus Datacenter", type: "FABRICANTE", industry: "Telecom", city: "Guadalajara", isStrategic: false, padre: null, propietario: "VD", declaradaEnSpec: true },
  { name: "Cimarrón Manufactura", type: "PROSPECTO", industry: "Manufactura", city: "Saltillo", isStrategic: false, padre: null, propietario: "PE", declaradaEnSpec: true },
  { name: "Redes y Soluciones MX", type: "PARTNER", industry: "Tecnología", city: "Ciudad de México", isStrategic: false, padre: null, propietario: "AL", declaradaEnSpec: true },

  // Las cinco que §15 referencia sin declarar.
  { name: "Insumos Médicos Reforma", type: "CLIENTE", industry: "Salud", city: "Ciudad de México", isStrategic: false, padre: null, propietario: "AL", declaradaEnSpec: false },
  { name: "Logística Tepeyac", type: "CLIENTE", industry: "Logística", city: "Ciudad de México", isStrategic: false, padre: null, propietario: "AL", declaradaEnSpec: false },
  { name: "Constructora Zaragoza", type: "PROSPECTO", industry: "Construcción", city: "Puebla", isStrategic: false, padre: null, propietario: "JM", declaradaEnSpec: false },
  { name: "Seguros Altamira", type: "PROSPECTO", industry: "Seguros", city: "Monterrey", isStrategic: false, padre: null, propietario: "PE", declaradaEnSpec: false },
  { name: "Alimentos del Pacífico", type: "PROSPECTO", industry: "Alimentos", city: "Culiacán", isStrategic: false, padre: null, propietario: "VD", declaradaEnSpec: false },
] as const satisfies readonly {
  name: string; type: OrganizationType; industry: string; city: string;
  isStrategic: boolean; padre: string | null; propietario: string;
  declaradaEnSpec: boolean;
}[];

/** El comité de compra de Aceros del Norte (§15). Es el ancla de MEDDIC. */
export const PERSONAS_ACEROS = [
  { name: "Luis Cantú", initials: "LC", jobTitle: "CIO", rolComite: "Decisor técnico" },
  { name: "Mariana Robles", initials: "MR", jobTitle: "Directora de Finanzas", rolComite: "Decisor económico" },
  { name: "Óscar Villareal", initials: "OV", jobTitle: "Gerente de Infraestructura", rolComite: "Campeón" },
  { name: "Compras corporativas", initials: "CC", jobTitle: "Compras", rolComite: "Compras" },
] as const;

// ─────────────────────────────────────────────────────────── Oportunidades

export type OportunidadSeed = {
  folio: string;
  name: string;
  organizacion: string;
  etapa: string;
  amount: string;
  grossMargin: string;
  expectedCloseDate: string;
  propietario: string;
  businessType: BusinessType;
  forecastCategory: ForecastCategory;
  /** Días desde hoy hacia atrás en que entró a la etapa. Fija el estancamiento. */
  diasEnEtapa: number;
  /** Días hacia adelante de la próxima actividad; `null` = no hay (bandera). */
  proximaActividadEnDias: number | null;
  meddicScore: number;
};

/**
 * Las 14 oportunidades abiertas de México (§15).
 *
 * `diasEnEtapa` y `proximaActividadEnDias` están calibrados para reproducir las
 * banderas que el prototipo declara: 00374 y 00322 sin actividad futura, 00355
 * y 00304 estancadas. Las de margen se derivan solas al compararlas contra el
 * piso de 20 %, y por eso salen tres y no una (INV-11).
 */
export const OPORTUNIDADES: OportunidadSeed[] = [
  { folio: "OPP-2026-00417", name: "Migración ERP a nube privada", organizacion: "Aceros del Norte", etapa: "Negociación", amount: "2850000", grossMargin: "0.3100", expectedCloseDate: "2026-10-15", propietario: "JM", businessType: "NUEVO", forecastCategory: "COMPROMISO", diasEnEtapa: 8, proximaActividadEnDias: 3, meddicScore: 84 },
  { folio: "OPP-2026-00402", name: "Plataforma de trazabilidad", organizacion: "Farmacéutica Anáhuac", etapa: "Propuesta", amount: "1975000", grossMargin: "0.2700", expectedCloseDate: "2026-11-20", propietario: "PE", businessType: "NUEVO", forecastCategory: "MEJOR_CASO", diasEnEtapa: 12, proximaActividadEnDias: 5, meddicScore: 55 },
  { folio: "OPP-2026-00388", name: "Renovación licencias CRM 2027", organizacion: "Grupo Industrial Bajío", etapa: "Cierre", amount: "1240000", grossMargin: "0.0900", expectedCloseDate: "2026-09-30", propietario: "AL", businessType: "RENOVACION", forecastCategory: "COMPROMISO", diasEnEtapa: 6, proximaActividadEnDias: 2, meddicScore: 62 },
  { folio: "OPP-2026-00374", name: "Trazabilidad de flota", organizacion: "Transportes Anáhuac", etapa: "Descubrimiento", amount: "918000", grossMargin: "0.3400", expectedCloseDate: "2026-12-10", propietario: "GD", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 9, proximaActividadEnDias: null, meddicScore: 28 },
  { folio: "OPP-2026-00369", name: "Portal de proveedores", organizacion: "Insumos Médicos Reforma", etapa: "Propuesta", amount: "615000", grossMargin: "0.2200", expectedCloseDate: "2026-11-27", propietario: "AL", businessType: "EXPANSION", forecastCategory: "PIPELINE", diasEnEtapa: 15, proximaActividadEnDias: 6, meddicScore: 48 },
  { folio: "OPP-2026-00355", name: "Mesa de servicio 8x5", organizacion: "Logística Tepeyac", etapa: "Negociación", amount: "588000", grossMargin: "0.3800", expectedCloseDate: "2026-09-28", propietario: "AL", businessType: "NUEVO", forecastCategory: "MEJOR_CASO", diasEnEtapa: 26, proximaActividadEnDias: 4, meddicScore: 58 },
  { folio: "OPP-2026-00341", name: "Licenciamiento obra civil", organizacion: "Constructora Zaragoza", etapa: "Calificación", amount: "430000", grossMargin: "0.1100", expectedCloseDate: "2026-11-18", propietario: "JM", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 5, proximaActividadEnDias: 7, meddicScore: 12 },
  { folio: "OPP-2026-00337", name: "Diagnóstico de procesos comerciales", organizacion: "Seguros Altamira", etapa: "Calificación", amount: "386000", grossMargin: "0.4400", expectedCloseDate: "2026-09-12", propietario: "PE", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 4, proximaActividadEnDias: 2, meddicScore: 18 },
  { folio: "OPP-2026-00330", name: "Bolsa de desarrollo a la medida", organizacion: "Redes y Soluciones MX", etapa: "Descubrimiento", amount: "297000", grossMargin: "0.2900", expectedCloseDate: "2026-10-22", propietario: "AL", businessType: "EXPANSION", forecastCategory: "PIPELINE", diasEnEtapa: 11, proximaActividadEnDias: 5, meddicScore: 34 },
  { folio: "OPP-2026-00322", name: "Automatización de reportes", organizacion: "Alimentos del Pacífico", etapa: "Calificación", amount: "245000", grossMargin: "0.3600", expectedCloseDate: "2026-10-06", propietario: "VD", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 7, proximaActividadEnDias: null, meddicScore: 15 },
  { folio: "OPP-2026-00318", name: "Ciberseguridad perimetral", organizacion: "Hidrosistemas del Valle", etapa: "Cierre", amount: "1105000", grossMargin: "0.2500", expectedCloseDate: "2026-09-12", propietario: "JM", businessType: "EXPANSION", forecastCategory: "COMPROMISO", diasEnEtapa: 5, proximaActividadEnDias: 1, meddicScore: 76 },
  { folio: "OPP-2026-00311", name: "Data platform corporativa", organizacion: "Energía Solar Sonora", etapa: "Descubrimiento", amount: "760000", grossMargin: "0.3000", expectedCloseDate: "2027-01-05", propietario: "GD", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 14, proximaActividadEnDias: 8, meddicScore: 31 },
  { folio: "OPP-2026-00304", name: "Nube híbrida manufactura", organizacion: "Cimarrón Manufactura", etapa: "Propuesta", amount: "522000", grossMargin: "0.1900", expectedCloseDate: "2026-10-14", propietario: "PE", businessType: "NUEVO", forecastCategory: "PIPELINE", diasEnEtapa: 34, proximaActividadEnDias: 9, meddicScore: 41 },
  { folio: "OPP-2026-00298", name: "Soporte administrado datacenter", organizacion: "Nexus Datacenter", etapa: "Negociación", amount: "690000", grossMargin: "0.3300", expectedCloseDate: "2026-10-02", propietario: "VD", businessType: "EXPANSION", forecastCategory: "MEJOR_CASO", diasEnEtapa: 10, proximaActividadEnDias: 3, meddicScore: 66 },
];

/**
 * MEDDIC de las oportunidades que §15 detalla.
 *
 * OPP-2026-00417 en 84 con los seis trabajados; OPP-2026-00388 por debajo del
 * mínimo de cierre, para que la validación se vea en la demostración.
 *
 * **§15 declara 62 para OPP-2026-00388, y 62 es imposible.** Con la fórmula de
 * §7.2 y los pesos de Q-08 solo 33 puntajes son alcanzables, y ese no es uno:
 * los vecinos son 60 y 66. El detalle de abajo produce 66, que sigue estando
 * por debajo del mínimo de cierre (70) y por lo tanto conserva lo que el
 * escenario quería demostrar. Registrado en docs/decisiones-pendientes.md.
 */
export const MEDDIC_DETALLADO: Record<
  string,
  Partial<Record<MeddicComponent, { status: MeddicStatus; evidence: string; persona?: string }>>
> = {
  "OPP-2026-00417": {
    METRICAS: { status: "CONFIRMADO", evidence: "Ahorro estimado de 4.2 M anuales en licenciamiento y operación, validado con Finanzas." },
    DECISOR_ECONOMICO: { status: "CONFIRMADO", evidence: "Mariana Robles firma el presupuesto. Reunión del 12 de agosto.", persona: "Mariana Robles" },
    CRITERIOS_DECISION: { status: "CONFIRMADO", evidence: "Disponibilidad 99.9 %, migración sin corte mayor a 4 h, soporte 24x7 local." },
    PROCESO_DECISION: { status: "PARCIAL", evidence: "Comité técnico el 20 de septiembre; falta confirmar la fecha del comité financiero." },
    DOLOR_IDENTIFICADO: { status: "PARCIAL", evidence: "El CIO reconoce las caídas en cierre de mes; falta que Finanzas cuantifique lo que cuestan." },
    CAMPEON: { status: "CONFIRMADO", evidence: "Óscar Villareal empuja el proyecto y nos abre agenda con el comité.", persona: "Óscar Villareal" },
  },
  "OPP-2026-00388": {
    METRICAS: { status: "CONFIRMADO", evidence: "Renovación a valor conocido; el ahorro es de continuidad, no incremental." },
    DECISOR_ECONOMICO: { status: "PARCIAL", evidence: "Identificado el Director de Administración; falta contactarlo directamente." },
    CRITERIOS_DECISION: { status: "CONFIRMADO", evidence: "Precio y continuidad del servicio. Sin cambios de alcance." },
    PROCESO_DECISION: { status: "PARCIAL", evidence: "Se sabe que pasa por Compras; falta la fecha del comité." },
    DOLOR_IDENTIFICADO: { status: "CONFIRMADO", evidence: "El vencimiento del contrato los deja sin soporte el 31 de diciembre." },
    CAMPEON: { status: "AUSENTE", evidence: "No hay quien empuje internamente. Se trabajó y se concluyó que no existe." },
  },
};

// ───────────────────────────────────────────────────────────── Objetivos

/**
 * Cuotas del T3 2026, reescaladas · §7 del documento de diseño.
 *
 * Las de §15 (9.00 M para Jorge Medina, 33.5 M en total) dejan la cobertura del
 * trimestre en 0.10× contra la banda sana de 3.0×, porque solo 3 319 000 del
 * pipeline cierra en T3. Se reescalaron conservando las proporciones, de modo
 * que el equipo caiga en 3.02× y el tablero demuestre lo que §10.3 pide.
 *
 * La cuota de utilidad se mantiene en 30 % de la de ingreso, la proporción
 * original del prototipo.
 */
export const CUOTAS_T3 = [
  { clave: "JM", revenueQuota: "300000", grossProfitQuota: "90000" },
  { clave: "AL", revenueQuota: "450000", grossProfitQuota: "135000" },
  { clave: "PE", revenueQuota: "150000", grossProfitQuota: "45000" },
  { clave: "GD", revenueQuota: "120000", grossProfitQuota: "36000" },
  { clave: "VD", revenueQuota: "80000", grossProfitQuota: "24000" },
] as const;

/**
 * Multiplicadores por trimestre para repartir el año.
 *
 * Para cuatro vendedores la suma de los cuatro trimestres iguala el anual. Para
 * Valeria Domínguez **no**, deliberadamente: así la advertencia de RN-32 es
 * visible en la demostración y AC-30 tiene un caso real.
 */
export const DESCUADRE_DELIBERADO = "VD";

export const ANIO_FISCAL = 2026;

export const GATE_MODE_INICIAL: StageGateMode = "ADVERTENCIA";
