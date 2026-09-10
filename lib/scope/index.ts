/**
 * El alcance por rol · INV-01.
 *
 * Toda lectura de oportunidades, organizaciones, actividades y objetivos pasa
 * por aquí. Las capas de presentación no pueden importar `lib/db`: reciben
 * estas funciones, que ya traen el alcance aplicado.
 *
 * Cada módulo exporta dos capas, a propósito:
 *
 *   - `xxxScope(session)` devuelve un `WhereInput`. Es puro, no toca la base y
 *     se prueba en microsegundos. Es la firma que el spec §5.3 fija, y la que
 *     hace legible de un vistazo la regla más delicada del sistema.
 *   - `listXxx(session, …)` es lo que las pantallas usan. Compone el alcance
 *     con el filtro y consulta.
 *
 * El orden dentro de `withScope` no es negociable: primero el alcance del rol,
 * después el filtro del usuario. Un filtro no puede ampliar lo que el rol
 * permite ver (AC-25).
 */
export { activityScope, listActivities, withActivityScope } from "./activities";
export { listObjectives, objectiveScope, withObjectiveScope } from "./objectives";
export {
  countOpportunities,
  getOpportunity,
  listOpportunities,
  opportunityScope,
  sumOpportunityAmounts,
  withScope,
} from "./opportunities";
export {
  getOrganization,
  listOrganizations,
  organizationScope,
  withOrganizationScope,
} from "./organizations";
export {
  opportunityCardSelect,
  opportunityDetailSelect,
  quoteLineSelect,
  quoteSelect,
} from "./selectors";
