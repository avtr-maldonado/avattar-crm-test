# Agente de análisis · plan de implementación

> Spec: `docs/superpowers/specs/2026-11-11-agente-de-analisis-design.md`. Se ejecuta en línea, con TDD (RED observado
> antes de cada módulo). Nada llama a la API real en pruebas.

**Meta:** una ficha de estado por oportunidad abierta, generada por Claude Opus 5.5 pocos minutos después de cada
cambio, visible en la pestaña «Análisis» y en la tarjeta.

**Restricciones globales:** INV-01 (lectores en `lib/scope`), INV-02 (sin costo ni margen al modelo), INV-05 (sin
umbrales de negocio), INV-09 (bitácora en la transacción), INV-14 (UI en español). `app/**` y `components/**` no
importan `lib/db`.

## Tareas

1. **Esquema y migración** `20261111100000_agente_de_analisis`: campos de análisis en `opportunities`, `origin` y
   tokens en `opportunity_insights` con `generated_by` opcional, `by_user_id` opcional en `audit_logs`, enum
   `InsightOrigin`. Aplicar en DEV con `aplicar-migraciones.mjs`; `prisma migrate diff` vacío.
2. **Bitácora**: `AuditAction` gana `GENERAR_ANALISIS`; `AuditEntry.byUserId` opcional; `eventoDeAuditoria` muestra
   «Análisis actualizado · <etiqueta>» con «Agente de análisis» cuando no hay usuario. Prueba en `bitacora.test.ts`.
3. **`lib/agente/salida.ts`** + prueba: `Analisis` derivado de `GuardarRecomendacion`; `FORMATO_DE_SALIDA`; claves
   alineadas.
4. **`lib/agente/espera.ts`** + prueba: `proximoIntento`, `MAX_INTENTOS`, `arriendoVencido`.
5. **`lib/agente/expediente.ts`** + prueba: `textoDeExpediente` y `actividadesCitables`; sin costo.
6. **`lib/agente/prompt.ts`**: sistema, mensaje y corrección (puro).
7. **`lib/agente/analista.ts`**: interfaz `Analista`, `analistaClaude()`, `configurado()`.
8. **`lib/scope/agente.ts`**: `tomarPendientes`, `expedienteDeOportunidad`, `registrarExito`, `registrarFalla`,
   `latestInsightSelect` para la tarjeta.
9. **`lib/domain/analisis.ts`** + pruebas de integración: `marcaDeAnalisis`, `programarAnalisis`,
   `solicitarAnalisis(session, id)`, `analizarOportunidad(id, analista, ahora)`, `barrerAnalisis(analista, opciones)`.
10. **Marcas en los servicios** + prueba `analisis-programar.test.ts`: opportunity, activity, meddicService,
    milestoneService, document, quoteService.
11. **Ruta** `app/api/analisis/barrido/route.ts` + `vercel.json` + middleware + prueba de secreto.
12. **Acción** `analizarAhoraAccion` en `oportunidades/[id]/acciones.ts` con `after()`.
13. **Pantalla**: `FichaDeAnalisis`, pestaña en `page.tsx`, pastilla en `TarjetaOportunidad` y `TablaOportunidades`,
    etiqueta en `opportunityCardSelect` y `aTarjeta`.
14. **Verificación**: typecheck, lint, react-doctor, suites nuevas y completas.
15. **Documentación**: decisiones §62, CLAUDE.md, funcionalidades F-50, artefacto, ADR, `.env.example`.
