# Agente de análisis de oportunidades · diseño

**Fecha:** 11 de noviembre de 2026. **Decisión:** decisiones-pendientes §62. **Aprobado por:** el usuario, en chat, con
las cuatro elecciones de abajo.


> **Enmendado el mismo día por decisiones §63:** el análisis es **a demanda**. No hay cron, barrido ni reintentos; el botón
> «Analizar con IA» lo decide el permiso `ANALIZAR_CON_IA` de la matriz; la marca de los servicios pasa a ser `lastChangedAt`
> y sirve para avisar «nada ha cambiado» (`CONFIRMACION`) antes de gastar tokens; el bloqueo «analizando» es
> `analysisStartedAt`. Las secciones «Motor» y «Fallas» de abajo describen el diseño original y quedan como historia.

## Qué es

Un agente dentro del CRM que, cuando una oportunidad abierta cambia, lee todo lo que el CRM sabe de ella y escribe
una **ficha de estado**: etiqueta (`SALUDABLE | EN_RIESGO | CRITICA | SIN_INFORMACION`), resumen, riesgos, acciones y
huecos, cada riesgo y acción con la actividad que lo sostiene y la cita textual. La ficha se ve en una pestaña
«Análisis» del detalle y su etiqueta en la tarjeta del kanban y en la tabla.

Elecciones del usuario: (1) **en lote, pocos minutos después del cambio**; (2) **Claude Opus 5.5**; (3) **solo
oportunidades abiertas**; (4) **pestaña en el detalle y estado en la tarjeta**.

## Premisas

- **Los datos de la oportunidad viajan a la API de Anthropic** (notas, resultado y transcripción de actividades,
  nombres de cuenta y contactos, importes). Es decisión del negocio; queda anotada en §62 para que la confirme el
  Director. Sin `ANTHROPIC_API_KEY` el agente está apagado: nada falla, solo no analiza.
- **El modelo recibe lo mismo que el MCP** (§61): ficha, MEDDIC, hitos, banderas calculadas, actividades con notas,
  resultado y transcripción. **Nunca costo, utilidad ni margen** (INV-02): la ficha la lee el vendedor.
- **La salida es el mismo esquema que `guardar_recomendacion`** (`lib/mcp/esquemas.ts`), sin `opportunity_id` ni
  `model`. Se exige con salida estructurada (`output_config.format`) y se valida después con Zod y con
  `validarFuentes` (§61): cada cita debe existir en una actividad de esa oportunidad. Una sola fuente de verdad para
  la IA del MCP y la del agente.
- Ningún umbral de negocio en el código. La espera entre cambio y análisis es operativa: `ANALISIS_ESPERA_MINUTOS`
  (3 por omisión).

## Motor

**Marca.** Los servicios que mutan una oportunidad llaman, dentro de su transacción, a `programarAnalisis(tx, id)`
o funden `marcaDeAnalisis()` en el `update` que ya hacen. Escribe `Opportunity.analysisDueAt = ahora + espera`. Una
ráfaga de cambios corre la fecha y produce un solo análisis. Sitios: crear, cambiar etapa, editar (incluye reasignar y
preventa), reabrir, registrar y editar actividad, MEDDIC, hitos (guardar, quitar, marcar), documentos (subir, quitar),
cotización (abrir, guardar línea, guardar cambios, quitar línea). Ganar o perder **borra** la marca: una cerrada no se
analiza y conserva su última ficha.

**Barrido.** `GET /api/analisis/barrido` con `Authorization: Bearer <CRON_SECRET>` (la convención de Vercel Cron).
Toma hasta `limite` oportunidades **abiertas** con `analysisDueAt <= ahora` y sin arriendo vigente (`analysisLeasedAt`
nulo o de hace más de 10 minutos), las arrienda en un `updateMany` condicionado para que dos barridos no choquen, y
las analiza una por una. `maxDuration = 300`. `vercel.json` lo programa cada 2 minutos (plan Pro; en Hobby los crons
son diarios y la misma ruta la puede llamar pg_cron). El middleware deja pasar `/api/analisis/` sin cookie.

**«Analizar ahora».** Server Action para quien edita la oportunidad (`puedeEditarOportunidad`): pone `analysisDueAt =
ahora` y lanza el barrido de esa sola oportunidad con `after()` al responder. La pestaña muestra «Analizando…» mientras
hay marca pendiente.

**Fallas.** Si la llamada o la validación falla, `analysisError` guarda el motivo, `analysisAttempts` sube y
`analysisDueAt` se corre con espera creciente (15 min, 60 min); al tercer fallo la marca se quita y la pestaña dice «No
se pudo analizar» hasta el siguiente cambio o «Analizar ahora». Un éxito pone intentos en cero y borra el error.

## La llamada a Claude (`lib/agente/`)

- SDK oficial `@anthropic-ai/sdk`, `claude-opus-5-5`, pensamiento adaptativo (siempre encendido en este modelo) con
  esfuerzo `medium` explícito, streaming con `finalMessage()`, `fallbacks: "default"` con la beta
  `server-side-fallback-2026-07-01` ante un rechazo del clasificador, prompt del sistema con `cache_control`.
- `Analista` es una interfaz: `analizar(peticion) → { salida: unknown, modelo, tokens }`. `analistaClaude()` la
  implementa; las pruebas inyectan uno falso. Nada llama a la API real en pruebas.
- `expediente.ts` (puro): de las filas que lee `lib/scope/agente.ts` a un texto en español con secciones (ficha,
  etapa y tiempos, MEDDIC, hitos, cotización sin costo, banderas, actividades de la más reciente a la más antigua con
  `activity_id`, análisis anterior si lo hay). Las últimas 30 actividades; una transcripción se recorta a 12 000
  caracteres con la marca «[…recortada]».
- `prompt.ts`: el sistema fija el rol (analista comercial de Avattar), las reglas (citar solo `activity_id` del
  expediente con fragmentos textuales; `SIN_INFORMACION` cuando no hay actividades con contenido; acciones concretas y
  con dueño implícito; español), y el mensaje de corrección cuando `validarFuentes` rechaza: se le devuelven los
  problemas y se pide la salida completa de nuevo, una sola vez.
- `salida.ts`: `Analisis` (Zod, derivado de `GuardarRecomendacion`) y `FORMATO_DE_SALIDA` (JSON Schema que la API
  impone: formas, enum, `required` y `additionalProperties: false`; los límites de longitud y cardinalidad los
  aplica Zod después, porque la salida estructurada no los soporta). Una prueba verifica que las claves de uno y otro
  coinciden.

## Datos

- `Opportunity`: `analysisDueAt`, `analysisLeasedAt`, `analysisAttempts` (0), `analysisError`. Índice
  `[status, analysisDueAt]`.
- `OpportunityInsight`: `generatedById` pasa a opcional; `origin: InsightOrigin (MCP | AGENTE)` con omisión `MCP`;
  `inputTokens`, `outputTokens` opcionales para medir el gasto. La fila del agente es una versión más de la misma
  historia que el MCP.
- `AuditLog.byUserId` pasa a opcional: el agente no es un usuario. `AuditAction` gana `GENERAR_ANALISIS`; la Bitácora
  lo muestra como «Análisis actualizado · En riesgo», con «Agente de análisis» como quién.
- Migración `20261111100000_agente_de_analisis`.

## Pantalla

- **Pestaña «Análisis»** (`components/oportunidad/FichaDeAnalisis.tsx`): pastilla de estado, resumen, riesgos,
  acciones y huecos; cada riesgo y acción enlaza a la actividad citada (`?p=actividades`) y muestra la cita; «Generada
  hace», modelo, origen (agente o cliente de IA con nombre de quien la guardó); versiones anteriores plegadas en
  `<details>`; «Analizar ahora» para quien edita; estado «Analizando…» o «No se pudo analizar: motivo». Sin ficha:
  vacío que propone «Analizar ahora» o dice que el agente está apagado.
- **Tarjeta y tabla**: pastilla con la etiqueta del último análisis (verde, lima, coral, gris). El lector de lista trae
  solo `payload.estado.etiqueta` de la fila más reciente.
- Tonos: `SALUDABLE` exito · `EN_RIESGO` alerta · `CRITICA` peligro · `SIN_INFORMACION` neutro.

## Pruebas

- Puras: `expediente` (texto sin costo ni utilidad ni margen; orden y recorte), `salida` (claves alineadas, límites),
  `espera` (próximo intento y tope de intentos).
- Integración: cada servicio deja la marca; ganar la borra; el barrido con analista falso guarda fila `AGENTE`,
  tokens y bitácora sin usuario; citas inválidas piden corrección una vez y luego registran el error con espera; el
  arriendo impide que dos barridos tomen la misma; la ruta sin secreto responde 401.

## Fuera de alcance

Notificaciones, chat sobre la ficha, análisis de prospectos, análisis de cerradas, límites de gasto automáticos (el
gasto se mide en tokens por fila y se decide después).
