# Avattar CRM

CRM de ventas a la medida para Avattar IT Solutions (México, Colombia, Chile).
Reemplaza a Pipedrive. Gobierna **margen** y **cobro**, no solo etapas.

**Antes de escribir código, lee `CLAUDE.md`.** Ahí están los quince invariantes,
la nomenclatura, el contrato de las acciones y las reglas de trabajo. La
especificación completa está en `docs/CRM-AVTR-SPEC.md`; lo que se asumió y qué
cuesta cambiarlo, en `docs/decisiones-pendientes.md`.

## Arranque

```bash
pnpm install                  # solo pnpm: el lockfile y la cuarentena de 7 días viven ahí

cp .env.example .env.local
# Llenar con los valores del proyecto de Supabase EN LA NUBE.
# Las cadenas de conexión salen de: Dashboard → Connect → ORMs → Prisma.

pnpm db:generate              # cliente de Prisma (no requiere conexión)
pnpm db:seed                  # escenario del prototipo aprobado (§15 del spec)
pnpm dev                      # http://localhost:3000
```

**Dónde clonar importa.** No dentro de OneDrive: el filtro de archivos en la
nube hace las lecturas 7 veces más lentas y le tira la caché a webpack. Con eso
y un antivirus corporativo, `pnpm dev` tarda 15 – 27 s en compilar una pantalla.
Medido y explicado en `docs/latencia-dev.md`; clonar en `C:\dev\` evita la
mitad del problema sin tocar código.

### Sobre las cadenas de conexión

Van al proyecto de la nube, no a un Postgres local: el SSO de Entra ID está
configurado ahí, y ahí se aplican y verifican las migraciones. (Una base local
solo para desarrollo es una opción abierta en `docs/latencia-dev.md`.)

El **puerto** es lo que distingue las dos variables, no el host:

| Variable | Puerto | Modo | Para qué |
|---|---|---|---|
| `DATABASE_URL` | 6543 | transacción | La aplicación, en cada request. Exige `?pgbouncer=true` |
| `DIRECT_URL` | 5432 | sesión | Migraciones y `pnpm db:seed` |

**No uses `db.<ref>.supabase.co` para `DIRECT_URL`.** Esa es la conexión directa
y solo publica IPv6; en una red IPv4 el seed falla con `ENETUNREACH` sin
mencionar IPv6 por ningún lado. El pooler en modo sesión hace lo mismo sobre
IPv4.

## Estructura

```
app/
  (auth)/                 login, callback de Entra ID, sin-acceso, cierre de sesión (POST /auth/signout)
  (app)/                  pantallas; cada una con sus Server Actions en acciones.ts
    oportunidades/        P-01 kanban y tabla · [id]/ P-02 detalle con pestañas
    contactos/            organizaciones y personas · organizaciones/[id]/ ficha
    productos/            catálogo con precio versionado
    actividades/ admin/ analisis/
components/
  ui/                     primitivas del sistema de diseño (§13), formulario, avisos
  pipeline/ oportunidad/ contactos/ productos/ cotizacion/    por pantalla
lib/
  db.ts                   PrismaClient · solo lib/scope y lib/domain lo importan
  scope/                  alcance por rol → INV-01. Un lector por pantalla
  domain/                 reglas de negocio: puras con tests, y servicios con transacción
  acciones.ts             el contrato ResultadoAccion de todas las acciones
  auth/ policy/ money/ filters/ audit/ supabase/
middleware.ts             refresca la sesión en cada request; no autoriza
prisma/
  schema.prisma           fuente del modelo · seed.ts + seed/  escenario §15
supabase/
  migrations/             SQL generado desde Prisma, aplicado vía MCP
  migrations/_archivo_v1/ esquema anterior · NO aplicar · ver su README
tests/
  arquitectura/           INV-01 verificado leyendo el código
  integracion/            contra la base sembrada (~20 s de timeout: es la red)
docs/                     ver abajo
```

## Comandos

```bash
pnpm dev                # desarrollo
pnpm build              # prisma generate + next build. No con el dev arriba: comparten .next
pnpm test               # vitest: unitarios de lib/ + integración contra la base
pnpm test:e2e           # criterios de aceptación (playwright)
pnpm lint               # eslint, incluida la frontera de datos de INV-01
pnpm typecheck          # tsc --noEmit
pnpm react-doctor       # calidad de las pantallas. NO `pnpm doctor`: ese es de pnpm
pnpm db:diff            # genera SQL desde schema.prisma, sin conexión
pnpm db:generate        # cliente de Prisma
pnpm db:seed            # siembra el escenario del prototipo
node aplicar-migraciones.mjs   # aplica supabase/migrations/ a la nube con la CLI global, si el MCP no está autorizado
```

Las pruebas de integración leen la base real. Si se vaciaron las oportunidades
para probar el alta, unas 40 pruebas del escenario §15 fallan hasta volver a
sembrar; no es una regresión.

## Documentos

| | |
|---|---|
| `docs/CRM-AVTR-SPEC.md` | Especificación normativa. §3 invariantes, §17 orden de construcción, §18 preguntas abiertas Q-01 a Q-17 |
| `docs/decisiones-pendientes.md` | Supuestos adoptados, dónde viven y qué cuesta cambiarlos. Manda sobre el spec |
| `docs/superpowers/specs/` · `plans/` | Decisiones de construcción y planes (E0, mutaciones de E1) |
| `docs/latencia.md` | Red hacia Supabase: 287 ms por viaje desde México |
| `docs/latencia-dev.md` | Por qué `pnpm dev` es lento en la laptop, medido, y qué hacer |
| `docs/codebase-memory.md` | El grafo del código: instalación, recetas, ADR |
| `docs/react-doctor.md` | Qué hallazgos están suprimidos y por qué |
| `docs/verificacion-bundle.md` | Que el costo no llegue al navegador (INV-02) |
| `docs/alcance-mvp.md` · `listado-funcionalidades-mvp-v2.md` | Alcance funcional y catálogo, del negocio |
| `docs/sesion-director-mexico-preguntas.md` | Preguntas para acotar el MVP con el Director |

## Contexto para agentes

- `CLAUDE.md` — el contrato de trabajo. Siempre en contexto en Claude Code.
- `AGENTS.md` — el mismo contrato para otros agentes; apunta a `CLAUDE.md`.
- `.mcp.json` — dos servidores MCP: `supabase` (migraciones, `get_advisors`;
  hay que autorizarlo con `/mcp`) y `codebase-memory` (grafo del código y ADR;
  requiere el binario local, ver `docs/codebase-memory.md`).
- `.claude/skills/` y `.agents/skills/` — copias idénticas de skills de terceros,
  fijadas por `skills-lock.json`. Se actualizan con `npx skills`, no a mano. No se
  versionan: en un clon nuevo se reinstalan desde el lock con el mismo instalador.

## Decisiones que sorprenden si no se conocen

- **Todo se guarda en USD.** No hay multimoneda ni tipo de cambio. Es decisión de
  negocio: la operación real de Avattar en los tres países ya cotiza en dólares.
  Ver `docs/decisiones-pendientes.md` §3 antes de reintroducir moneda local.
- **Supabase no es la capa de datos.** Es identidad y almacenamiento. Los datos
  pasan por Prisma vía `lib/scope`. RLS está en deny-all como respaldo.
- **`app/` y `components/` no pueden importar Prisma.** Lo impide ESLint y lo
  verifica una prueba de arquitectura. Reciben funciones ya acotadas por rol.
- **Las acciones nunca lanzan.** Devuelven `ResultadoAccion`; validación,
  compuerta y confirmación se muestran en el formulario, autorización y
  conflicto como toast.
- **Nada se borra… de Organization, Person, Opportunity, Activity y User.**
  `Document` y `Milestone` se borran en duro a propósito (`Q-16`).
- **Los umbrales están en la base**, no en el código: piso de margen, mínimos
  MEDDIC, pesos, días para estancada, impuesto. Un `0.20` en `lib/domain` es un
  defecto.

## Estado · 10 de septiembre de 2026

- ✅ **E0** cimientos · **E1** núcleo comercial: kanban y tabla con arrastre,
  alta en modal, detalle con edición, cambio de etapa y actividades, contactos,
  productos.
- ✅ De **E2**, el cotizador: líneas, congelar, versionar, alertas de política.
- ✅ De **E3**, las pestañas MEDDIC, hitos y documentos.
- ⬜ Barra de filtros de §9 (deuda de E0), marcar ganada/perdida, E4 medición,
  E5 regional. Autorizaciones de descuento fuera de este alcance.
- ⚠️ El bucket `documentos` de Storage está en **público**; debe ser privado
  (`Q-17`). El despliegue en Vercel devolvía 500 en el callback de login;
  sospecha: falta `DIRECT_URL` en sus variables.
