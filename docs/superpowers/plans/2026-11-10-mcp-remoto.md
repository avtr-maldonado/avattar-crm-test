# Servidor MCP remoto · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer el CRM como servidor MCP sobre HTTP con OAuth 2.1 (Supabase Auth), cuatro herramientas de lectura acotadas y una de escritura que guarda recomendaciones versionadas con sus fuentes validadas.

**Architecture:** El token OAuth identifica al usuario; se arma la `Session` de siempre y cada herramienta llama a `lib/scope`. Esquemas Zod en `lib/mcp/esquemas.ts` como fuente única. El servicio `lib/domain/insight.ts` valida y escribe con `auditedTransaction`. Ruta `app/mcp/route.ts` con el transporte web estándar del SDK, sin estado. Metadatos RFC 9728 en `/.well-known/oauth-protected-resource`. Consentimiento en `app/(auth)/oauth/consent`.

**Tech Stack:** Next.js 15 App Router, `@modelcontextprotocol/sdk` 1.32.2, zod 3.25, Prisma, Supabase Auth (OAuth 2.1 Server), vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-mcp-remoto-design.md`

## Global Constraints

- Identificadores en inglés, textos en español (INV-14). Toda lectura por `lib/scope` (INV-01); `app/**` no importa `lib/db`.
- Costo, utilidad y margen **nunca** salen por el MCP (INV-02 reforzado).
- `AuditLog` en la misma transacción al guardar (INV-09). Nunca `service_role`.
- Nada de umbrales de negocio en `lib/domain` (INV-05); los límites del MCP son constantes del módulo `lib/mcp`.
- Sin tocar lógica existente: solo extracciones que conservan comportamiento y adiciones.
- TDD: prueba primero y en rojo. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`. El agente no comitea.
- Migración en `supabase/migrations/`, aplicada en DEV con `node aplicar-migraciones.mjs`; PROD con aprobación.

---

### Task 1: Modelo, migración y lectores de insights

**Files:** `prisma/schema.prisma`, `supabase/migrations/20261110120000_mcp_insights.sql`, `lib/audit/index.ts` (acción), `lib/domain/bitacora.ts` (etiqueta), `lib/scope/insights.ts`, `tests/integracion/mcp-insights.test.ts`.

- [ ] Prueba: `listInsights` devuelve vacío para una oportunidad nueva y `null`/vacío fuera de alcance → RED (modelo no existe).
- [ ] Modelos `OpportunityInsight`, `McpToolCall`, enum `McpCallResult`; relaciones en `Opportunity` y `User`.
- [ ] SQL de la migración (tablas, índices, FK cascade, RLS enable + force). Aplicar en DEV; `prisma migrate diff` vacío.
- [ ] `GUARDAR_RECOMENDACION` en `AuditAction` y en `eventoDeAuditoria` («Recomendación guardada»).
- [ ] `listInsights` → GREEN.

### Task 2: Esquemas, cursor, DTO y texto de falla (puro)

**Files:** `lib/mcp/esquemas.ts`, `lib/mcp/cursor.ts`, `lib/mcp/dto.ts`, `lib/mcp/resultado.ts` y sus `.test.ts`.

- [ ] Pruebas de límites: `acciones` vacío rechaza, 11 riesgos rechaza, cita de 501 rechaza, `campoFecha` obligatorio con fechas, etiqueta fuera del enum.
- [ ] Pruebas de cursor: ida y vuelta; cursor corrupto → `null`.
- [ ] Prueba de DTO: la ficha serializada no contiene `grossProfit`, `totalCost`, `unitCost`, `grossMargin`.
- [ ] Prueba de `textoDeFalla`: un problema por línea, termina con qué hacer.
- [ ] Implementar los cuatro módulos.

### Task 3: Validación de fuentes (puro) y servicio `guardarRecomendacion`

**Files:** `lib/domain/insightFuentes.ts` + test, `lib/domain/insight.ts`, `lib/scope/mcp.ts` (`actividadesPorIds`), `tests/integracion/mcp-recomendacion.test.ts`.

- [ ] Pruebas puras de `validarFuentes`: inexistente, de otra oportunidad (con folio), cita ausente, cita presente con espacios distintos → ok.
- [ ] Pruebas de integración: guarda + audita + versión 1 y 2; Preventa rechazada; vendedor sin alcance rechazado; actividad de otra oportunidad rechazada con folio.
- [ ] Implementar `validarFuentes`, `actividadesPorIds`, `guardarRecomendacion`.

### Task 4: Lectores del MCP

**Files:** `lib/scope/mcp.ts` (`buscarOportunidades`, `actividadesDeOportunidad`, `actividadPorId`, `etapasPorNombre`, `usuariosPorNombre`), `tests/integracion/mcp-lectores.test.ts`.

- [ ] Pruebas: un vendedor no obtiene la nota de otro; `actividadesDeOportunidad` pagina con cursor sin repetir ni saltar; `buscarOportunidades` respeta 25 y el estatus por omisión.
- [ ] Implementar.

### Task 5: Autenticación del bearer

**Files:** `lib/auth/session.ts` (extraer `perfilDesdeClaims`), `lib/mcp/auth.ts` + test (`tests/integracion/mcp-auth.test.ts` con llaves ES256 generadas en la prueba).

- [ ] Pruebas: sin bearer → `{ estado: 401 }` con `WWW-Authenticate`; firma inválida → 401; sin `client_id` → 401; perfil inexistente → 403; token bueno → `session` del usuario y `scopes` del claim `scope`.
- [ ] Extraer `perfilDesdeClaims` conservando `getSessionResult`; implementar `verificarPortador(request, { keys? })`.

### Task 6: Servidor, ruta, metadatos y middleware

**Files:** `lib/mcp/servidor.ts`, `lib/audit/mcp.ts`, `app/mcp/route.ts`, `app/.well-known/oauth-protected-resource/route.ts`, `app/.well-known/oauth-protected-resource/mcp/route.ts`, `middleware.ts`, `tests/integracion/mcp-ruta.test.ts`.

- [ ] Pruebas de ruta: `tools/list` devuelve cinco herramientas con JSON Schema derivado; `tools/call obtener_nota` con token de otro vendedor → `isError` y fila `RECHAZADO` en `mcp_tool_calls`; `guardar_recomendacion` con solo `crm:read` → `isError` que pide `crm:write`; metadatos RFC 9728 con `scopes_supported`.
- [ ] Implementar servidor (cinco herramientas, registro de llamadas, mapeo de errores), ruta, metadatos, excepción en middleware.

### Task 7: Pantalla de consentimiento

**Files:** `app/(auth)/oauth/consent/page.tsx`, `app/(auth)/oauth/consent/acciones.ts`, `app/(auth)/login/page.tsx` (solo si `destino` no se conserva), `lib/mcp/alcances.ts` (etiquetas de alcance, puro, con test).

- [ ] Prueba pura: `etiquetaDeAlcance("crm:write")`.
- [ ] Página y acciones. Maqueta con esbuild + Edge solo si la página tiene cliente; si es servidor pura, revisión por `typecheck` y `react-doctor`.

### Task 8: Documentación y cierre

- [ ] `docs/decisiones-pendientes.md` §61, `CLAUDE.md` (mapa, regla nueva, estado), `docs/funcionalidades-y-casos-de-uso.md` (CU del MCP), artefacto «Casos de uso», ADR e índice.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm react-doctor`.
- [ ] Instrucciones para encender el servidor OAuth en Supabase y conectar un cliente.
