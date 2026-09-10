# Catálogo de funcionalidades — CRM Avattar (v2)

Reconstruido a partir de la **especificación funcional completa** que alimentó los
prototipos (código del componente `AvattarCRMSpec`), cruzado con `alcance-mvp.md` y el
guion de la sesión con el Director de México. Reemplaza al listado v1
(`listado-funcionalidades-mvp.md`), que estaba basado solo en lo visible en las pantallas
del prototipo HTML.

**Por qué es más confiable que el v1:** esta especificación trae campos reales, 61 reglas
de negocio con código (`RN`, `MD`, `HF`, `SEG`, `MIG`), un modelo de datos completo (17
entidades) y su propio roadmap de 3 fases — no hay que inferir la funcionalidad a partir
de lo que se alcanza a ver en una captura de pantalla.

**Convención de estatus:**
- **Fase (spec)** → la fase que el propio documento de especificación propone (1/2/3).
- **Estatus MVP** → lo que corresponde según `alcance-mvp.md` ya decidido, cuando se puede
  determinar. `[MVP]` `[Fase 2]` `[Fuera]` `[⚠ conflicto]` `[sin decisión]`.

---

## §00 · Decisiones estructurales ya confirmadas por la especificación

Estas 14 decisiones vienen ya cerradas en el documento de especificación (tabla "Decisiones
confirmadas"). Regístralas contra lo decidido en `alcance-mvp.md` — casi todas coinciden,
una no (ver ⚠ abajo):

| Tema | Definición en la especificación | Coincide con alcance-mvp |
|---|---|---|
| Consolidación | USD, captura en moneda local o USD | Sí |
| Tipo de cambio | Se congela al ganar | Sí (RN confirmada) |
| Utilidad | Solo margen bruto, sin costos indirectos | Sí |
| Costo en servicios por tiempo | Monto único por línea, sin desglose | Sí |
| Pipelines | Uno por país mínimo (MX, CO, CL) | Sí |
| Crédito compartido | Reparto % entre vendedores, suma 100 % | Sí |
| Cancelada vs. perdida | Cancelada no cuenta en tasa de cierre; perdida sí | Sí |
| **Sistema actual / migración** | **"Pipedrive, del cual se migra la base histórica"** | **⚠ Conflicto — alcance-mvp decidió arrancar en limpio, sin migrar** |
| ERP | Defontana en los 3 países | Sí (fuera del MVP, coincide con Fase 2 de la spec) |
| Correo e identidad | M365 + Entra ID | Sí |
| Construcción | A la medida | Sí |
| Idioma | es-MX, arquitectura preparada para más idiomas | Sin mención en alcance-mvp — confirmar si aplica |
| Impuestos | 16 % MX, 19 % CO, 19 % CL, configurable por país y producto | Resuelve C-04 (el 16% fijo del prototipo era el problema; aquí ya está parametrizado) |

## §01 · Modelo de datos (transversal, no es una pantalla)

17 entidades con reglas transversales (`MD-01` a `MD-05`): auditoría de creado/modificado
en todo registro, borrado lógico nunca físico, campos personalizados por entidad sin
tocar esquema, doble registro de moneda (transacción + equivalente congelado), catálogos
que se desactivan y nunca se eliminan.

*No es una "funcionalidad" que se marque MVP/Fase 2 por separado — es la base técnica de
todas las demás. Vale la pena confirmarla con el equipo de desarrollo antes de elegir stack.*

## §02 · Contactos

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-201 | Organización con datos fiscales por país (RFC/NIT/RUT), industria, tamaño, tipo, jerarquía padre/filial | | [MVP] |
| AV-202 | Persona con múltiples correos/teléfonos, idioma, zona horaria | | [MVP] |
| AV-203 | Relación N:M persona-organización vía tabla puente con rol y vigencia | RN-05 | [MVP] |
| AV-204 | Detección de duplicados al capturar (por nombre/RFC en organización, correo/nombre+org en persona) | RN-01, RN-02 | [sin decisión — no aparece en alcance-mvp] |
| AV-205 | Fusión de duplicados conservando historial y bitácora | RN-03 | [sin decisión] |
| AV-206 | Vista 360: oportunidades abiertas/cerradas, actividades, documentos, notas, contactos | | [MVP] — depende de histórico (C-02) para "ganado 12 meses" |
| AV-207 | Comité de compra con rol declarado (decisor económico, técnico, campeón, influenciador, usuario final, compras, bloqueador) | | [MVP] |
| AV-208 | Registro de consentimiento de datos personales (obligatorio, con fecha) | RN-07 | [sin decisión — pero es requisito legal en los 3 países, no debería ser opcional] |
| AV-209 | Bloqueo de desactivar organización con oportunidades abiertas | RN-06 | [MVP, es integridad de datos] |

## §03 · Oportunidades

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-301 | Folio autogenerado inmutable (`OPP-AAAA-NNNNN`) | | [MVP] |
| AV-302 | Alta rápida de organización/persona en línea sin perder lo capturado | | [MVP] — coincide con AV-109 del v1 |
| AV-303 | Copropietarios con reparto de crédito % (suma exacta 100) | RN-20, RN-21 | [MVP] |
| AV-304 | Pipeline/etapa heredado del país, con remapeo al cambiar de pipeline | | [MVP] |
| AV-305 | Categoría de pronóstico (Compromiso / Mejor caso / Pipeline / Omitido) | | [sin decisión — no está en el prototipo HTML ni en alcance-mvp, es nuevo] |
| AV-306 | Bloque de licitación (convocatoria, entidad, junta de aclaraciones, fallo) dentro de `tipo_negocio` | | [sin decisión — no aparece en ningún otro documento, confirmar si Avattar vende por licitación] |
| AV-307 | Partner/fabricante asociado a la oportunidad (para fondos de marketing/registro de deal) | | Marcado Fase 3 en Propuestas adicionales |
| AV-308 | Motivo de pérdida + competidor, obligatorio si se pierde | RN-14 | [MVP] |
| AV-309 | Actividad futura obligatoria en toda oportunidad abierta (bandera roja si falta) | RN-10 | [MVP] — ya estaba en RN de alcance-mvp |
| AV-310 | Estancamiento automático por días sin movimiento, configurable por etapa | RN-11 | [MVP] — coincide con "días para estancada" de alcance-mvp |
| AV-311 | Requisitos configurables para avanzar de etapa | RN-12 | [MVP parcial] — pregunta 9 del guion: ¿bloqueante o advertencia? |
| AV-312 | Requisitos para marcar ganada: fecha real, líneas, hitos cuadrados, contrato/orden de compra | RN-13 | [MVP] |
| AV-313 | Congelamiento de tipo de cambio y equivalente USD al ganar | RN-13b | [MVP] |
| AV-314 | Oportunidad cerrada de solo lectura; reabrir deja bitácora | RN-16 | [MVP] |
| AV-315 | Registro de fecha/usuario en cada cambio de etapa (para medir velocidad de pipeline) | RN-17 | [MVP] |
| AV-316 | Duplicar oportunidad (copia líneas y contactos, no actividades/documentos) | RN-18 | [sin decisión] |
| AV-317 | Cada país registra su propia oportunidad; negocios de 2 países se ligan entre sí | RN-19 | [MVP] — coincide con "cobertura MX/CO/CL" |

## §04 · Motor de precio y utilidad (cotización)

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-401 | Líneas editables: cantidad, precio, descuento, costo, con recálculo en vivo | RN-22 a RN-24 | [MVP] |
| AV-402 | Descuento como % o como monto, nunca ambos en la misma línea | RN-24 | [MVP] |
| AV-403 | Alertas automáticas de autorización por umbral de descuento/margen | RN-25 | [MVP] — umbrales aún provisionales (D-07) |
| AV-404 | Bloqueo de edición de líneas mientras hay autorización pendiente | RN-26 | [MVP] |
| AV-405 | Permiso de ver costo independiente de ver margen | RN-27 | [MVP] — RN-09 en alcance-mvp |
| AV-406 | Versionado de cotización: congelar, editar crea nueva versión | RN-28 | [MVP] |
| AV-407 | Oportunidad capturada directamente en USD sin conversión | RN-29 | [MVP] |
| AV-408 | Cálculo de valor y utilidad ponderada por probabilidad de etapa | | [MVP] |
| AV-409 | Consolidado USD: tipo de cambio de referencia diario si está abierta, congelado si ganada | | [MVP] |
| AV-410 | Contratos recurrentes cotizados por valor anual (12 meses en una línea) | | [sin decisión — confirmar con pregunta 5 del guion] |

## §05 · Hitos de facturación

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-501 | Captura por % o por monto, con recálculo cruzado en vivo | HF-02 | [MVP] |
| AV-502 | Validación exacta contra el total; bloqueo si no cuadra | HF-01, HF-04 | [MVP] |
| AV-503 | Recalculo automático de hitos en % al cambiar el total de la oportunidad; alerta si están en monto fijo | HF-03 | [sin decisión — detalle técnico no mencionado en otros documentos] |
| AV-504 | Hitos visibles solo desde etapa de Propuesta en adelante | HF-05 | [sin decisión] |
| AV-505 | Congelamiento de hitos y tipo de cambio al ganar; cambios posteriores requieren permiso de gerencia + bitácora | HF-06 | [MVP] |
| AV-506 | Validación: ningún hito antes de la fecha de cierre estimada | HF-07 | [sin decisión] |
| AV-507 | Hito vencido sin factura → bandera de atrasado en tablero de cobranza | HF-09 | [MVP parcial] — depende de si hay tablero de cobranza en el corte actual |
| AV-508 | Plantilla de hitos mensuales/trimestrales para contratos recurrentes | HF-10 | [sin decisión] |
| AV-509 | Envío de hitos a Defontana como programación de facturación al ganar | | **[Fuera del MVP — depende de integración Defontana, C-01]** |

## §06 · Productos

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-601 | Catálogo con familia/subfamilia, unidad, modelo de precio, recurrencia | | [MVP] |
| AV-602 | Listas de precio por país, moneda y vigencia, con precio mínimo | | [MVP] — necesario por C-03 |
| AV-603 | Costo estándar como base cuando no hay costo real | RN-22 | **[Riesgo — C-01: sin Defontana, ¿quién actualiza el costo estándar?]** |
| AV-604 | Un cambio de precio de lista no afecta oportunidades ya creadas | RN-32 | [MVP, es integridad de datos] |
| AV-605 | Líneas libres sin SKU para conceptos no catalogados, reportadas aparte | RN-33 | [sin decisión] |
| AV-606 | Carga masiva de catálogo con vista previa y validación | RN-34 | [sin decisión — relevante para D-03, config CO/CL] |
| AV-607 | Paquetes que se expanden en líneas componentes al insertarse | RN-31 | Marcado como funcionalidad activa aunque no aparece en el prototipo HTML — confirmar si aplica |
| AV-608 | Generación automática de oportunidad de renovación 90 días antes del vencimiento (recurrentes) | RN-36, RN-37 | Fase 2 en el propio roadmap de la spec — coincide con pipeline de Renovaciones mencionado en el banco de reserva del guion |

## §07 · Actividades

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-701 | Catálogo configurable de tipos de actividad, con comportamiento propio por tipo | | [MVP] |
| AV-702 | Actividad ligada a oportunidad/organización/persona, hereda organización | | [MVP] |
| AV-703 | Sugerencia automática de siguiente actividad al marcar una como realizada | RN-40 | [MVP] |
| AV-704 | Actividades vencidas destacadas en bandeja del vendedor y tablero del gerente | RN-41 | [MVP] |
| AV-705 | Reprogramar conserva la fecha original (mide cuántas veces se pospuso) | RN-42 | [sin decisión] |
| AV-706 | Sincronización bidireccional con calendario (Outlook) para tipos que lo requieren | RN-43 | Depende de pregunta 16 del guion (¿realmente usan Outlook?) |
| AV-707 | Las actividades no se eliminan una vez realizadas, solo se cancelan con motivo | RN-44 | [MVP, integridad] |

## §08 · Objetivos

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-801 | Objetivo por vendedor/equipo/oficina/compañía | | [MVP] |
| AV-802 | Dos métricas obligatorias: ingreso y utilidad bruta | | [MVP] |
| AV-803 | Distribución uniforme, estacional o manual del objetivo anual entre trimestres | | [sin decisión] |
| AV-804 | Objetivo corporativo en USD, opcionalmente también en moneda local por oficina | | Tema para GG en el guion (cuota en USD) |
| AV-805 | Cobertura de pipeline (abierto ÷ brecha), referencia sana 3×–4× | | [MVP] — RN ya confirmada |
| AV-806 | Objetivo anual = suma de trimestres, con recálculo automático | RN-50 | [MVP] |
| AV-807 | Crédito de cierre al propietario vigente en la fecha de cierre | RN-51 | [MVP] |
| AV-808 | Sin crédito compartido entre países — cada país acredita su propia cuota | RN-53b | [MVP, coincide con cobertura por país] |
| AV-809 | Objetivo prorrateado para vendedores que ingresan a mitad de año | RN-55 | [sin decisión] |

## §09 · Análisis

| # | Funcionalidad | Notas | Estatus MVP |
|---|---|---|---|
| AV-901 | Tablero Dirección: ingreso/utilidad vs objetivo, ticket promedio, ciclo de venta, cobertura, comparativo año anterior | Depende de histórico (C-02) | [MVP parcial] |
| AV-902 | Tablero Pipeline: valor por etapa, antigüedad, estancadas, sin próxima actividad | | [MVP] |
| AV-903 | Tablero Proyección: pronóstico ponderado, cascada del trimestre (fotografía diaria) | Requiere snapshot diario del pipeline (RN-60) — validar factibilidad técnica | [MVP parcial] |
| AV-904 | Tablero Rentabilidad: margen por línea/cliente/vendedor/país, desviación vs. lista | Depende de histórico (C-02) | [MVP parcial] |
| AV-905 | Tablero Actividad: ritmo semanal, relación actividad→cierre, tiempo de respuesta | | No estaba en el prototipo HTML como tablero separado — nuevo, confirmar si se quiere |
| AV-906 | Tablero Facturación esperada: ingreso proyectado por hitos | | [MVP] |
| AV-907 | Tablero Pérdidas: distribución por motivo/competidor/etapa | | No estaba en el prototipo HTML — nuevo, confirmar |
| AV-908 | Navegación de todo indicador hasta el listado y la oportunidad de origen | RN-61 | [sin decisión] |
| AV-909 | Exportación a Excel/PDF respetando permisos | RN-62 | [sin decisión] |
| AV-910 | Envío programado de tableros por correo | RN-64 | Marcado Fase 3-equivalente en otros documentos (no mencionado en alcance-mvp) |

## §10 · Propuestas adicionales (priorizadas por fase en la propia especificación)

Esta tabla ya viene priorizada por el documento original. Es la lista más útil para
comparar contra el corte de MVP ya decidido, porque el autor de la especificación ya hizo
un primer intento de fase.

| Fase (spec) | Funcionalidad | Estatus MVP (alcance-mvp) |
|---|---|---|
| 1 | Multimoneda con tipos de cambio versionados | [MVP] coincide |
| 1 | Búsqueda global y creación rápida desde cualquier pantalla | [sin decisión explícita, pero deseable] |
| 1 | Campos personalizados por entidad y pipeline | [sin decisión] |
| 1 | Bitácora de auditoría | [sin decisión, pero varias RN ya la dan por hecho] |
| 1 | Importación y exportación con vista previa | [sin decisión] — relevante para D-02 y D-03 |
| 2 | Cotización en PDF con versionado | [sin decisión] |
| 2 | Flujo de autorización de descuento y margen | [MVP] — ya está en el corte según alcance-mvp |
| 2 | Sincronización Outlook/M365 | **⚠ conflicto de fase** — alcance-mvp ya decidió que M365 va desde el MVP (v1), no en Fase 2 |
| 2 | Plantillas de correo y secuencias | [Fase 2] coincide |
| 2 | Automatizaciones por evento | [Fase 2] coincide |
| 2 | Prospectos separados de contactos | [sin decisión] |
| 2 | Aplicación móvil o PWA | **⚠ conflicto de fase** — el prototipo HTML ya incluye vista móvil completa (M13) como parte del MVP, no de Fase 2 |
| 2 | Firma electrónica integrada | [Fase 2] razonable |
| 2 | Integración con Defontana | [Fase 2] coincide con "fuera del MVP" |
| 3 | Renovaciones automáticas | [Fase 2] según banco de reserva del guion — antes que Fase 3 |
| 3 | Comisiones sobre utilidad | [Fase 3] coincide |
| 3 | Entrega a delivery y visión de proyecto | [Fase 3] coincide |
| 3 | WhatsApp Business como canal registrado | [sin decisión, pero pregunta 16 del guion es justo sobre esto] |
| 3 | Portal de partners y registro de deal | [Fase 3] razonable |
| 3 | Asistencia con IA | [Fase 3] razonable |
| 3 | API pública y webhooks | [Fase 3] razonable |

## §10b · Prospectos (Leads) — módulo nuevo, no estaba en la especificación original

Propuesto a partir del pedido explícito de replicar el patrón Leads → Deals de Pipedrive,
ajustado al ciclo de venta consultivo de Avattar. **Decidido: Fase 2, alta manual
únicamente (sin formulario web).** Resuelve además un hueco que ya existía en el tablero
de Análisis (`AV-905` menciona "tiempo de respuesta a nuevos prospectos" sin que hubiera
ningún módulo que generara ese dato).

**Por qué separado de Oportunidades:** un prospecto es un interés sin calificar — no tiene
país ni pipeline todavía, y no debería inflar el valor de pipeline ni la cobertura de
cuota. La separación existe para que el pipeline de ventas se quede limpio con negocios
reales, no para automatizar una fuente de captura externa.

| # | Funcionalidad | Notas | Estatus |
|---|---|---|---|
| AV-1050 | Alta manual de prospecto: título, organización/persona (opcionales), origen, valor estimado (opcional), calificación, propietario | Reutiliza el patrón de alta en línea de organización/persona ya existente en `AV-109`/`AV-302` | [Fase 2] |
| AV-1051 | Bandeja de prospectos: lista simple (no Kanban), filtrable por origen, propietario y antigüedad | A diferencia de Oportunidades, no tiene etapas — un prospecto está abierto, convertido o descartado, sin pasos intermedios | [Fase 2] |
| AV-1052 | Alerta de prospecto sin actividad en N días (configurable) | Mismo patrón que la bandera "sin actividad futura" de oportunidades (`RN-10`) | [Fase 2] |
| AV-1053 | Conversión a oportunidad: botón que abre el modal de alta ya existente, precargando organización/persona/nota | En este punto se elige país y pipeline, porque el prospecto no lo tiene hasta que se convierte | [Fase 2] |
| AV-1054 | Descarte de prospecto con motivo (catálogo), sin conversión | Alimenta un reporte de por qué se pierden prospectos antes de llegar a oportunidad | [Fase 2] |
| AV-1055 | Detección de duplicados al crear un prospecto | Reutiliza `RN-01`/`RN-02` de Contactos | [Fase 2] |

**Reglas de negocio propuestas:**

| Código | Regla |
|---|---|
| PR-01 | Un prospecto no cuenta en el valor de pipeline ni en la cobertura de cuota — solo las oportunidades cuentan |
| PR-02 | Convertir un prospecto es de un solo sentido; "reabrirlo" tras convertido requiere permiso de administrador |
| PR-03 | Un prospecto sin actividad en N días (configurable) se marca para revisión |
| PR-04 | Al convertir, se conserva la referencia al prospecto de origen en la oportunidad resultante, para medir tasa de conversión por canal |
| PR-05 | Detección de duplicados al crear (reutiliza `RN-01`/`RN-02`) |

**Habilita:** tasa de conversión prospecto → oportunidad y tiempo de calificación, ambos
segmentables por origen y por vendedor — el dato que le faltaba a `AV-905` (tablero de
Actividad en Análisis).

**Pendiente de decidir:**
- ¿El campo "origen" del prospecto es el mismo catálogo que "origen" de la oportunidad
  (`AV-301`), o son catálogos distintos con el de prospecto siendo más amplio?
- ¿Quién puede descartar un prospecto — solo su propietario, o también su gerente?
- Al no haber formulario web, la responsabilidad de no perder un interés real recae
  enteramente en que el vendedor/preventa lo capture a tiempo — vale la pena preguntar en
  la sesión si hoy ese hábito ya existe o si el CRM lo estaría imponiendo de cero (mismo
  tipo de riesgo de adopción que ya señala la pregunta 9 del guion).

## §11 · Roles y permisos

| # | Funcionalidad | Regla asociada | Estatus MVP |
|---|---|---|---|
| AV-1101 | 7 roles: Vendedor, Gerente de país, Dirección comercial, Preventa/consultor, Finanzas, Marketing, Administrador | | **Preventa ya definido aquí — contradice que D-04 siga "pendiente"** |
| AV-1102 | Alcance jerárquico de visibilidad (propio → oficina → todo) | | [MVP] |
| AV-1103 | Ver costo independiente de ver margen | SEG-01 | [MVP] — RN-09 |
| AV-1104 | Objetivos ajenos visibles solo para el gerente correspondiente hacia arriba | SEG-02 | [sin decisión] |
| AV-1105 | Documentos marcables como confidenciales | SEG-04 | [sin decisión] |
| AV-1106 | Cambios de permisos requieren doble aprobación o justificación | SEG-05 | [sin decisión] |

## §12 · Integraciones y migración

| # | Funcionalidad | Notas | Estatus MVP |
|---|---|---|---|
| AV-1201 | Migración completa desde Pipedrive (organizaciones, personas, deals, líneas, actividades, notas) | MIG-01 a MIG-06 | **⚠ Conflicto directo con "arranque en limpio, sin migrar Pipedrive" de alcance-mvp. Es la contradicción más grande entre ambos documentos — hay que resolverla antes de estimar.** |
| AV-1202 | Costo por línea probablemente no existe en Pipedrive → llega en cero, marcado "no informado" | | Ya no aplica si no hay migración — pero si D-02 decide cargar histórico agregado, esta regla sigue siendo relevante para ese resumen |
| AV-1203 | Programación de facturación CRM → Defontana al ganar | | [Fuera del MVP] |
| AV-1204 | Estatus de factura/cobro Defontana → CRM | | [Fuera del MVP] |
| AV-1205 | Catálogo de productos sincronizado desde Defontana (el SKU nace ahí) | | **Es exactamente C-01 — riesgo de costo desactualizado sin esta integración** |
| AV-1206 | SSO Entra ID con segundo factor | | [MVP] |
| AV-1207 | Registro automático de correos entrantes/salientes contra persona/oportunidad (Outlook) | | Revisar alcance real: alcance-mvp solo menciona "calendario y correo" de forma genérica — confirmar si incluye este nivel de detalle |
| AV-1208 | Alternativa de almacenamiento en OneDrive/SharePoint en vez de repositorio propio | | Pregunta 18 del guion — decisión pendiente |
| AV-1209 | Notificaciones por Teams (ganada, autorización, hitos vencidos) | | [sin decisión, no mencionado antes] |

## §13 · Requisitos no funcionales

No son "funcionalidades" de pantalla, pero condicionan la estimación: disponibilidad
99.5%, pipeline de 500 oportunidades en <2s, respaldo diario con 30 días de retención,
cumplimiento LFPDPPP/Ley 1581/Ley 19.628 en los tres países, diseño API-first,
configuración sin código para pipelines/catálogos/umbrales, pruebas automatizadas
obligatorias sobre el motor de precio. **Ninguno de estos aparece mencionado en
`alcance-mvp.md` ni en el guion — vale la pena preguntarle al Director de México (o llevarlo
al Gerente General) si hay requisitos de cumplimiento normativo que Avattar ya conoce y que
deban confirmarse.**

## §14 · Roadmap propio de la especificación (para comparar, no para adoptar tal cual)

La especificación propone Fase 1 = "Núcleo comercial" (10-14 semanas), Fase 2 =
"Disciplina comercial" (8-10 semanas), Fase 3 = "Extensión" (continua). **Esta fasificación
NO es la misma que la secuencia E1-E4 ya acordada en `alcance-mvp.md`** (E1 núcleo comercial
→ E2 cotización y gobierno del margen → E3 cobro y medición → E4 consolidación regional).
Son dos formas distintas de cortar el mismo trabajo — probablemente valga la pena
reconciliarlas en una sola secuencia antes de estimar, en vez de dejar que convivan dos
roadmaps con nombres de fase distintos.

## §15 · Decisiones abiertas en la especificación (comparadas con D-01 a D-07)

| Decisión de la especificación | Equivalente en alcance-mvp | Nota |
|---|---|---|
| Umbrales de autorización | D-07 | Coincide |
| Fuente del tipo de cambio | — | **Nueva.** No estaba en las 7 decisiones pendientes originales |
| Etapas por país (¿mismas o propias?) | — | **Nueva** |
| Hitos y días de crédito (fecha cobro vs. facturación) | — | **Nueva** |
| Anticipos e impuestos en hitos (antes/después de IVA) | — | **Nueva** |
| Alcance de la migración (¿todo o 2-3 años?) | D-02 | Parcialmente — D-02 asume que NO se migra; esta pregunta asume que SÍ. Ver conflicto de §12 |
| API de Defontana disponible | D-01 (relacionada) | Parcialmente nueva |
| Renovaciones: anticipación y crédito sobre valor completo o solo crecimiento | — | **Nueva** |
| Objetivos en moneda local por oficina | — | **Nueva** — tema para GG en el guion (cuota en USD) |
| Mantenimiento del costo estándar | D-01 | Coincide |
| Almacenamiento de documentos (CRM propio vs. SharePoint) | — | **Nueva** — pero ya estaba como pregunta 18 en el guion, aunque no como decisión D-xx formal |
| Dimensionamiento y piloto (usuarios/país, oportunidades/año) | D-06 | Coincide |

**Conclusión de esta sección:** de las 12 decisiones abiertas en la especificación, 4
coinciden con las D-01/D-02/D-06/D-07 ya conocidas, y **8 son nuevas** — no estaban
capturadas ni en `alcance-mvp.md` ni en el guion de entrevista. Vale la pena decidir si se
agregan como D-08 a D-15 antes de la sesión con el Director de México, o si se quedan para
una segunda ronda.

---

## Resumen ejecutivo de contradicciones para actualizar `alcance-mvp.md`

Además de las C-01 a C-04 ya documentadas, se identifican:

- **C-05 (alto)** — La especificación asume migración completa desde Pipedrive en Fase 1;
  `alcance-mvp.md` decidió arrancar en limpio. Es la contradicción de mayor impacto en
  costo/tiempo de todo el corpus revisado hasta ahora — afecta directamente la estimación
  de la Fase 1 / E1.
- **C-06 (medio)** — La especificación pone la sincronización con Outlook/M365 en Fase 2,
  pero `alcance-mvp.md` la decidió como parte de la cobertura desde v1.
- **C-07 (medio)** — La especificación pone "aplicación móvil o PWA" en Fase 2, pero el
  prototipo HTML ya construyó la vista móvil completa como parte del MVP (M13).
- **Nota sobre D-04** — La especificación ya define el rol de Preventa/consultor con
  permisos propios, lo que sugiere que esta decisión podría estar más resuelta de lo que
  el guion de entrevista asume. Confirmarlo evita preguntar algo que quizá ya se decidió
  en otra sesión.
- **Módulo nuevo agregado (§10b)** — Prospectos (Leads → conversión a Oportunidad), a
  petición explícita del usuario, decidido para Fase 2 con alta manual únicamente (sin
  formulario web). No existía en la especificación original ni en el prototipo HTML; se
  agregó porque además resuelve un dato huérfano que ya pedía el tablero de Análisis
  (`AV-905`, tiempo de respuesta a nuevos prospectos).
