# Rúbrica de calificación de prospectos · diseño

Fecha: 27 de noviembre de 2026 · decisiones §71

## Problema

El puntaje de un prospecto era un número de 0 a 100 que alguien tecleaba en el alta, en la edición o
en el CSV. No decía por qué valía eso ni se podía comparar entre quienes califican.

## Decisiones del negocio

1. **Checklist de sí o no con peso por criterio** (no escala ni opciones). El puntaje es la suma de los
   pesos marcados.
2. **Criterios y pesos se definen en Configuración**: se agregan, se renombran, se reponderan y se
   eliminan. **Los activos suman siempre 100.**
3. **Solo informa**: el puntaje no bloquea ni habilita ninguna etapa.
4. **Un puntaje dado no se mueve** si después cambia la rúbrica: se guarda con el nombre y el peso de
   cada criterio en ese momento. Eliminar es desactivar (MD-05).

## Diseño

- **Datos.** `LeadScoringCriterion` (nombre único, peso entero, orden, activo) y `LeadScoreItem` (por
  prospecto y criterio: nombre y peso de ese momento, y si se marcó). `Lead.score` sigue como valor
  calculado, con `scoredAt` y `scoredById`. Migración `20261127100000_rubrica_de_prospectos` con RLS
  deny-all y la rúbrica inicial (presupuesto 25, autoridad 20, necesidad 25, plazo 15, perfil 15).
- **Reglas puras** (`lib/domain/leadScoring.ts`): `validarRubrica` (nombres únicos sin importar
  mayúsculas, pesos enteros 1–100, al menos un activo, activos suman 100 y el error dice cuánto falta o
  sobra), `puntajeDe` (suma de lo marcado; nada marcado es 0) y `sePuedeCalificar` (En validación y
  Contactado).
- **Servicios.** `guardarRubrica` (`leadCatalog.ts`): hoja completa en un viaje, `GESTIONAR_PROSPECTOS`,
  CONFLICTO si la hoja no trae todos los criterios existentes, sin cambios no escribe, `EDITAR_CATALOGO`.
  `calificarProspecto` (`lead.ts`): quien gestiona, solo en En validación o Contactado, criterios
  activos, reemplaza la calificación anterior, `CALIFICAR_PROSPECTO` con el puntaje antes y después.
- **Pantallas.** Configuración › Prospectos: bloque «Rúbrica de calificación» con lectura y hoja
  editable (suma en vivo, «Guardar» apagado mientras no valide). Detalle del prospecto: pestaña
  «Calificación» con el checklist y el total en vivo donde se puede calificar, y la lectura de cómo se
  calificó en lo demás.
- **Fuera.** El campo «Puntaje» del alta y de la edición, y la columna «Puntaje» de la plantilla y de la
  importación (un archivo viejo que la traiga la ve ignorada).

## Supuestos (corregibles)

- El vendedor asignado no califica: es trabajo de Marketing antes de dar por calificado.
- Los puntajes tecleados antes de §71 se quedan, sin detalle por criterio.
