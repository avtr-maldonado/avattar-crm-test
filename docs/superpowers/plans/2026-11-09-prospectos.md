# Prospectos · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un módulo de prospectos (leads) con pipeline propio, asignación, descarte con motivo, conversión a cuenta + persona + oportunidad reutilizando lo que existe, importación y exportación CSV, y una pantalla con lista, kanban y detalle lateral.

**Architecture:** Mismos patrones de Oportunidades: `lib/scope/leads.ts` acota por rol; `lib/domain/lead*.ts` decide (reglas puras con pruebas + servicios con `auditedTransaction`); Server Actions en `app/(app)/prospectos/acciones.ts` validan con Zod y delegan; componentes en `components/prospectos/` reutilizan `BarraDeHerramientas`, `Desplegable`, `Panel`, `StatTile`, `Pastilla`, `ComposerDeActividad`. Filtros en la URL (INV-10).

**Tech Stack:** Next.js App Router, React 19, Prisma, Postgres (Supabase), Tailwind, vitest, Playwright (maqueta). Sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-11-09-prospectos-design.md`

## Global Constraints

- Identificadores en inglés, UI en español (INV-14). Sin textos descriptivos en pantalla (§41).
- Toda lectura pasa por `lib/scope` (INV-01); `app/**` y `components/**` no importan `lib/db` ni `@prisma/client`.
- Umbrales por parámetro, nunca literales en `lib/domain` (INV-05): el SLA llega de `CommercialPolicy`.
- Acciones sensibles con `AuditLog` en la misma transacción (INV-09). Nada se borra en duro (INV-15).
- Las Server Actions devuelven `ResultadoAccion`, nunca lanzan.
- Un botón que el servidor va a rechazar no se ofrece. Filtros recortan después del alcance.
- Migraciones: SQL en `supabase/migrations/`, aplicadas con `node aplicar-migraciones.mjs` (DEV y PROD con `--env`). El `ALTER TYPE … ADD VALUE` va en su propio archivo.
- TDD: la prueba primero y en rojo. `pnpm typecheck`, `pnpm lint`, `pnpm react-doctor`, maqueta en navegador. El agente no comitea.

---

## Entrega 1 · modelo, alcance, dominio y pantalla

### Task 1: Esquema, rol, catálogos, política y migraciones

**Files:**
- Modify: `prisma/schema.prisma` (enum Role, enum LeadStage, modelos Lead, LeadStageTransition, LeadFolioCounter, LeadChannel, LeadCampaign, LeadDiscardReason; `Activity.leadId`; `CommercialPolicy.leadFirstContactSlaHours`; relaciones en User, Organization, Person, Opportunity, Country)
- Create: `supabase/migrations/20261109100000_rol_marketing.sql` (solo `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MARKETING';`)
- Create: `supabase/migrations/20261109100100_prospectos.sql` (generado con `pnpm db:diff` y revisado: tablas, índices `leads(country_code, stage)`, `leads(assigned_to_id)`, `leads(email)`, `activities(lead_id)`; RLS deny-all en las tablas nuevas como las demás; INSERT de los tres permisos y su matriz; INSERT de catálogos)
- Modify: `prisma/seed/permisos.ts` (tres permisos; columna MARKETING en todos), `prisma/seed/catalogos.ts` (canales, motivos de descarte, dos campañas), `prisma/seed/datos.ts` (usuario `{ clave: "MK", name: "Marketing Avattar", role: "MARKETING", paises: ["MX"] }`)
- Modify: `lib/auth/permissions.ts` (`PermissionCode` + `PERMISOS`), `lib/etiquetas.ts` (`ETIQUETA_ROL.MARKETING = "Marketing"`), `lib/domain/permisos.ts` y `app/(app)/configuracion/{page,acciones}.ts` (listas de roles), `lib/domain/userAccess.ts` (TODOS_LOS_ROLES + `case "MARKETING"` → nada), `lib/domain/personAccess.ts` (`case "MARKETING": return false`), `lib/scope/{opportunities,activities,organizations,people,objectives,usuarios}.ts` (`case "MARKETING"`: oportunidades `{ ...base, id: { in: [] } }`; actividades `{ ...base, OR: [{ userId }, { lead: { countryCode: { in } } }] }`; organizaciones como todos; personas como VENDEDOR; objetivos vacío; usuarios por país), `app/(app)/layout.tsx` (Oportunidades y Objetivos solo con `VER_OPORTUNIDADES_PROPIAS` u `OFICINA`; rubro Prospectos con `VER_PROSPECTOS`)
- Test: `lib/domain/userAccess.test.ts` (marketing no administra), `tests/integracion/configuracion.test.ts` (dieciséis permisos, seis roles)

**Interfaces:**
- Produces: `LeadStage` = `"NUEVO" | "EN_VALIDACION" | "CONTACTADO" | "CALIFICADO" | "ASIGNADO" | "ACEPTADO" | "RECHAZADO" | "CONVERTIDO" | "DESCARTADO"`; permisos `VER_PROSPECTOS`, `GESTIONAR_PROSPECTOS`, `CONVERTIR_PROSPECTO`.

- [ ] Prueba en rojo: `configuracion.test.ts` espera 16 permisos y `Object.keys(p.porRol)` de largo 6; `userAccess.test.ts` espera `rolesQueAdministra(sesion({role:"MARKETING"}))` → `[]`.
- [ ] Editar `schema.prisma`; `pnpm db:generate`; `pnpm db:diff` → revisar y partir el SQL en los dos archivos (el enum primero).
- [ ] `node aplicar-migraciones.mjs --dry-run` y luego aplicar en DEV. Correr el seed de catálogos sobre DEV **no**: agregar los catálogos y permisos nuevos con los INSERT de la migración (idempotentes, `ON CONFLICT DO NOTHING`), y el usuario de marketing con `prisma/seed` solo si el usuario lo pide (no re-sembrar sin preguntar). Para las pruebas, crear al de marketing dentro de la prueba con `prisma.user.upsert` por correo `mk@avattar.com`.
- [ ] Typecheck: los `switch` exhaustivos marcan dónde falta `MARKETING`; arreglarlos todos.
- [ ] Pruebas en verde.

### Task 2: Reglas puras · etapas, SLA, acceso, folio, métricas

**Files:**
- Create: `lib/domain/leadStages.ts`, `leadStages.test.ts`; `lib/domain/leadSla.ts`, `leadSla.test.ts`; `lib/domain/leadAccess.ts`, `leadAccess.test.ts`; `lib/domain/leadFolio.ts`, `leadFolio.test.ts`; `lib/domain/leadMetrics.ts`, `leadMetrics.test.ts`

**Interfaces (Produces):**
```ts
// leadStages.ts
export const ETAPAS_DE_PROSPECTO: readonly LeadStage[]            // en orden del proceso, las nueve
export const ETAPAS_ABIERTAS: readonly LeadStage[]                // NUEVO…ACEPTADO (seis) + RECHAZADO se trata aparte
export const ETIQUETA_DE_ETAPA: Record<LeadStage, string>         // «Nuevo», «En validación», …
export const TONO_DE_ETAPA: Record<LeadStage, "neutro"|"acento"|"exito"|"alerta"|"peligro">
export function esTerminal(e: LeadStage): boolean                 // CONVERTIDO, DESCARTADO
export type Actor = { gestiona: boolean; esAsignado: boolean }
export function puedeTransitar(de: LeadStage, a: LeadStage, actor: Actor, tieneVendedor: boolean):
  { ok: true } | { ok: false; mensaje: string }
// leadSla.ts
export type EstadoDeSla = "cumplido" | "en_tiempo" | "por_vencer" | "vencido"
export const ETIQUETA_DE_SLA: Record<EstadoDeSla, string>
export function estadoDeSla(l: { createdAt: Date; firstContactDueAt: Date; contactedAt: Date | null }, ahora: Date): EstadoDeSla
export function venceEn(createdAt: Date, horas: number): Date
// leadAccess.ts
export type ProspectoAccesible = { countryCode: CountryCode; assignedToId: string | null }
export function gestionaProspecto(s: Session, l: ProspectoAccesible): boolean   // GESTIONAR_PROSPECTOS y país al alcance (DIRECCION/ADMIN siempre)
export function decideComoVentas(s: Session, l: ProspectoAccesible): boolean    // asignado, o gestiona
export function convierteProspecto(s: Session, l: ProspectoAccesible): boolean  // CONVERTIR_PROSPECTO y (asignado o gestiona)
// leadFolio.ts
export function formatFolioDeProspecto(year: number, n: number): string        // PRO-2026-00001
export async function nextFolioDeProspecto(tx: Prisma.TransactionClient, year: number): Promise<string>
// leadMetrics.ts
export type ProspectoMedible = { stage: LeadStage; assignedToId: string | null; nextActivityAt: Date | null; createdAt: Date; firstContactDueAt: Date; contactedAt: Date | null }
export function indicadoresDeProspectos(lista: readonly ProspectoMedible[], ahora: Date):
  { abiertos: number; sinAsignar: number; sinSeguimiento: number; slaVencido: number; tasaDeConversion: number | null }
```
- [ ] Pruebas en rojo por archivo (transiciones: libre entre las cuatro primeras para quien gestiona; a ASIGNADO exige vendedor; ASIGNADO→ACEPTADO solo asignado o gestiona; RECHAZADO solo a ASIGNADO o DESCARTADO; terminales no salen salvo nada; SLA: cumplido con contactedAt, por_vencer bajo el 25 %, vencido pasado; acceso por rol y país; folio con relleno; métricas: tasa = convertidos ÷ (convertidos + descartados + rechazados), null sin cerrados).
- [ ] Implementar; verde.

### Task 3: Alcance · `lib/scope/leads.ts`

**Interfaces (Produces):**
```ts
export function leadScope(session: Session): Prisma.LeadWhereInput
export function withLeadScope(session: Session, where?: Prisma.LeadWhereInput): Prisma.LeadWhereInput
export const leadCardSelect = { id, folio, contactName, email, phone, companyName, countryCode, stage, score, createdAt, stageEnteredAt, firstContactDueAt, contactedAt, lastActivityAt, nextActivityAt, channel:{id,name}, campaign:{id,name}, assignedTo:{id,name,initials} }
export async function listLeads(session, opciones: { where?: Prisma.LeadWhereInput; pais?: CountryCode }): Promise<LeadCard[]>
export async function getLeadDetail(session, id): Promise<LeadDetail | null>   // + notes, jobTitle, companyIndustry, createdBy, discardReason, organization/person/opportunity refs, transitions, activities (con type/user), auditoría del lead
export async function catalogosDeProspectos(): Promise<{ canales, campanas, motivosDeDescarte }>  // activos
export async function vendedoresParaAsignar(countryCode): Promise<{id,name}[]>   // activos del país con rol VENDEDOR o GERENTE_PAIS
export async function contarProspectosPendientes(session, pais?): Promise<number>  // abiertos sin asignar o SLA vencido, para el menú
```
- Test: `tests/integracion/prospectos.test.ts` (alcance: marketing MX ve los de MX, no los de CO; vendedor solo los asignados; preventa nada).

### Task 4: Servicios · `lib/domain/lead.ts`

**Interfaces (Produces):**
```ts
export type AltaDeProspecto = { contactName; email?; phone?; jobTitle?; companyName; companyIndustry?; countryCode; channelId; campaignId?; score?; notes?; assignedToId? }
export async function crearProspecto(session, input: AltaDeProspecto, politica: { leadFirstContactSlaHours: number }): Promise<ResultadoAccion<{ id; folio }>>
export async function editarProspecto(session, lead: LeadDetail, cambios: Partial<AltaDeProspecto>): Promise<ResultadoAccion>
export async function cambiarEtapaDeProspecto(session, lead: LeadDetail, a: LeadStage): Promise<ResultadoAccion<{ etapa: string }>>
export async function asignarProspectos(session, leads: LeadDetail[], vendedorId: string): Promise<ResultadoAccion<{ asignados: number }>>
export async function descartarProspecto(session, lead: LeadDetail, motivoId: string): Promise<ResultadoAccion>
export async function registrarActividadDeProspecto(session, lead: LeadDetail, input: RegistroDeActividad): Promise<ResultadoAccion<{ id }>>
export async function editarActividadDeProspecto(session, lead: LeadDetail, activityId, cambios): Promise<ResultadoAccion<{ id }>>
```
- `AuditAction` gana `CREAR_PROSPECTO`, `ASIGNAR_PROSPECTO`, `DESCARTAR_PROSPECTO`, `CONVERTIR_PROSPECTO`, `IMPORTAR_PROSPECTOS`.
- Test (integración, en `prospectos.test.ts`): alta con folio y SLA del país; marketing crea, vendedor no; asignación masiva pasa a ASIGNADO, rechaza vendedor de otro país, deja bitácora por prospecto; descartar sin motivo rechaza; actividad hecha sella contactedAt y pasa de NUEVO a CONTACTADO; transición inválida rechaza con el mensaje de la regla.

### Task 5: Filtros · `lib/filters/leads.ts`

```ts
export type FiltrosDeProspectos = { etapas: LeadStage[]; canales: string[]; campanas: string[]; vendedores: string[]; desde: string|null; hasta: string|null; mios: boolean; q: string }
export function parseFiltrosDeProspectos(sp: URLSearchParams): FiltrosDeProspectos   // etapas inválidas se descartan; sin etapas = abiertas
export function whereDeProspectos(f: FiltrosDeProspectos, session: Session): Prisma.LeadWhereInput  // q: contains en contactName|companyName|email|phone, insensitive
export function hrefDeProspectos(f: FiltrosDeProspectos, extra: Record<string,string>): string
```
- Test: `lib/filters/leads.test.ts`.

### Task 6: Pantalla · lista, kanban, detalle, acciones

**Files:**
- Create: `app/(app)/prospectos/page.tsx`, `acciones.ts`, `loading.tsx`
- Create: `components/prospectos/PastillaDeEtapa.tsx`, `TarjetaProspecto.tsx`, `KanbanDeProspectos.tsx`, `TablaDeProspectos.tsx` (cliente: casillas + barra «Asignar N»), `FiltrosDeProspectos.tsx`, `NuevoProspecto.tsx`, `AsignarProspectos.tsx`, `DescartarProspecto.tsx`, `MenuDeFila.tsx`, `DetalleDeProspecto.tsx` (servidor), `EstadoVacioDeProspectos.tsx`, `IndicadoresDeProspectos.tsx`
- Modify: `components/oportunidad/ComposerDeActividad.tsx` (`leadId?: string` → hidden `leadId`), `components/ui/iconos.tsx` (`prospectos`), `lib/scope/contadores.ts` (prospectos pendientes)

- Acciones: `crearProspectoAccion`, `editarProspectoAccion`, `cambiarEtapaDeProspectoAccion`, `asignarProspectosAccion` (ids via `form.getAll("ids")`), `descartarProspectoAccion`, `guardarActividadDeProspectoAccion` (misma forma que `guardarActividadAccion`), todas revalidan `/prospectos`.
- Detalle lateral: `?p=<id>` → columna derecha `lg:grid-cols-[1fr_22rem]`; cerrar = enlace sin `p`.
- Maqueta: tabla con selección y menú, kanban con arrastre, paneles.

## Entrega 2 · conversión

### Task 7: `convertirProspecto` + panel

```ts
export type ConversionDeProspecto = { name: string; pipelineId: string; stageId?: string; estimatedAmount: string; expectedCloseDate: Date; businessType: BusinessType; ownerId?: string }
export async function convertirProspecto(session, lead: LeadDetail, input: ConversionDeProspecto, umbrales: { meddicMinToClosing: number }): Promise<ResultadoAccion<{ opportunityId; folio; cuentaReutilizada: boolean; personaReutilizada: boolean }>>
```
- Test: reutiliza cuenta por nombre y persona por correo; crea ambas cuando no existen; re-apunta actividades (conservan leadId); el prospecto queda CONVERTIDO con las tres referencias; desde NUEVO rechaza; vendedor asignado convierte desde ACEPTADO; marketing no.
- `components/prospectos/ConvertirProspecto.tsx` (Panel con los campos; pipelines del país vía `pipelinesParaAlta` filtrados por país).

## Entrega 3 · CSV e indicadores

### Task 8: CSV

- Create: `lib/domain/csv.ts` (`parseCsv(texto): string[][]`, `aCsv(filas: string[][]): string`, RFC 4180), `csv.test.ts`; `lib/domain/leadImport.ts` (`validarFilas(filas, catalogos, paises, correosAbiertos): FilaValidada[]` puro), `leadImport.test.ts`; `importarProspectos(session, filas, politicas)` en `lead.ts`.
- Create: `app/(app)/prospectos/exportar/route.ts` (GET, alcance + filtros, `text/csv; charset=utf-8`, BOM, `Content-Disposition: attachment; filename="prospectos.csv"`), `app/(app)/prospectos/plantilla/route.ts`.
- Create: `components/prospectos/ImportarProspectos.tsx` (Panel dos pasos: archivo → tabla de validación → «Importar N válidos»).
- Acciones: `previsualizarImportacionAccion(form)` → `ResultadoAccion<{ filas: FilaValidada[] }>`, `importarProspectosAccion(form)` con las filas válidas en JSON.

### Task 9: Documentación y cierre

- `docs/decisiones-pendientes.md` §58 (rol Marketing, etapas fijas como excepción a INV-13, SLA, conversión no atómica entre pasos 3 y 4, sin calendario para actividades de prospecto).
- `CLAUDE.md` (mapa, invariante 13 con la excepción, estado), `docs/funcionalidades-y-casos-de-uso.md` sección 11 Prospectos, artefacto, ADR, `index_repository`.
- Migración aplicada en PROD con `--env .env.production.local` tras `--dry-run`.
