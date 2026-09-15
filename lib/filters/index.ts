/**
 * El subsistema de filtros · §9, INV-10.
 *
 * Una sola implementación sirve a todas las pantallas de lista. El estado vive
 * en la URL, las opciones se recortan por permiso, y el alcance del rol va
 * siempre antes que el filtro del usuario.
 */
export {
  CAMPO_PRISMA,
  ETIQUETA_CAMPO,
  ETIQUETA_PREAJUSTE,
  rangoDeAnioFiscal,
  rangoDeTrimestre,
  resolvePeriod,
  trimestreDe,
  type DateField,
  type DatePreset,
  type Periodo,
} from "./dates";
export {
  filtrosVisibles,
  parseFilters,
  toWhere,
  type OpcionesParseo,
  type ParsedFilters,
} from "./opportunities";
