# Servidor MCP remoto · diseño

**Fecha:** 10 de noviembre de 2026 · **Estado:** aprobado (camino A, propietario y Gerencia escriben,
cita textual obligatoria, `estado` como etiqueta y resumen, sin costo por MCP).

Cada vendedor conecta su propio cliente de IA (Claude, ChatGPT, Copilot, Claude Code) al CRM, le pide
que analice una oportunidad a partir de sus actividades y transcripciones, y guarda la recomendación
en la base con sus fuentes. El CRM expone para eso un servidor MCP sobre HTTP dentro del mismo
proyecto Next.js, protegido con OAuth 2.1 donde **Supabase Auth es el servidor de autorización** y el
CRM es el *resource server*.

## 1. Lo que el repo impone y el encargo no sabía

- **No hay políticas RLS.** Todas las tablas tienen RLS habilitado y forzado y ninguna `CREATE
  POLICY`: deny-all como respaldo. La autorización vive en `lib/scope` (INV-01) y el invariante de
  columnas (INV-02) no se puede expresar en RLS. Por eso **las herramientas no usan supabase-js**: el
  token OAuth dice quién es, se arma la `Session` de siempre y cada herramienta llama a los lectores
  existentes. Ninguna herramienta ve más que el usuario del token; nunca `service_role`.
- **Los ids son `cuid`, no `uuid`.** `source_activity_ids` es `text[]` y la FK a `users` es `text`.
- **No hay política de oportunidad que reutilizar.** `opportunity_insights` y `mcp_tool_calls` quedan
  como las demás tablas (RLS forzado, sin políticas) y se leen por `lib/scope`.

## 2. Autorización

**Servidor OAuth.** Supabase Auth, con *OAuth 2.1 Server* encendido y **registro dinámico de
clientes** permitido (lo exigen Claude, ChatGPT y Copilot). La ruta de autorización apunta a la
pantalla de consentimiento del CRM. Esto se enciende en el panel de Supabase, en desarrollo primero y
en producción con aprobación.

**Pantalla de consentimiento.** `app/(auth)/oauth/consent`: si no hay sesión manda a `/login` con
`destino` de vuelta; con sesión lee `getAuthorizationDetails(authorization_id)`; si ya consintió,
redirige; si no, muestra el nombre del cliente, su `redirect_uri` y los alcances en español, con dos
acciones: **Autorizar** y **Rechazar**. Las decisiones son Server Actions que llaman a
`approveAuthorization` / `denyAuthorization` y redirigen a la `redirect_url` que devuelven.

**Alcances.** `crm:read` (consultar oportunidades y actividades) y `crm:write` (guardar
recomendaciones) son la unidad en que cada herramienta declara lo que necesita. **Supabase Auth los
rechaza** (`unsupported scope: crm:read`, verificado el 10-nov-2026), así que al servidor de
autorización solo se le piden `openid email`, y eso es lo que anuncian `scopes_supported` y el
desafío del 401. **Si el token trajera alcances `crm:*`, se exigen** (lectura necesita `crm:read`,
escritura `crm:write`); **como no los trae**, la puerta queda en la matriz de permisos
y el alcance por rol, que son la autorización real, y el registro de llamadas lo deja escrito
(`scopes: []`). Lo que el cliente podrá hacer se dice fijo en el consentimiento. Verificado
(decisiones §61).

**Token → sesión.** `lib/mcp/auth.ts`:

1. Toma el bearer del encabezado `Authorization`. Sin él: 401 con
   `WWW-Authenticate: Bearer resource_metadata="<origen>/.well-known/oauth-protected-resource", scope="openid email"`.
2. Verifica el JWT con `supabase.auth.getClaims(jwt)` (ES256 contra el JWKS del proyecto; en pruebas
   se inyectan llaves con `keys`). Inválido o vencido: 401.
3. Exige el claim `client_id`: un token de sesión del navegador no entra por aquí. Sin él: 401.
4. Resuelve el perfil de `public.users` por `sub` con la **misma consulta** que `getSessionResult`
   (se extrae a `perfilDesdeClaims` en `lib/auth/session.ts`, sin cambiar su comportamiento). Sin
   perfil activo: 403 «sin perfil en el CRM».
5. Devuelve `{ session, clientId, scopes }`.

**Metadatos del recurso.** `GET /.well-known/oauth-protected-resource` y
`/.well-known/oauth-protected-resource/mcp` (RFC 9728):

```json
{ "resource": "<origen>/mcp",
  "authorization_servers": ["<NEXT_PUBLIC_SUPABASE_URL>/auth/v1"],
  "scopes_supported": ["openid", "email"],
  "bearer_methods_supported": ["header"] }
```

`<origen>` sale de `MCP_RESOURCE_URL` si existe, si no del request. `OPTIONS` responde CORS abierto
solo en estas rutas de metadatos.

**Middleware.** `/mcp` y `/.well-known` se agregan a las rutas sin cookie: ahí la identidad es el
bearer, y el middleware sigue sin autorizar nada.

## 3. Transporte

`@modelcontextprotocol/sdk` 1.32.2 (pasa la cuarentena de siete días, acepta zod 3.25).
`app/mcp/route.ts` exporta `POST`, `GET` y `DELETE`; cada request crea un `McpServer` y un
`WebStandardStreamableHTTPServerTransport` sin sesión (`sessionIdGenerator: undefined`,
`enableJsonResponse: true`), conecta, y delega en `transport.handleRequest(request, { authInfo })`.
Sin Redis, sin estado entre requests. `GET` responde 405 (no hay flujo de notificaciones del
servidor), `DELETE` 405.

## 4. Datos

```
model OpportunityInsight {                       // opportunity_insights
  id                String   @id @default(cuid())
  opportunityId     String   @map("opportunity_id")
  payload           Json                          // la recomendación validada
  sourceActivityIds String[] @map("source_activity_ids")
  model             String?                       // lo que el cliente reporta
  generatedById     String   @map("generated_by")
  generatedAt       DateTime @default(now()) @map("generated_at")
  opportunity Opportunity @relation(..., onDelete: Cascade)
  generatedBy User
  @@index([opportunityId, generatedAt(sort: Desc)])
}

model McpToolCall {                              // mcp_tool_calls
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  clientId      String   @map("client_id")
  tool          String
  params        Json
  opportunityId String?  @map("opportunity_id")  // sin FK: es registro, no relación
  at            DateTime @default(now())
  durationMs    Int      @map("duration_ms")
  result        McpCallResult                    // OK | RECHAZADO | ERROR
  message       String?                          // lo que se le devolvió al agente
  user User
  @@index([userId, at]) @@index([opportunityId, at])
}
```

Cada guardado de recomendación es **una fila nueva**; no hay `update`. `AuditLog` gana
`GUARDAR_RECOMENDACION` (entidad `Opportunity`, `after` con id del insight, etiqueta, conteos, modelo
y cliente) escrito en la misma transacción que el insert (INV-09); la Bitácora lo muestra como
«Recomendación guardada». La migración `20261110120000_mcp_insights.sql` crea las dos tablas con RLS
habilitado y forzado, como las demás.

Lectores nuevos en `lib/scope`:

- `insights.ts` · `listInsights(session, opportunityId)`: las recomendaciones de una oportunidad al
  alcance, descendentes. Para la futura pestaña y para pruebas.
- `mcp.ts` · los lectores del servidor: `buscarOportunidades` (reusa `parseFilters` + `toWhere` +
  `listOpportunities`), `actividadesDeOportunidad` (keyset por `startsAt, id`),
  `actividadPorId`, `actividadesPorIds` (para validar fuentes). Todos anteponen el alcance.
- `activities.ts` no cambia.

El registro de llamadas lo escribe `lib/audit/mcp.ts` (`registrarLlamadaMcp`), fuera de la
transacción de la herramienta: es registro de acceso, se escribe siempre, también en rechazo y error.

## 5. Herramientas

Esquemas Zod en `lib/mcp/esquemas.ts`; el SDK deriva de ahí el JSON Schema de entrada y salida.
Constantes del módulo (no son umbrales de negocio): búsqueda 25 por página, actividades 20 por
omisión y 50 máximo, extracto de 200 caracteres, riesgos y huecos 0–10, acciones 1–10, descripción
≤ 300, cita ≤ 500, resumen ≤ 600, modelo ≤ 100.

| Herramienta | Entrada | Salida | Cuándo |
|---|---|---|---|
| `buscar_oportunidades` | `etapa?` (nombre), `responsable?` (nombre o correo), `importeMin?`, `importeMax?`, `estatus?` (ABIERTA por omisión), `campoFecha?` + `desde?`/`hasta?` (el campo es obligatorio si hay fechas), `texto?`, `cursor?` | `{ oportunidades[], siguienteCursor }` con id, folio, nombre, cuenta, etapa, importe USD, cierre estimado, propietario, estatus, pronóstico, última actividad | Para encontrar la oportunidad a analizar; nunca para volcar el pipeline |
| `obtener_oportunidad` | `opportunity_id` | ficha: datos, etapa y probabilidad, MEDDIC (puntaje y componentes), hitos, banderas calculadas con su evidencia, conteo de actividades, recomendaciones previas (fecha, etiqueta) | Antes de analizar; una sola vez |
| `listar_actividades` | `opportunity_id`, `limit?`, `cursor?` | `{ actividades[], siguienteCursor }` con id, tipo, asunto, fecha, hecha, responsable, extracto (200), `tieneTranscripcion`, `longitudTranscripcion` | Para ver qué pasó; el contenido completo se pide por `obtener_nota` |
| `obtener_nota` | `activity_id` | asunto, notas, resultado, transcripción completa, `opportunity_id` | Solo para las actividades que vas a citar |
| `guardar_recomendacion` | `opportunity_id`, `estado { etiqueta, resumen }`, `riesgos[]`, `acciones[]`, `huecos[]`, `model?` | `{ insight_id, generated_at, version }` | Al terminar el análisis; una vez por análisis |

`etapa` se resuelve por nombre contra las etapas de los pipelines de los países de la sesión;
`responsable` contra los usuarios activos de esos países; si no coincide, se rechaza diciendo qué
valores existen. **Costo, utilidad y margen nunca salen por el MCP**, aunque la sesión tenga
`VER_COSTO`: los DTO de `lib/mcp/dto.ts` no los toman, y una prueba lo verifica.

`estado.etiqueta ∈ { SALUDABLE, EN_RIESGO, CRITICA, SIN_INFORMACION }`. Cada riesgo y cada acción:
`{ descripcion, fuente: { activity_id, cita } }`. Cada hueco: `{ descripcion }`.

## 6. Validación de `guardar_recomendacion` (el servidor valida, no el modelo)

`lib/domain/insight.ts` · `guardarRecomendacion(session, input, { clientId })` devuelve
`ResultadoAccion`. En orden:

1. **Zod**: longitudes y cardinalidades. Cada problema dice campo, límite y qué hacer.
2. **Oportunidad al alcance** (`getOpportunity`): si no, `AUTORIZACION`: «no existe o no está a tu
   alcance; usa un `opportunity_id` devuelto por `buscar_oportunidades`».
3. **Permiso de escritura**: `puedeEditarOportunidad` (propietario o alcance de oficina). Preventa
   lee y no escribe. `AUTORIZACION` con el folio.
4. **Fuentes** (`lib/domain/insightFuentes.ts`, puro, con pruebas): para cada `activity_id` citado,
   con las actividades que `actividadesPorIds` trajo **dentro del alcance**:
   - no está → «`riesgos[2].fuente.activity_id` «x» no existe o no está a tu alcance»;
   - está pero es de otra oportunidad → «…pertenece a OPP-2026-00007, no a OPP-2026-00012; cita solo
     actividades de `listar_actividades` de esta oportunidad»;
   - está pero la cita no aparece textual (espacios normalizados, sin distinguir mayúsculas) en
     asunto, notas, resultado ni transcripción → «…la cita no aparece en la actividad; copia el
     fragmento tal cual de `obtener_nota`».
   Todos los problemas se devuelven juntos, como `VALIDACION`.
5. **Transacción** (`auditedTransaction`): insert del insight + `GUARDAR_RECOMENDACION`. La versión
   es el conteo de insights de la oportunidad tras insertar.

## 7. Contrato de error hacia el agente

`lib/mcp/resultado.ts` (puro) traduce `ResultadoAccion` a `CallToolResult`: `isError: true` y un
texto que empieza por qué falló y termina con qué hacer distinto, un problema por línea. Una
excepción no atrapada se registra como `ERROR` y devuelve «Error interno del CRM; reintenta. Si
persiste, avisa a Administración», sin detalles. Alcance insuficiente: «esta herramienta necesita
`crm:write`; vuelve a autorizar el cliente con ese alcance».

## 8. Pruebas

- Puras: esquemas (límites y cardinalidades), cursor (ida y vuelta; el corrupto se rechaza, no reinicia la página), DTO sin costo
  ni margen, `validarFuentes` (los tres rechazos y el caso bueno), `textoDeFalla`.
- Integración (base de desarrollo): `guardarRecomendacion` guarda y audita; rechaza actividad de
  otra oportunidad, inexistente y cita que no aparece; Preventa no escribe; vendedor no alcanza la
  oportunidad de otro. `listar`/`obtener` recortan por alcance.
- Ruta: `POST` del handler con JSON-RPC (`initialize`, `tools/list`, `tools/call`) y tokens ES256
  firmados en la prueba con WebCrypto e inyectados por `keys`; sin bearer → 401 con
  `WWW-Authenticate`; sin `client_id` → 401; sin perfil → 403; `crm:read` solo → `guardar` rechaza.
- Manual: MCP Inspector y `claude mcp add --transport http <origen>/mcp`.

## 9. Fuera de alcance

Pestaña «Recomendaciones» en la ficha (el lector `listInsights` queda listo); revocación de clientes
desde el CRM (se hace en Supabase); límites de tasa; análisis automático sin cliente de IA.

## 10. Costo de volver

Una migración que quita dos tablas, un valor de `AuditAction`, la carpeta `lib/mcp`, dos rutas y la
pantalla de consentimiento. Nada del flujo existente cambia salvo la extracción de
`perfilDesdeClaims`, que conserva el comportamiento.
