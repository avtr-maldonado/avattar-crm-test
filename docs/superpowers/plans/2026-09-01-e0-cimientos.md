# E0 · Cimientos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el proyecto con esquema completo aplicado, seed verificable, autenticación con Entra ID, y las seis librerías de `lib/` que hacen cumplir los invariantes — de modo que E1 solo tenga que construir pantallas.

**Architecture:** Next.js App Router sobre Prisma contra el Postgres de Supabase. Supabase aporta Auth (Entra ID) y Storage; Prisma aporta datos, transacciones y `Decimal`. La autorización vive en `lib/scope`, no en RLS, porque el invariante más delicado (INV-02) es de columnas y RLS filtra filas. RLS queda como respaldo deny-all.

**Tech Stack:** Next.js 15 · React 19 · TypeScript 5.6 · Prisma 6 · PostgreSQL 16 (Supabase) · Tailwind 3.4 · Zod · Vitest · Playwright · react-doctor 0.9.12 · pnpm

**Spec:** `docs/superpowers/specs/2026-09-01-crm-avattar-e0-e1-design.md`, que a su vez deriva de `docs/CRM-AVTR-SPEC.md` v2.0.

## Global Constraints

Copiadas literalmente del spec. Aplican a **toda** tarea de este plan.

- **INV-01** Ninguna consulta de oportunidades, organizaciones, actividades u objetivos fuera de `lib/scope`. Nunca `prisma.opportunity.findMany` en una ruta, componente o Server Action.
- **INV-02** `unitCost`, `totalCost` y `grossProfit` no se serializan para quien no tiene `VER_COSTO`. Selectores explícitos, nunca `select: *`.
- **INV-03** El dinero es `Decimal(18,4)` y se opera con `Decimal`, nunca con `number`. Porcentajes como fracción: `0.1500` = 15 %.
- **INV-04** Todo importe viaja con su moneda. Bajo monomoneda (D-A) esa moneda es siempre `USD`.
- **INV-05** Ningún umbral en el código. Un literal `0.20`, `0.15`, `0.16` o `0.30` en `lib/domain` es un defecto.
- **INV-06** Una cotización congelada es inmutable. Editar = versión nueva.
- **INV-07** No se gana sin cumplir todas las condiciones; la validación vive en el servicio de dominio.
- **INV-08** Sin efecto bajo monomoneda (D-A). No se renumera.
- **INV-09** Las acciones sensibles escriben `AuditLog` en la misma transacción. Si el log falla, la operación falla.
- **INV-10** El estado de los filtros vive en la URL (`searchParams`).
- **INV-11** Las banderas de riesgo se calculan, no se capturan.
- **INV-12** El folio es inmutable, incluso al reabrir. Formato `OPP-AAAA-NNNNN`, consecutivo **por año**.
- **INV-13** Las etapas son datos, no `enum`. Un `switch` por nombre de etapa es un defecto.
- **INV-14** La UI siempre en español. Identificadores en inglés.
- **INV-15** Nada se borra en duro: `deletedAt`, y las consultas lo excluyen por omisión.

**Nomenclatura:** identificadores en inglés, valores de negocio en español. `snake_case` en Postgres con `@map`, `camelCase` en el cliente Prisma, modelos `PascalCase` singular. Rutas en español (`/oportunidades`). Componentes y funciones en inglés (`OpportunityCard`).

**Definición de terminado por tarea:** `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde. Para tareas con pantallas, además `pnpm doctor`. Para tareas que tocan la base, además `get_advisors` sin hallazgos nuevos.

---

## Estructura de archivos

Qué se crea y de qué responde cada cosa. Las decisiones de descomposición se fijan aquí.

```
prisma/
  schema.prisma          fuente del modelo · 32 modelos
  seed.ts                escenario §15 con aserciones
  seed/                  datos por módulo, un archivo por área
lib/
  db.ts                  PrismaClient singleton · SOLO lib/scope y lib/domain lo importan
  money/                 Decimal, formateo USD, serialización a string
  policy/                lectura de CommercialPolicy y Country · INV-05
  auth/                  sesión, permisos, can()
  scope/                 alcance por rol · INV-01 · una consulta por entidad
  audit/                 writeAudit(tx, …) · INV-09
  filters/               definición, parseo y traducción a WhereInput · INV-10
  domain/                reglas puras: riskFlags, meddic, pipeline, stageGate, folio
app/
  (auth)/                login, callback, sin-acceso
  (app)/                 layout con barra lateral · pantallas de E1
components/ui/           primitivas del sistema de diseño
tests/
  arquitectura/          AC-31 y AC-32
  e2e/                   AC-01 a AC-05
```

Regla de frontera, verificada por lint y por prueba: `app/**` y `components/**` no pueden importar `lib/db` ni `@prisma/client`. Reciben funciones de `lib/scope` y `lib/domain`, y tipos de `lib/dto`.

---

## Task 1: Cimientos del proyecto y herramientas

**Files:**
- Create: `.gitignore` (ampliar), `.npmrc`, `.env.example` (reescribir), `vitest.config.ts`, `eslint.config.mjs`
- Modify: `package.json`
- Delete: nada

**Interfaces:**
- Produces: los scripts `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm doctor`, `pnpm db:migrate`, `pnpm db:seed` que todas las tareas siguientes usan.

- [ ] **Step 1: Inicializar git**

El proyecto no está bajo control de versiones. Sin esto ninguna tarea es reversible.

```bash
git init
git add -A
git commit -m "chore: estado inicial antes de E0"
```

- [ ] **Step 2: Migrar a pnpm y fijar dependencias**

`package.json` reemplaza los scripts de Supabase CLI por los de CLAUDE.md:

```json
{
  "name": "avattar-crm",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "doctor": "react-doctor",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:diff": "prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    "db:seed": "prisma db seed"
  }
}
```

Dependencias de producción: `@prisma/client`, `@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`, `zod`, `clsx`, `tailwind-merge`.

Dependencias de desarrollo: `prisma`, `tsx`, `vitest`, `@vitejs/plugin-react`, `@playwright/test`, `react-doctor`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `eslint-config-next`.

- [ ] **Step 3: Instalar y verificar**

```bash
pnpm install
pnpm typecheck
```

Esperado: instalación limpia; `typecheck` sin errores sobre el scaffold actual.

- [ ] **Step 4: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"], exclude: ["tests/e2e/**", "node_modules/**"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 5: Regla de frontera en ESLint**

`eslint.config.mjs` — prohíbe `lib/db` y `@prisma/client` fuera de `lib/scope` y `lib/domain`. Es la mitad de AC-32; la otra mitad es la prueba de arquitectura de la Task 16.

```js
import next from "eslint-config-next";

const prohibido = {
  "no-restricted-imports": ["error", {
    patterns: [
      { group: ["@/lib/db", "**/lib/db"], message: "INV-01: solo lib/scope y lib/domain pueden importar el cliente Prisma." },
      { group: ["@prisma/client"], message: "INV-01: importa tipos desde @/lib/dto, no desde @prisma/client." },
    ],
  }],
};

export default [
  ...next,
  { files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"], rules: prohibido },
];
```

- [ ] **Step 6: Reescribir `.env.example`**

```
# Supabase — Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Prisma — Dashboard → Project Settings → Database → Connection string
# Runtime usa el pooler (puerto 6543); las migraciones usan la directa (5432).
DATABASE_URL=
DIRECT_URL=
```

- [ ] **Step 7: Verificar y confirmar**

Cuatro cosas que se descubrieron al ejecutar esta tarea y que conviene no volver a descubrir:

1. **pnpm 10.4.1 lee `onlyBuiltDependencies` de `package.json`, no de `pnpm-workspace.yaml`.** Sin eso bloquea los scripts de Prisma y esbuild. Los motores de Prisma 6.19 vienen prebuilt, así que funciona igual, pero el aviso persiste.
2. **`prisma.config.ts` desactiva la carga automática de `.env`.** Hay que importar `dotenv/config` en ese archivo o `DATABASE_URL` llega vacía.
3. **`eslint-config-next` no exporta configuración plana**; hay que envolverlo con `FlatCompat` de `@eslint/eslintrc`.
4. **`react-doctor` necesita el directorio explícito** (`react-doctor .`). Sin el argumento devuelve un error interno silencioso con `projects: []` y código de salida 0, que parece éxito.

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm doctor
git add -A && git commit -m "chore(E0): pnpm, dependencias, vitest, regla de frontera de imports"
```

---

## Task 2: Documentos del proyecto en disco

**Files:**
- Create: `docs/CRM-AVTR-SPEC.md`, `docs/decisiones-pendientes.md`, `supabase/migrations/_archivo_v1/README.md`
- Modify: `CLAUDE.md`, `README.md`
- Move: los 16 `.sql` de `supabase/migrations/` a `supabase/migrations/_archivo_v1/`

**Interfaces:**
- Produces: `docs/CRM-AVTR-SPEC.md`, que el `CLAUDE.md` referencia y que toda tarea posterior cita por sección.

- [ ] **Step 1: Escribir el spec v2.0 en disco**

`docs/CRM-AVTR-SPEC.md` con el contenido del spec normativo v2.0, en UTF-8 limpio. Aplicar D-A al escribirlo: marcar INV-08 y AC-19 como «sin efecto bajo monomoneda», eliminar `ExchangeRate` y `frozenExchangeRate` del §6.2, y quitar las dimensiones de país y moneda de `PriceListEntry`. **No renumerar ningún código** — §0.4 los declara estables y citables.

- [ ] **Step 2: Reemplazar CLAUDE.md**

El de disco es la generación anterior (Supabase sin Prisma, esquema en español). Reemplazar por el contrato de trabajo v2.0, agregando: la decisión de monomoneda (D-A) como nota junto a INV-04, y `pnpm doctor` en la sección de comandos.

- [ ] **Step 3: Archivar las migraciones anteriores**

```bash
mkdir -p supabase/migrations/_archivo_v1
git mv supabase/migrations/*.sql supabase/migrations/_archivo_v1/
```

`supabase/migrations/_archivo_v1/README.md` explica: nunca se aplicaron al proyecto remoto; divergen del spec v2.0 en moneda, idioma de identificadores, roles, catálogos y MEDDIC; y **conserva la lista de los cinco defectos** de §1.1 del diseño, para que no reaparezcan.

- [ ] **Step 4: Escribir `docs/decisiones-pendientes.md`**

Tabla con las diez preguntas Q-01 a Q-10, el valor asumido, dónde vive ese valor y qué lo cambiaría. Más las divergencias de §8 del diseño: siete roles contra cinco, Prospectos fuera de alcance, crédito compartido en Fase 2, y el estatus `cancelada` eliminado por RN-12. Más las dos cifras del seed que se ajustaron: banderas de riesgo y escala de cuotas.

- [ ] **Step 5: Actualizar README.md**

Arranque con `pnpm`, no con la CLI de Supabase. Estructura de carpetas real. Estado actual honesto.

- [ ] **Step 6: Confirmar**

```bash
git add -A && git commit -m "docs(E0): spec v2.0 en disco, CLAUDE.md actualizado, migraciones v1 archivadas"
```

---

## Task 3: Esquema Prisma completo

**Files:**
- Create: `prisma/schema.prisma`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: los 32 modelos y 16 enums que todo el resto del plan consume. Nombres exactos de modelo en `PascalCase` singular; nombres de tabla en `snake_case` plural vía `@map`.

- [ ] **Step 1: Escribir el schema**

Base: §6.2 del spec, con D-A aplicada. Los cambios respecto al spec, ya justificados en §4.2 del diseño:

- `enum Currency { USD }` — un solo valor; las columnas `currency` se conservan en `Opportunity`, `Quote`, `Pipeline` y `Objective`.
- Sin modelo `ExchangeRate`. Sin `Opportunity.frozenExchangeRate`.
- `PriceListEntry` sin `countryCode` ni `currency`; `@@unique([productId, validFrom])`.
- Modelo nuevo `FolioCounter`:

```prisma
/// RN-20 · consecutivo por año. Se opera con UPDATE … RETURNING dentro de la
/// transacción de alta. NUNCA con count()+1: dos altas simultáneas colisionan.
model FolioCounter {
  year       Int @id
  lastNumber Int @default(0) @map("last_number")
  @@map("folio_counters")
}
```

- `Person` necesita la relación inversa que el spec omite: `meddicAssessments MeddicComponentAssessment[]`.
- `Stage` necesita `opportunities Opportunity[]` y `transitions` no se relaciona (se consulta por id).

- [ ] **Step 2: Validar y formatear**

```bash
pnpm prisma format
pnpm prisma validate
```

Esperado: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 3: Generar el cliente**

```bash
pnpm db:generate
```

No requiere conexión a la base.

- [ ] **Step 4: Prueba de que el esquema cubre lo que el spec exige**

`tests/schema.test.ts` — lee `schema.prisma` como texto y afirma los invariantes que un error de dedo rompería en silencio:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("schema.prisma", () => {
  it("no reintroduce multimoneda (D-A)", () => {
    expect(schema).not.toMatch(/model ExchangeRate/);
    expect(schema).not.toMatch(/frozenExchangeRate/);
    expect(schema).toMatch(/enum Currency\s*\{\s*USD\s*\}/);
  });

  it("las etapas son datos, no enum (INV-13)", () => {
    expect(schema).not.toMatch(/enum Stage\b/);
    expect(schema).toMatch(/model Stage \{/);
  });

  it("todo importe es Decimal(18,4) (INV-03)", () => {
    const decimales = schema.match(/@db\.Decimal\(18,\s*4\)/g) ?? [];
    expect(decimales.length).toBeGreaterThan(15);
    expect(schema).not.toMatch(/amount\s+Float/);
  });

  it("las entidades de negocio tienen borrado lógico (INV-15)", () => {
    for (const modelo of ["Organization", "Person", "Opportunity", "Activity", "User"]) {
      const bloque = schema.split(`model ${modelo} {`)[1].split("\n}")[0];
      expect(bloque, `${modelo} sin deletedAt`).toMatch(/deletedAt/);
    }
  });

  it("el folio tiene contador por año (RN-20)", () => {
    expect(schema).toMatch(/model FolioCounter/);
  });
});
```

- [ ] **Step 5: Correr la prueba**

```bash
pnpm test tests/schema.test.ts
```

Esperado: 5 pruebas en verde.

- [ ] **Step 6: Confirmar**

```bash
git add -A && git commit -m "feat(E0): esquema Prisma completo con monomoneda USD"
```

---

## Task 4: Aplicar el esquema a Supabase con RLS de respaldo

**Files:**
- Create: `supabase/migrations/20260901120000_init_crm_avtr.sql`

**Nota de la Task 1:** `react-doctor` trae la regla `supabase-table-missing-rls`, que exige habilitar RLS **en la misma migración que crea la tabla**, no en un archivo posterior. Es una regla mejor que la del esquema anterior, que separaba ambas cosas y por eso dejó once tablas descubiertas. El RLS va al final de este mismo archivo, no en una migración aparte.

**Interfaces:**
- Consumes: `prisma/schema.prisma` de la Task 3.
- Produces: la base aplicada, contra la que corren el seed y todas las pruebas de integración.

- [ ] **Step 1: Generar el SQL desde el schema**

```bash
pnpm db:diff > supabase/migrations/20260901120000_init_crm_avtr.sql
```

Funciona sin conexión. Revisar el archivo antes de aplicarlo.

- [ ] **Step 2: Anteponer las extensiones**

Al inicio del archivo generado:

```sql
create extension if not exists "citext";
create extension if not exists "pg_trgm";   -- §9.2 · búsqueda libre por trigram
```

- [ ] **Step 3: Anexar el RLS de respaldo al mismo archivo**

Habilita RLS en **todas** las tablas de `public` sin crear ninguna política, que en Supabase equivale a deny-all para `anon` y `authenticated`. Prisma entra con su propio rol y no queda sujeto.

Va al final del archivo de init, no en una migración aparte: separarlos es lo que dejó once tablas descubiertas en el esquema anterior, y es lo que `react-doctor/supabase-table-missing-rls` marca como error.

```sql
-- Respaldo, no autorización. La autorización vive en lib/scope (INV-01),
-- porque RLS filtra filas y el invariante crítico (INV-02) es de columnas.
-- El esquema anterior dejó once tablas sin habilitar; esto no depende de una
-- lista escrita a mano.
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;
```

- [ ] **Step 4: Aplicar y verificar**

Aplicar con `mcp__supabase__apply_migration`, nombre `init_crm_avtr`, luego:
- `mcp__supabase__list_tables` sobre `public` → 32 tablas, todas con `rls_enabled: true`.
- `mcp__supabase__get_advisors` tipo `security` → sin hallazgos de RLS faltante.
- `pnpm doctor` → los 28 hallazgos de `supabase-table-missing-rls` en cero.

- [ ] **Step 5: Confirmar**

```bash
git add -A && git commit -m "feat(E0): esquema aplicado a Supabase con RLS deny-all en todas las tablas"
```

---

## Task 5: `lib/money`

**Files:**
- Create: `lib/money/index.ts`
- Test: `lib/money/money.test.ts`

**Interfaces:**
- Produces:
  - `type Money = Prisma.Decimal`
  - `money(v: string | number | Prisma.Decimal): Money`
  - `toClient(v: Money): string` — serialización a string, nunca a `number` (INV-03)
  - `formatUSD(v: string | Money): string` — `"$324,000.00"`
  - `formatPercent(fraction: string | Money): string` — `0.4136` → `"41.4 %"`
  - `sum(values: Money[]): Money`

- [ ] **Step 1: Escribir la prueba primero**

```ts
import { describe, expect, it } from "vitest";
import { formatPercent, formatUSD, money, sum, toClient } from "./index";

describe("lib/money", () => {
  it("no pierde precisión donde un float la perdería (INV-03)", () => {
    expect(toClient(sum([money("0.1"), money("0.2")]))).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3); // por contraste
  });

  it("serializa a string, nunca a number", () => {
    expect(typeof toClient(money("324000"))).toBe("string");
  });

  it("formatea USD con dos decimales y separador de miles", () => {
    expect(formatUSD("324000")).toBe("$324,000.00");
  });

  it("formatea la fracción como porcentaje con un decimal (RN-07)", () => {
    expect(formatPercent("0.4136")).toBe("41.4 %");
    expect(formatPercent("0.15")).toBe("15.0 %");
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm test lib/money
```

Esperado: FAIL, `Cannot find module './index'`.

- [ ] **Step 3: Implementar**

`Prisma.Decimal` es `decimal.js`; no agregar otra dependencia. `formatUSD` usa `Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" })` y se verifica contra la salida esperada, ajustando si el runtime difiere.

- [ ] **Step 4: Correr y ver pasar**

```bash
pnpm test lib/money
```

- [ ] **Step 5: Confirmar**

```bash
git add -A && git commit -m "feat(E0): lib/money con Decimal y serialización a string (INV-03)"
```

---

## Task 6: `lib/policy`

**Files:**
- Create: `lib/db.ts`, `lib/policy/index.ts`
- Test: `lib/policy/policy.test.ts`

**Interfaces:**
- Produces:
  - `getCountry(code: CountryCode): Promise<Country>`
  - `getCommercialPolicy(code: CountryCode): Promise<CommercialPolicy>`
  - Ambas envueltas en `React.cache`: una lectura por request, no una por llamada.

- [ ] **Step 1: `lib/db.ts` — el singleton**

```ts
import { PrismaClient } from "@prisma/client";

// INV-01 · Este módulo solo puede importarse desde lib/scope y lib/domain.
// La regla se aplica en eslint.config.mjs y se prueba en tests/arquitectura.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Prueba de que ningún umbral está en el código (AC-31)**

```ts
import { describe, expect, it } from "vitest";
import { getCommercialPolicy } from "./index";

describe("lib/policy", () => {
  it("lee los umbrales de la base, no de constantes (INV-05)", async () => {
    const politica = await getCommercialPolicy("MX");
    expect(politica.marginFloor.toString()).toBe("0.2");
    expect(politica.discountThresholdMgmt.toString()).toBe("0.15");
    expect(politica.meddicMinToWin).toBe(80);
  });
});
```

Esta prueba necesita la base sembrada. Se ejecuta después de la Task 12; hasta entonces se marca con `it.skip` y se activa ahí.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Confirmar**

```bash
git add -A && git commit -m "feat(E0): lib/db y lib/policy leyendo umbrales de la base (INV-05)"
```

---

## Task 7: `lib/auth` — sesión y permisos

**Files:**
- Create: `lib/supabase/server.ts` (reescribir), `lib/supabase/client.ts`, `lib/auth/session.ts`, `lib/auth/permissions.ts`, `middleware.ts`
- Test: `lib/auth/permissions.test.ts`

**Interfaces:**
- Produces:
  - `type Session = { userId: string; role: Role; countryCodes: CountryCode[]; permissions: Set<string>; limits: Record<string, string | null> }`
  - `getSession(): Promise<Session | null>` — envuelta en `React.cache`
  - `requireSession(): Promise<Session>` — redirige a `/login` si no hay
  - `can(session: Session, code: string): boolean`
  - `limitFor(session: Session, code: string): Money | null` — p. ej. autorizar hasta `0.30`

- [ ] **Step 1: Prueba de `can` y `limitFor`**

```ts
import { describe, expect, it } from "vitest";
import { can, limitFor } from "./permissions";

const gerente = {
  userId: "u1", role: "GERENTE_PAIS" as const, countryCodes: ["MX" as const],
  permissions: new Set(["VER_COSTO", "AUTORIZAR_DESCUENTO"]),
  limits: { AUTORIZAR_DESCUENTO: "0.30" },
};
const vendedor = {
  userId: "u2", role: "VENDEDOR" as const, countryCodes: ["MX" as const],
  permissions: new Set(["VER_MARGEN"]), limits: {},
};

describe("permisos", () => {
  it("el vendedor ve margen pero no costo (RN-09)", () => {
    expect(can(vendedor, "VER_MARGEN")).toBe(true);
    expect(can(vendedor, "VER_COSTO")).toBe(false);
  });

  it("el gerente autoriza hasta su límite (RN-04)", () => {
    expect(limitFor(gerente, "AUTORIZAR_DESCUENTO")?.toString()).toBe("0.3");
    expect(limitFor(vendedor, "AUTORIZAR_DESCUENTO")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

- [ ] **Step 3: Implementar sesión, permisos y middleware**

`getSession()` lee el usuario de Supabase Auth, carga el perfil de `public.users` por `entraObjectId` vía Prisma, y arma `Session` con los permisos de `RolePermission`. Un usuario autenticado **sin fila en `public.users`** devuelve `null` con una causa distinguible: la ruta `/sin-acceso` explica que el alta es administrativa.

`middleware.ts` sigue el patrón de `@supabase/ssr`: refresca la sesión en cada request y protege el grupo `(app)`.

- [ ] **Step 4: Correr y ver pasar**

- [ ] **Step 5: Confirmar**

```bash
git add -A && git commit -m "feat(E0): sesión con Entra ID, permisos como datos, middleware"
```

---

## Task 8: `lib/scope` — el alcance por rol

**Files:**
- Create: `lib/scope/opportunities.ts`, `lib/scope/organizations.ts`, `lib/scope/activities.ts`, `lib/scope/objectives.ts`, `lib/scope/selectors.ts`, `lib/scope/index.ts`
- Test: `lib/scope/scope.test.ts`

**Interfaces:**
- Consumes: `Session` de la Task 7; `prisma` de `lib/db`.
- Produces:
  - `opportunityScope(session): Prisma.OpportunityWhereInput` — puro, la firma literal de §5.3
  - `organizationScope`, `activityScope`, `objectiveScope` — equivalentes
  - `listOpportunities(session, where?)`, `getOpportunity(session, id)` — las únicas que `app/**` recibe
  - `quoteLineSelect(session): Prisma.QuoteLineSelect` — **sin** `unitCost` si falta `VER_COSTO` (INV-02)

- [ ] **Step 1: Prueba del alcance puro (AC-01, AC-05)**

```ts
import { describe, expect, it } from "vitest";
import { opportunityScope } from "./opportunities";

const base = { permissions: new Set<string>(), limits: {} };
const vendedor = { ...base, userId: "u2", role: "VENDEDOR" as const, countryCodes: ["MX" as const] };
const gerenteMx = { ...base, userId: "u1", role: "GERENTE_PAIS" as const, countryCodes: ["MX" as const] };
const direccion = { ...base, userId: "u0", role: "DIRECCION" as const, countryCodes: ["MX","CO","CL"] as const };

describe("opportunityScope", () => {
  it("el vendedor solo ve donde es propietario, no donde es creador (RN-31)", () => {
    const s = opportunityScope(vendedor);
    expect(s).toEqual({ deletedAt: null, ownerId: "u2" });
    expect(JSON.stringify(s)).not.toContain("createdById");
  });

  it("el gerente ve su país y solo el suyo (AC-05)", () => {
    expect(opportunityScope(gerenteMx)).toEqual({ deletedAt: null, countryCode: { in: ["MX"] } });
  });

  it("dirección ve todo, pero nunca lo borrado (INV-15)", () => {
    expect(opportunityScope(direccion)).toEqual({ deletedAt: null });
  });
});
```

- [ ] **Step 2: Prueba del selector de costo (AC-03, INV-02)**

```ts
import { quoteLineSelect } from "./selectors";

it("no serializa el costo sin permiso (INV-02)", () => {
  const conCosto = quoteLineSelect({ ...vendedor, permissions: new Set(["VER_COSTO"]) });
  const sinCosto = quoteLineSelect(vendedor);
  expect(conCosto).toHaveProperty("unitCost", true);
  expect(sinCosto).not.toHaveProperty("unitCost");
  expect(Object.keys(sinCosto)).not.toContain("unitCost");
});
```

- [ ] **Step 3: Correr y ver fallar**

- [ ] **Step 4: Implementar**

`opportunityScope` es el `switch` de §5.3, sin cambios. `listOpportunities` compone `{ AND: [opportunityScope(session), where] }` — el alcance **siempre** primero.

- [ ] **Step 5: Correr y ver pasar**

- [ ] **Step 6: Confirmar**

```bash
git add -A && git commit -m "feat(E0): lib/scope con alcance por rol y selectores por permiso (INV-01, INV-02)"
```

---

## Task 9: `lib/audit`

**Files:**
- Create: `lib/audit/index.ts`
- Test: `lib/audit/audit.test.ts`

**Interfaces:**
- Produces: `writeAudit(tx: Prisma.TransactionClient, entry: { entity: string; entityId: string; action: string; byUserId: string; before?: unknown; after?: unknown }): Promise<void>`

La firma exige `tx` como primer argumento. Es la garantía estructural de INV-09: no existe forma de escribir la bitácora fuera de una transacción.

- [ ] **Step 1: Prueba de que la operación se revierte si el log falla (AC-33)**

```ts
it("si la bitácora falla, la operación completa se revierte (INV-09)", async () => {
  const antes = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });

  await expect(
    prisma.$transaction(async (tx) => {
      await tx.opportunity.update({ where: { id }, data: { ownerId: "otro" } });
      await writeAudit(tx, { entity: "Opportunity", entityId: id, action: "CAMBIAR_PROPIETARIO", byUserId: "usuario-inexistente" }); // viola la FK a users → revienta la transacción
    }),
  ).rejects.toThrow();

  const despues = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
  expect(despues.ownerId).toBe(antes.ownerId);
});
```

- [ ] **Step 2: Correr, implementar, correr**

- [ ] **Step 3: Confirmar**

```bash
git add -A && git commit -m "feat(E0): writeAudit exige el cliente de transacción (INV-09)"
```

---

## Task 10: `lib/domain` — reglas puras

**Files:**
- Create: `lib/domain/pipeline.ts`, `lib/domain/riskFlags.ts`, `lib/domain/meddic.ts`, `lib/domain/stageGate.ts`, `lib/domain/folio.ts`
- Test: un `.test.ts` junto a cada uno

**Interfaces:**
- Produces:
  - `weightedAmount(amount: Money, probability: Money): Money` — RN-01
  - `computeRiskFlags(o, stage, policy, now): RiskFlag[]` donde `RiskFlag = "SIN_ACTIVIDAD" | "ESTANCADA" | "MARGEN_BAJO"` — RN-13, INV-11
  - `computeMeddicScore(assessments, weights): number` — §7.2
  - `evaluateGate(requirements: GateRequirement[], ctx: GateContext): GateResult` — RN-02
  - `nextFolio(tx, year): Promise<string>` — RN-20

- [ ] **Step 1: Prueba de las banderas de riesgo (INV-11)**

Es la que atrapa el error del seed §15: con `marginFloor = 0.20`, un margen de `0.19` **es** bandera.

```ts
it("marca margen bajo cuando el margen queda debajo del piso (RN-05)", () => {
  const banderas = computeRiskFlags(
    { grossMargin: money("0.19"), lastActivityAt: hoy, nextActivityAt: manana, stageEnteredAt: hoy },
    { staleAfterDays: 21 }, { marginFloor: money("0.20") }, hoy,
  );
  expect(banderas).toContain("MARGEN_BAJO");
});

it("no marca margen bajo justo en el piso", () => {
  const banderas = computeRiskFlags(
    { grossMargin: money("0.20"), lastActivityAt: hoy, nextActivityAt: manana, stageEnteredAt: hoy },
    { staleAfterDays: 21 }, { marginFloor: money("0.20") }, hoy,
  );
  expect(banderas).not.toContain("MARGEN_BAJO");
});
```

- [ ] **Step 2: Prueba del puntaje MEDDIC (§7.2, AC-17)**

```ts
it("los seis confirmados dan 100", () => {
  expect(computeMeddicScore(todosConfirmados, pesosPorOmision)).toBe(100);
});

it("cambiar los pesos cambia el puntaje sin desplegar código (AC-17)", () => {
  expect(computeMeddicScore(soloDecisorConfirmado, { ...pesos, DECISOR_ECONOMICO: 50 })).toBeGreaterThan(
    computeMeddicScore(soloDecisorConfirmado, pesosPorOmision),
  );
});
```

- [ ] **Step 3: Prueba del ponderado (RN-01)**

```ts
it("el ponderado es importe por probabilidad de etapa, y MEDDIC no lo altera (RN-01)", () => {
  expect(toClient(weightedAmount(money("2850000"), money("0.75")))).toBe("2137500");
});
```

- [ ] **Step 4: Prueba del folio (RN-20)**

```ts
it("el consecutivo es por año y no se deriva de count()", async () => {
  const a = await prisma.$transaction((tx) => nextFolio(tx, 2026));
  const b = await prisma.$transaction((tx) => nextFolio(tx, 2026));
  expect(a).toMatch(/^OPP-2026-\d{5}$/);
  expect(b).not.toBe(a);
  const c = await prisma.$transaction((tx) => nextFolio(tx, 2027));
  expect(c).toBe("OPP-2027-00001");
});
```

- [ ] **Step 5: Prueba del evaluador de compuertas (RN-02, INV-13)**

Nueve tipos de requisito, evaluador genérico, **sin `switch` por nombre de etapa**. El mensaje de error nombra el requisito que falta, nunca un «no se puede» genérico.

- [ ] **Step 6: Implementar cada uno, correr, confirmar**

```bash
pnpm test lib/domain
git add -A && git commit -m "feat(E0): reglas puras de dominio con pruebas unitarias"
```

---

## Task 11: `lib/filters`

**Files:**
- Create: `lib/filters/define.ts`, `lib/filters/dates.ts`, `lib/filters/opportunities.ts`
- Test: `lib/filters/filters.test.ts`

**Interfaces:**
- Produces:
  - `parseFilters(searchParams: URLSearchParams, session: Session): ParsedFilters`
  - `toWhere(parsed: ParsedFilters, session: Session): Prisma.OpportunityWhereInput`
  - `resolvePeriod(preset: DatePreset, fiscalYearStartMonth: number, now: Date): { from: Date; to: Date }`
  - `buildClauses` **no se exporta** — es lo que impide que un filtro se anteponga al alcance.

- [ ] **Step 1: Prueba de que un filtro nunca amplía el alcance (AC-25)**

```ts
it("un vendedor que pide otro propietario obtiene cero, no los del otro (AC-25)", () => {
  const where = toWhere(parseFilters(new URLSearchParams("owner=otro-id"), vendedor), vendedor);
  expect(where.AND[0]).toEqual({ deletedAt: null, ownerId: "u2" });
  expect(JSON.stringify(where)).toContain('"ownerId":"u2"');
});
```

- [ ] **Step 2: Prueba de que `dateField` nunca queda implícito (AC-23)**

```ts
it("un rango sin dateField usa CIERRE_ESTIMADO y lo hace explícito (AC-23)", () => {
  const p = parseFilters(new URLSearchParams("from=2026-07-01&to=2026-09-30"), gerenteMx);
  expect(p.dateField).toBe("CIERRE_ESTIMADO");
  expect(p.explícitos).toContain("dateField");
});
```

- [ ] **Step 3: Prueba de que el filtro de vendedor se oculta al rol VENDEDOR (AC-24)**

- [ ] **Step 4: Prueba de que `ESTE_TRIMESTRE` resuelve contra el año fiscal (AC-26)**

```ts
it("ESTE_TRIMESTRE resuelve contra el año fiscal configurado (AC-26)", () => {
  const { from, to } = resolvePeriod("ESTE_TRIMESTRE", 1, new Date("2026-09-01"));
  expect(from.toISOString().slice(0, 10)).toBe("2026-07-01");
  expect(to.toISOString().slice(0, 10)).toBe("2026-09-30");
});
```

- [ ] **Step 5: Correr, implementar, correr, confirmar**

```bash
git add -A && git commit -m "feat(E0): subsistema de filtros con alcance antes que filtro (INV-10, AC-22 a AC-26)"
```

---

## Task 12: Seed

**Files:**
- Create: `prisma/seed.ts`, `prisma/seed/catalogos.ts`, `prisma/seed/paises.ts`, `prisma/seed/usuarios.ts`, `prisma/seed/pipelines.ts`, `prisma/seed/organizaciones.ts`, `prisma/seed/productos.ts`, `prisma/seed/oportunidades.ts`, `prisma/seed/meddic.ts`, `prisma/seed/objetivos.ts`
- Test: `prisma/seed/seed.test.ts`

**Interfaces:**
- Consumes: todos los modelos de la Task 3, `computeRiskFlags` y `weightedAmount` de la Task 10.
- Produces: la base poblada contra la que corren las pruebas de las Tasks 6, 9, 10 y 16, y toda E1.

- [ ] **Step 1: Sembrar países, política y catálogos**

MX (IVA 0.16), CO (0.19), CL (0.19) — Q-04 asumido. Política MX: `marginFloor 0.20`, `lineMarginFloor 0.10`, `discountThresholdMgmt 0.15`, `discountThresholdDir 0.30`, `approvalSlaHours 24`, MEDDIC 70/80/70, `healthyCoverageMin 3.00`. Catálogos de §15: 13 tipos de actividad, 9 de documento (`isContract` en Contrato y Orden de compra), 8 motivos de pérdida (`requiresCompetitor` en «Competidor»), 7 roles de comité.

- [ ] **Step 2: Sembrar la matriz de permisos**

Las once filas de §5.2 como `Permission` + `RolePermission`, con `limitValue = 0.30` en `AUTORIZAR_DESCUENTO` para `GERENTE_PAIS`.

- [ ] **Step 3: Sembrar usuarios, pipelines, organizaciones, personas y productos**

Los de §15, literales. Cuatro pipelines con las cinco etapas de §8.3 y sus `gateRequires`, `staleAfterDays` y `gateMode = ADVERTENCIA`.

- [ ] **Step 4: Sembrar las 14 oportunidades de §15**

Con sus folios, etapas, importes, márgenes, fechas y propietarios. Los folios se siembran literales para reproducir el prototipo; `FolioCounter` se deja en el último número usado por año para que la siguiente alta continúe la serie.

- [ ] **Step 5: Sembrar MEDDIC**

OPP-2026-00417 en 84 con los seis componentes trabajados; OPP-2026-00388 en 62; las de Calificación entre 0 y 20. `DECISOR_ECONOMICO` y `CAMPEON` ligados a `Person` reales de Aceros del Norte.

- [ ] **Step 6: Sembrar objetivos con las cuotas reescaladas**

Las de §7 del diseño. Los cuatro trimestres y el anual por vendedor; para cuatro la suma cuadra, para Valeria Domínguez **no**, deliberadamente, para que AC-30 tenga un caso.

- [ ] **Step 7: Escribir los agregados que la prueba verifica**

`prisma/seed/verificacion.ts`. No son código de seed: son las dos agregaciones que el seed promete y que E1 va a reutilizar en los indicadores de encabezado de P-01.

```ts
import { money, sum, type Money } from "@/lib/money";
import { computeRiskFlags, type RiskFlag } from "@/lib/domain/riskFlags";
import { weightedAmount } from "@/lib/domain/pipeline";
import { getCommercialPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";

export type ResumenRiesgo = { banderas: number; oportunidades: number; monto: Money };

export async function resumenDeRiesgo(pais: "MX" | "CO" | "CL", ahora = new Date()): Promise<ResumenRiesgo> {
  const politica = await getCommercialPolicy(pais);
  const abiertas = await prisma.opportunity.findMany({
    where: { status: "ABIERTA", deletedAt: null, countryCode: pais },
    select: {
      amount: true, grossMargin: true, stageEnteredAt: true,
      lastActivityAt: true, nextActivityAt: true,
      stage: { select: { staleAfterDays: true } },
    },
  });

  let banderas = 0;
  const enRiesgo: Money[] = [];
  for (const o of abiertas) {
    const flags: RiskFlag[] = computeRiskFlags(o, o.stage, politica, ahora);
    if (flags.length > 0) { banderas += flags.length; enRiesgo.push(o.amount); }
  }
  return { banderas, oportunidades: enRiesgo.length, monto: sum(enRiesgo) };
}

/** Cobertura = pipeline abierto que cierra en el periodo ÷ brecha pendiente de cuota (RN-25). */
export async function coberturaEquipo(
  pais: "MX" | "CO" | "CL", anio: number, trimestre: number,
): Promise<number> {
  const from = new Date(Date.UTC(anio, (trimestre - 1) * 3, 1));
  const to = new Date(Date.UTC(anio, trimestre * 3, 0));

  const abiertas = await prisma.opportunity.findMany({
    where: {
      status: "ABIERTA", deletedAt: null, countryCode: pais,
      expectedCloseDate: { gte: from, lte: to },   // cobertura con CIERRE_ESTIMADO (§10.2)
    },
    select: { amount: true },
  });

  const cuotas = await prisma.objective.findMany({
    where: { countryCode: pais, fiscalYear: anio, periodType: "TRIMESTRAL", quarter: trimestre },
    select: { revenueQuota: true },
  });

  const ganadas = await prisma.opportunity.findMany({
    where: {
      status: "GANADA", deletedAt: null, countryCode: pais,
      actualCloseDate: { gte: from, lte: to },     // avance con CIERRE_REAL (§10.2)
    },
    select: { amount: true },
  });

  const brecha = sum(cuotas.map((c) => c.revenueQuota)).minus(sum(ganadas.map((g) => g.amount)));
  if (brecha.lte(0)) return Infinity;
  return sum(abiertas.map((o) => o.amount)).div(brecha).toNumber();
}
```

- [ ] **Step 8: Prueba que verifica el seed contra §15**

`prisma/seed/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sum, toClient } from "@/lib/money";
import { weightedAmount } from "@/lib/domain/pipeline";
import { coberturaEquipo, resumenDeRiesgo } from "./verificacion";

describe("seed §15", () => {
  it("reproduce los dos totales que el spec declara correctos", async () => {
    const abiertas = await prisma.opportunity.findMany({
      where: { status: "ABIERTA", deletedAt: null, countryCode: "MX" },
      select: { amount: true, stage: { select: { probability: true } } },
    });

    expect(toClient(sum(abiertas.map((o) => o.amount)))).toBe("12621000");
    expect(toClient(sum(abiertas.map((o) => weightedAmount(o.amount, o.stage.probability))))).toBe("7362350");
  });

  it("las banderas calculadas dan 7 sobre 6 oportunidades, no las 5 declaradas (INV-11)", async () => {
    const { banderas, oportunidades, monto } = await resumenDeRiesgo("MX", new Date("2026-09-01"));
    expect(banderas).toBe(7);
    expect(oportunidades).toBe(6);
    expect(toClient(monto)).toBe("3943000");
  });

  it("la cobertura del equipo cae en la banda sana tras reescalar las cuotas (§7 del diseño)", async () => {
    expect(await coberturaEquipo("MX", 2026, 3)).toBeCloseTo(3.02, 2);
  });
});
```

- [ ] **Step 9: Correr el seed y las pruebas**

```bash
pnpm db:seed && pnpm test prisma/seed
```

- [ ] **Step 10: Activar las pruebas que esperaban base sembrada**

Quitar `it.skip` en `lib/policy/policy.test.ts` (Task 6), `lib/audit/audit.test.ts` (Task 9) y las de folio de la Task 10. Correr `pnpm test` completo.

- [ ] **Step 11: Confirmar**

```bash
git add -A && git commit -m "feat(E0): seed del escenario §15 con los tres totales verificados"
```

---

## Task 13: Sistema de diseño

**Files:**
- Modify: `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`
- Create: `lib/cn.ts`

**Interfaces:**
- Produces: las variables CSS de §13 y el tema de Tailwind que mapea a ellas; `cn()` para componer clases.

- [ ] **Step 1: Copiar los tokens textualmente**

Los tres bloques de §13.1, §13.2 y §13.3 tal cual, sin sustituir por la paleta por omisión de ninguna librería.

- [ ] **Step 2: Mapear el tema de Tailwind a las variables**

`colors.accent` → `var(--accent)`, etc. Se mapea, no se duplica: el manual gráfico sigue siendo la fuente.

- [ ] **Step 3: Fuentes**

Montserrat por `next/font/google`. Clash Display es de Fontshare; se carga por `next/font/local` si el archivo está disponible y si no cae a Montserrat, que es lo que la pila de respaldo de §13.2 ya declara.

- [ ] **Step 4: Utilidad de cifras**

```css
.tabular { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Verificar y confirmar**

```bash
pnpm lint && pnpm doctor
git add -A && git commit -m "feat(E0): sistema de diseño con los tokens del manual gráfico (§13)"
```

---

## Task 14: Primitivas de `components/ui`

**Files:**
- Create: un archivo por primitiva en `components/ui/`

**Interfaces:**
- Consumes: `parseFilters`, `toWhere` y la definición de filtros de la Task 11.
- Produces: `Button`, `Input`, `NumberInput`, `Select`, `MultiSelect`, `DatePicker`, `DateRangePicker`, `Chip`, `Table`, `Card`, `StatTile`, `SegmentedControl`, `Tabs`, `Modal`, `Drawer`, `Toast`, `EmptyState`, `ProgressBar`, `Avatar`, `Tooltip`, `PermissionGate`, **`FilterBar`**, **`SavedViewPills`**.

`FilterBar` es parte de E0 por §17, no de E1: es genérico, cada pantalla le declara qué filtros ofrece, y sin él las pantallas de E1 no tienen de dónde colgar la barra.

- [ ] **Step 1: Construirlas accesibles por teclado y con foco visible**

`Table` ordenable, cifras a la derecha, encabezado fijo. `StatTile` con etiqueta, cifra grande, subtexto y color semántico. `EmptyState` **obligatoriamente** recibe una acción siguiente: la firma no permite construir un estado vacío mudo.

- [ ] **Step 2: `FilterBar` y `SavedViewPills`**

`FilterBar` recibe una definición de filtros y los `searchParams` actuales, y escribe de vuelta a la URL con `router.replace` — el estado vive en la URL, nunca en `useState` (INV-10). Los filtros con `hiddenFor` que incluya el rol de la sesión **no se renderizan**: para el rol `VENDEDOR`, el filtro «Vendedor» no existe en el DOM, no está deshabilitado (AC-24).

Cuando hay rango de fechas, el selector de `dateField` se muestra siempre, incluso con el valor por omisión, porque AC-23 exige que no quede implícito.

`SavedViewPills` lista las `SavedView` del usuario para la pantalla actual y marca la predeterminada.

- [ ] **Step 3: `PermissionGate` con la advertencia en el propio archivo**

```tsx
/**
 * Azúcar de presentación. NUNCA sustituye a INV-01 ni a INV-02:
 * si un PermissionGate es lo único que impide ver un dato, el dato ya viajó.
 */
```

- [ ] **Step 4: Verificar y confirmar**

```bash
pnpm typecheck && pnpm lint && pnpm doctor
git add -A && git commit -m "feat(E0): primitivas del sistema de diseño y FilterBar"
```

---

## Task 15: Pantallas de autenticación

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/callback/route.ts`, `app/(auth)/sin-acceso/page.tsx`, `app/(app)/layout.tsx`
- Modify: `app/page.tsx` (redirige a `/oportunidades`)

- [ ] **Step 1: Login con Entra ID**

Botón único, `signInWithOAuth({ provider: "azure", options: { scopes: "openid profile email", redirectTo } })`.

- [ ] **Step 2: Callback**

`exchangeCodeForSession`, luego redirección a `/oportunidades`. Si el perfil no existe en `public.users`, a `/sin-acceso`.

- [ ] **Step 3: `/sin-acceso`**

Explica que el alta es administrativa y a quién pedirla. No ofrece registro: `enable_signup = false`.

- [ ] **Step 4: Layout de la aplicación**

Barra lateral fija navy (`--navy-900`) con las secciones «Comercial» y «Sistema» de §13.5. Los contadores quedan en cero hasta E1.

- [ ] **Step 5: Verificar y confirmar**

```bash
pnpm typecheck && pnpm lint && pnpm doctor
git add -A && git commit -m "feat(E0): autenticación con Entra ID y layout de la aplicación"
```

---

## Task 16: Pruebas de arquitectura

**Files:**
- Create: `tests/arquitectura/invariantes.test.ts`

- [ ] **Step 1: AC-31 — ningún umbral en `lib/domain`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return archivosTs(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

it("ningún umbral literal en lib/domain (INV-05, AC-31)", () => {
  const ofensores: string[] = [];
  for (const archivo of archivosTs("lib/domain")) {
    const codigo = readFileSync(archivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    if (/(?<![\d.])0\.(20|15|16|30)(?![\d])/.test(codigo)) ofensores.push(archivo);
  }
  expect(ofensores).toEqual([]);
});
```

- [ ] **Step 2: AC-32 — ninguna consulta fuera de `lib/scope`**

```ts
it("app y components no importan el cliente Prisma (INV-01, AC-32)", () => {
  const ofensores: string[] = [];
  for (const dir of ["app", "components"]) {
    for (const archivo of archivosTs(dir)) {
      const codigo = readFileSync(archivo, "utf8");
      if (/from ["'](@\/lib\/db|@prisma\/client)["']/.test(codigo)) ofensores.push(archivo);
      if (/prisma\.\w+\.(findMany|findFirst|findUnique|create|update|delete)/.test(codigo)) ofensores.push(archivo);
    }
  }
  expect(ofensores).toEqual([]);
});
```

- [ ] **Step 3: Correr y confirmar**

```bash
pnpm test tests/arquitectura
git add -A && git commit -m "test(E0): pruebas de arquitectura para AC-31 y AC-32"
```

---

## Task 17: Pruebas de extremo a extremo del alcance

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/alcance.spec.ts`, `tests/e2e/sesion.ts`

**Interfaces:**
- Consumes: el seed de la Task 12; `getSession` de la Task 7.
- Produces: sesiones simuladas por rol, que E1 reutiliza para AC-22 a AC-26.

- [ ] **Step 1: Sesiones simuladas**

Entra ID no está configurado todavía, así que las pruebas inyectan la cookie de sesión de Supabase para un usuario del seed. Queda anotado que cuando lleguen las credenciales hay que agregar una prueba del flujo real.

- [ ] **Step 2: AC-01, AC-02, AC-04, AC-05**

```ts
test("AC-01 · un vendedor solo recibe sus oportunidades, aun manipulando la URL", async ({ page }) => {
  await comoVendedor(page, "paulina");
  await page.goto("/oportunidades?owner=gabriel-id&status=ABIERTA");
  const folios = await page.getByTestId("folio").allInnerTexts();
  expect(folios.length).toBeGreaterThan(0);
  for (const folio of folios) expect(FOLIOS_DE_PAULINA).toContain(folio);
});

test("AC-02 · un vendedor recibe 403 en análisis, no una pantalla vacía", async ({ page }) => {
  await comoVendedor(page, "paulina");
  const res = await page.goto("/analisis");
  expect(res?.status()).toBe(403);
});
```

- [ ] **Step 3: Correr y confirmar**

```bash
pnpm test:e2e
git add -A && git commit -m "test(E0): pruebas de extremo a extremo del alcance (AC-01 a AC-05)"
```

---

## Cierre de E0

Antes de pasar a E1:

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm doctor` en verde
- [ ] `mcp__supabase__get_advisors` de seguridad y de rendimiento sin hallazgos
- [ ] Los tres totales del seed verificados por prueba, no a ojo
- [ ] `docs/decisiones-pendientes.md` completo, con las diez preguntas y las cinco divergencias
