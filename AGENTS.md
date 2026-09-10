# CRM Avattar · para agentes

Este repositorio se trabaja con agentes de código. **El contrato está en `CLAUDE.md`**: los quince
invariantes, la nomenclatura, dónde vive cada cosa, cómo trabajamos y qué hacer al terminar. Léelo
completo antes de tocar código. Este archivo solo apunta; no lo dupliques aquí.

- **Especificación normativa:** `docs/CRM-AVTR-SPEC.md`. Manda sobre ella, por ser posterior,
  `docs/decisiones-pendientes.md` (supuestos adoptados y qué cuesta cambiarlos).
- **Skills:** `.agents/skills/`, idénticas a `.claude/skills/` y gestionadas por `skills-lock.json`.
  Empieza por `using-superpowers`; dice cuándo invocar las demás.
- **Grafo del código y ADR:** servidor MCP `codebase-memory` en `.mcp.json`. Recetas en
  `docs/codebase-memory.md`. Al empezar, `list_projects`; el ADR se lee con `manage_adr`.
- **Lo que no se negocia:** no levantes `pnpm dev` (lo levanta quien desarrolla); no propongas
  `next build` para la lentitud en desarrollo; solo `pnpm`; ningún `prisma.` fuera de `lib/scope`
  y `lib/domain`; las acciones devuelven `ResultadoAccion`, nunca lanzan.
