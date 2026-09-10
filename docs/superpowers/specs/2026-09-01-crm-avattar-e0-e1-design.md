---
proyecto: CRM Avattar (CRM AVTR)
documento: Diseño de construcción · incrementos E0 y E1
fecha: 2026-09-01
estado: aprobado para plan de implementación
deriva de: docs/CRM-AVTR-SPEC.md v2.0
---

# CRM Avattar · Diseño de E0 y E1

Este documento traduce el spec normativo v2.0 a decisiones de construcción, reconciliándolo
con lo que ya existía en el repositorio y con seis decisiones tomadas con el responsable del
proyecto el 1 de septiembre de 2026.

No sustituye al spec. El spec sigue siendo el contrato de **qué** se construye y **por qué**;
este documento fija el **cómo**, y registra en qué puntos el spec cambia por decisión de
negocio posterior.

---

## 1. Punto de partida real

Antes de diseñar nada se verificó el estado del proyecto. Tres hechos cambian el plan:

**El proyecto Supabase remoto está vacío.** `cjwahoscedjnjgalmyzu` tiene cero tablas en
`public`, cero migraciones registradas y cero usuarios en `auth.users`. Las 16 migraciones de
`supabase/migrations/` nunca se aplicaron ahí. La instrucción del spec §6.2 —«genera
migraciones incrementales en lugar de recrear la base»— se escribió suponiendo una base
poblada. No la hay: no existe dato que preservar.

**Extensiones.** `pgcrypto`, `uuid-ossp` y `pg_stat_statements` instaladas. `citext` y
`pg_trgm` disponibles pero **no** instaladas; §9.2 pide índice trigram para la búsqueda libre.

**El repositorio traía la generación anterior de documentos.** El `CLAUDE.md` en disco
describe un stack Supabase-sin-Prisma y un esquema monomoneda en español; el `CLAUDE.md`
entregado con el spec v2.0 describe Prisma, quince invariantes y MEDDIC. Y
`docs/CRM-AVTR-SPEC.md`, al que ese archivo apunta, no existía en disco.

### 1.1 Defectos encontrados en el esquema anterior

Se registran porque explican por qué se reemplaza en lugar de migrarse, y porque dos de ellos
son errores de seguridad que no deben reaparecer en el esquema nuevo.

1. **La vista «sin costo» revela el costo.** `v_cotizacion_lineas_sin_costo` expone `importe`
   y `utilidad`. Como `utilidad = importe − costo`, basta una resta para obtener el costo. La
   vista rompía SEG-01 / RN-09 / INV-02 exactamente en el punto que decía proteger.
2. **Las dos vistas hacen bypass de RLS.** Sin `security_invoker = true`, una vista se ejecuta
   con los privilegios de su dueño e ignora el RLS de la tabla subyacente.
3. **Once tablas sin RLS habilitado**, expuestas por PostgREST con la clave `anon`:
   `usuarios`, `equipos`, `persona_correos`, `persona_telefonos`, `catalogos`, `paises`,
   `politica_comercial_pais`, `pipelines`, `etapas`, `tipos_actividad` y
   `actividad_participantes`. Nombres y correos legibles públicamente, con implicaciones bajo
   LFPDPPP, Ley 1581 y Ley 19.628.
4. **El folio no reinicia por año.** `seq_oportunidad_folio` es una secuencia global: el
   1-ene-2027 el folio sigue en `OPP-2027-00015`. RN-20 pide consecutivo por año.
5. `CLAUDE.md` afirmaba «30 tablas, 2 vistas»; el conteo real de los archivos es **28 tablas y
   2 vistas**.

### 1.2 Verificación aritmética del seed del spec §15

Se recalcularon los tres totales que el spec ofrece como prueba del seed:

| Total declarado | Resultado |
|---|---|
| Valor abierto 12 621 000 | ✔ exacto |
| Ponderado 7 362 350 | ✔ exacto con probabilidades 10/25/50/75/90 |
| En riesgo 3 513 000 · 5 banderas | ✘ incompatible con INV-11 |

El tercero falla porque INV-11 obliga a **calcular** las banderas. Con `marginFloor = 0.20`,
tres oportunidades caen bajo el piso —OPP-2026-00388 (9 %), OPP-2026-00341 (11 %) y
OPP-2026-00304 (19 %)— pero el seed solo marca la primera. Calculadas, salen **7 banderas
sobre 6 oportunidades y 3 943 000** en riesgo. El seed adopta la cifra calculada.

---

## 2. Decisiones tomadas

Seis decisiones cerradas el 1 de septiembre de 2026. Modifican el spec y prevalecen sobre él.

| # | Decisión | Efecto sobre el spec |
|---|---|---|
| **D-A** | **Monomoneda USD.** Se captura y almacena todo en dólares en los tres países. | Se caen `ExchangeRate`, `Opportunity.frozenExchangeRate`, INV-08 y AC-19. INV-04 queda satisfecho trivialmente. La lista de precios pierde su dimensión de país. |
| **D-B** | **Prisma para datos, Supabase para Auth (Entra ID) y Storage.** RLS como respaldo deny-all. | Confirma el stack del CLAUDE.md v2.0 sobre el cableado `@supabase/ssr` del repositorio. |
| **D-C** | **Alcance de esta entrega: E0 y E1 completos.** | §17 sin cambios; E2 a E5 quedan para ciclos posteriores. |
| **D-D** | **Reemplazar las migraciones anteriores, archivándolas.** | Sustituye la instrucción de §6.2 de migrar incrementalmente, que suponía una base poblada. |
| **D-E** | **Adoptar los supuestos del spec para Q-01 a Q-10 y marcarlos.** | Cada supuesto vive como dato en la base (INV-05) y queda listado en `docs/decisiones-pendientes.md`. |
| **D-F** | **`react-doctor` como medición de calidad de React.** | Adición al stack: `react-doctor@0.9.12`, más `pnpm lint` y `pnpm typecheck`. |

### 2.1 Qué implica D-A en el detalle

`Currency` permanece como enum con un solo valor, `USD`, y las columnas `currency` permanecen
en `Opportunity`, `Quote`, `Pipeline` y `Objective`. No es indecisión: la nota de arquitectura
de moneda del esquema anterior advierte que facturar en México, Colombia y Chile normalmente
exige moneda local para SAT, DIAN y SII, y que la integración con Defontana (Fase 2) tendrá
que resolverlo. Conservar la columna hace que reintroducir moneda local sea agregar un valor
al enum y una tabla de tipos de cambio, no repintar cinco tablas.

`Country.taxRate` sí varía por país —16 % en México, 19 % en Colombia y Chile— y se mantiene
tal cual, igual que la copia de la tasa a la cotización al crearla (RN-24).

INV-08 y AC-19 **no se renumeran ni se borran**: los códigos del spec son estables y citables
(§0.4). Quedan marcados como «sin efecto bajo monomoneda» en `docs/decisiones-pendientes.md`,
para que reintroducir multimoneda sea reactivarlos y no redescubrirlos.

---

## 3. Arquitectura

### 3.1 Frontera de datos

```
app/(app)/**            Server Components · Server Actions
components/**           presentación
        │  solo pueden importar ↓
lib/scope/*             lecturas con alcance aplicado
lib/domain/*            reglas de negocio y mutaciones
        │  únicos que pueden importar ↓
lib/db.ts               PrismaClient (singleton)
```

`lib/db` es inalcanzable desde `app/**` y `components/**`. Se aplica con
`no-restricted-imports` de ESLint y con una prueba de arquitectura, que es lo que pide AC-32.

`lib/scope` exporta **dos** capas, a propósito:

- `opportunityScope(session): Prisma.OpportunityWhereInput` — la firma literal de §5.3. Pura,
  sin base de datos, testeable en microsegundos.
- `listOpportunities(session, filters)` y hermanas — las funciones que efectivamente
  consultan. Son lo único que `app/**` recibe.

Se descartó aplicar el alcance con una extensión de Prisma (`$extends` sobre
`AsyncLocalStorage`). Funcionaría, pero vuelve invisible la autorización justo en la capa
donde el spec exige que sea explícita.

### 3.2 Identidad

Entra ID → Supabase Auth con el proveedor `azure` → `auth.users`. El perfil de aplicación vive
en `public.users` con `entraObjectId`, `role` y `countryCodes`.

- `app/(auth)/login/page.tsx` → `signInWithOAuth({ provider: 'azure' })`.
- `app/(auth)/callback/route.ts` → `exchangeCodeForSession`.
- `middleware.ts` → refresca la sesión con el patrón de `@supabase/ssr` y protege `(app)`.
- `lib/auth/session.ts` → `getSession()` lee el usuario de Supabase, carga el perfil vía
  Prisma y arma `Session { userId, role, countryCodes, permissions }`. Envuelto en
  `React.cache`: una vez por request, no una vez por componente.

Un usuario autenticado en Entra ID **sin fila en `public.users`** recibe 403 con mensaje
explícito. No hay autoaprovisionamiento silencioso, coherente con `enable_signup = false` que
ya trae `supabase/config.toml`. El alta de usuarios es un acto administrativo.

### 3.3 Cómo se hace estructuralmente difícil violar cada invariante

El spec enumera quince invariantes. Seis se pueden hacer cumplir por construcción en lugar de
por disciplina, y ahí es donde vale la pena gastar el diseño:

| Invariante | Mecanismo estructural |
|---|---|
| **INV-01** alcance | `lib/db` inalcanzable desde la UI; ESLint + prueba de arquitectura (AC-32) |
| **INV-02** costo | Los selectores de Prisma se eligen por permiso: sin `VER_COSTO`, `unitCost`, `totalCost` y `grossProfit` no entran al `select`. No se ocultan: no se consultan |
| **INV-03** dinero | Los DTO tipan el dinero como `string`. Un componente no puede sumar importes sin un parseo explícito y visible en el diff |
| **INV-05** umbrales | Prueba que falla si aparece `0.20`, `0.15`, `0.16` o `0.30` en `lib/domain` (AC-31) |
| **INV-09** bitácora | `writeAudit(tx, …)` exige el cliente de transacción como primer argumento. Es imposible escribir la bitácora fuera de la transacción que audita |
| **INV-10** filtros | `toWhere()` construye siempre `{ AND: [scope(session), ...clauses] }`; `buildClauses` no se exporta, así que un filtro no puede anteponerse al alcance (AC-25) |

Los nueve restantes se cumplen con revisión y pruebas, no con estructura de tipos.

### 3.4 Permisos como datos

`Permission` y `RolePermission` (§5.2), cargados una vez por request junto con la sesión.
`can(session, 'VER_COSTO')` es la única forma de preguntar. `PermissionGate` es azúcar de
presentación y **nunca** el punto donde se aplica la regla: si un `PermissionGate` es lo único
que impide ver un dato, el dato ya viajó.

### 3.5 Mutaciones

Server Actions que **validan con Zod, autorizan, y delegan** en un servicio de `lib/domain`.
Toda operación que toque más de una tabla va en `prisma.$transaction`. Los cálculos de
cotización, puntaje MEDDIC y cuadre de hitos son funciones puras con pruebas unitarias; la UI
nunca recalcula por su cuenta.

---

## 4. Migraciones y esquema

### 4.1 Quién es dueño del historial

**El schema de Prisma es la fuente; Supabase lleva el historial aplicado.**

`prisma migrate diff --from-empty --to-schema-datamodel` genera el SQL sin necesitar conexión.
Ese SQL se guarda en `supabase/migrations/` y se aplica con el MCP de Supabase, lo que además
permite verificar en el acto con `list_tables` y `get_advisors`.

Se gana: un solo historial, y capacidad de trabajar sin la contraseña de la base.
Se pierde: la detección de deriva con shadow DB de `prisma migrate dev`. Se recupera en cuanto
exista `DATABASE_URL`.

Las migraciones anteriores se mueven a `supabase/migrations/_archivo_v1/` con un README que
explique la divergencia y conserve las notas de negocio de sus comentarios SQL.

### 4.2 Reconciliación del modelo

Respecto al spec §6.2, con D-A aplicada:

**Se elimina:** `ExchangeRate`; `Opportunity.frozenExchangeRate`; las dimensiones
`countryCode` y `currency` de `PriceListEntry`, que pasa a ser lista única global con
`@@unique([productId, validFrom])`.

**Se agrega:** `FolioCounter` — tabla con `(year, lastNumber)` operada con
`UPDATE … RETURNING` dentro de la transacción de alta, tal como RN-20 exige y como el esquema
anterior hacía mal.

**Se conserva del spec y faltaba en el esquema anterior:** `StageTransition`, `MeddicWeight`,
`SavedView`, `Permission`, `RolePermission`, `Stage.gateMode`, y los seis componentes MEDDIC
completos.

**Se descarta del esquema anterior:** `prospectos` y sus reglas PR-01 a PR-05 (no están en el
spec v2.0 ni en su §16); `oportunidad_copropietarios` (RN-11 es Fase 2); el estatus
`cancelada` (RN-12 fija tres estados); la tabla genérica `catalogos` (el spec usa tablas
dedicadas con comportamiento propio: `LossReason.requiresCompetitor`,
`DocumentType.isContract`); el modelo de objetivos por `sujeto_tipo` y `metrica` como fila.

**Divergencias resueltas a favor del spec:** identificadores en inglés y `snake_case` con
`@map` (§4.1 marca el español como incorrecto); porcentajes como fracción `0.1500` en lugar de
`15.00` (INV-03); cinco roles en lugar de siete; `Person.organizationId` obligatorio en lugar
de la relación N:M con vigencia; `Opportunity.primaryPersonId` opcional en lugar de
obligatorio, que era lo que peleaba contra la captura rápida; hitos que almacenan **siempre
monto**, con el porcentaje como vista (§6.3).

### 4.3 RLS de respaldo

Deny-all para `anon` y `authenticated` en **todas** las tablas de `public`, incluidas las once
que el esquema anterior dejó sin habilitar. Prisma entra con su propio rol, que no está sujeto
a esas políticas. `get_advisors` se corre después de aplicar cada migración, y su salida
limpia es parte de la definición de terminado.

Esto es defensa en profundidad, no la autorización: la autorización vive en `lib/scope`
(INV-01), porque RLS filtra filas y el requisito más delicado del sistema —INV-02— es de
columnas.

---

## 5. Sistema de diseño

Los tokens de §13 se copian **textualmente** a `app/globals.css` como variables CSS. El tema
de Tailwind mapea a esas variables en lugar de sustituirlas, para que el manual de normas
gráficas siga siendo la fuente y no una copia que se desincroniza.

- Azul `#62A8E5` domina, navy `#375172` acompaña. Magenta, lima y coral solo como estado.
- Montserrat para cuerpo y títulos; Clash Display para títulos cortos.
- `font-variant-numeric: tabular-nums` en toda columna de cifras.
- Verde en o sobre el piso de margen, coral debajo. Es la señal más importante de la interfaz.
- Los estados vacíos proponen la acción siguiente; los errores nombran el dato que falta.

---

## 6. Alcance de esta entrega

### 6.1 Qué entra

**E0 · Cimientos.** Esquema Prisma completo —los seis módulos, no solo los de E1— y su
migración aplicada; seed verificable; SSO con Entra ID; matriz de permisos como datos;
`lib/scope`, `lib/policy`, `lib/money`, `lib/audit`, `lib/filters`; primitivas de
`components/ui`; `FilterBar`; pruebas de arquitectura.

**E1 · Núcleo comercial.** P-01 pipeline en kanban y tabla; P-02 detalle con las pestañas
Resumen y Actividades; P-03 contactos; P-04 ficha de organización; P-07 actividades; P-11
administración de pipelines, etapas y catálogos; banderas de riesgo calculadas; el catálogo
completo de filtros de §9.2.

**El esquema es completo en E0 aunque la UI no lo sea.** Es una decisión deliberada: el
evaluador de compuertas de etapa (RN-02) necesita nueve tipos de requisito, y cuatro de ellos
—`COTIZACION_CONGELADA`, `HITOS_CUADRADOS`, `MEDDIC_MIN_CIERRE`,
`SIN_AUTORIZACION_PENDIENTE`— consultan datos cuyos editores llegan en E2 y E3. Con el
esquema completo y el seed poblado, el evaluador se construye entero desde E1 y esos
requisitos evalúan contra datos reales, no contra ramas muertas.

### 6.2 Qué no entra, y qué se ve en su lugar

El editor de cotización, la pestaña MEDDIC, la captura de hitos, la cola de autorizaciones,
el tablero de objetivos y las pantallas de análisis quedan para E2 a E4.

Las pestañas correspondientes de P-02 **existen y son navegables**, y muestran un estado vacío
que nombra el incremento en el que llegan. No se ocultan: una pestaña ausente parece un
defecto, y un estado vacío que explica cuándo llega es información.

La carga de documentos llega en E2. En E1 los documentos se listan en solo lectura sobre los
que trae el seed, que es lo que las compuertas `PROPUESTA_CARGADA` y `CONTRATO_O_OC_CARGADO`
necesitan para evaluar de verdad.

`/analisis` responde 403 al rol `VENDEDOR` desde E0 (AC-02), aunque su contenido llegue en E4.

### 6.3 Criterios de aceptación que deben pasar

De §14, los que corresponden a E0 y E1:

- **Alcance y permisos:** AC-01, AC-02, AC-03, AC-04, AC-05
- **Filtros:** AC-22, AC-23, AC-24, AC-25, AC-26
- **Transversales:** AC-31, AC-32, AC-33 (parcial)

AC-03 se prueba sobre el JSON serializado de la cotización que trae el seed, no sobre la
pantalla del cotizador, que aún no existe. El invariante es de E0; su editor es de E2.

AC-33 pasa **parcialmente y por diseño**. INV-09 enumera seis acciones auditables, y solo dos
existen en este alcance: edición de catálogos y cambio de propietario. Las otras cuatro
—autorizar descuento, cambiar precio sobre cotización congelada, reabrir oportunidad y
exportar con costo— llegan con E2, E3 y E4. Lo que sí se prueba entero desde E0 es la mitad
del criterio que importa: que si la escritura de la bitácora falla, la operación completa se
revierte. Eso se verifica sobre las dos acciones existentes y queda garantizado para las
demás por la firma de `writeAudit(tx, …)`.

### 6.4 Pruebas

Unitarias con Vitest sobre `lib/domain` y `lib/scope`. Dos pruebas de arquitectura para AC-31
y AC-32. Playwright para AC-01 a AC-05 y AC-22 a AC-26. `react-doctor`, `pnpm lint` y
`pnpm typecheck` sobre cada pantalla construida.

---

## 7. Diseño del seed

El seed reproduce §15 para que la aplicación se vea igual que el prototipo aprobado desde la
primera corrida. Tres ajustes deliberados, todos registrados en `docs/decisiones-pendientes.md`:

**Banderas de riesgo.** Se adopta la cifra calculada —7 banderas, 3 943 000 en riesgo— en
lugar de la declarada, por INV-11. Los tres totales se afirman como aserciones del seed: si
alguien cambia un importe o una probabilidad, el seed falla en lugar de mentir.

**Cuotas.** Las de §15 (9.00 M USD para Jorge Medina, 33.5 M en total) dejan la cobertura del
T3 en 0.10× contra la banda sana de 3.0×, porque solo 3 319 000 del pipeline cierra en ese
trimestre. Se escalan conservando las proporciones originales, de modo que la cobertura del
equipo caiga en 3.02× y el tablero demuestre lo que §10.3 pide demostrar:

| Vendedor | Cuota ingreso | Cuota utilidad | Cobertura T3 | Lectura |
|---|---:|---:|---:|---|
| Jorge Medina | 300 000 | 90 000 | 3.68× | sana |
| Ana Lucía Ríos | 450 000 | 135 000 | 4.06× | sana |
| Paulina Estrada | 150 000 | 45 000 | 2.57× | bajo la banda |
| Gabriel Duarte | 120 000 | 36 000 | 0.00× | sin cobertura |
| Valeria Domínguez | 80 000 | 24 000 | 0.00× | sin cobertura |
| **Equipo** | **1 100 000** | **330 000** | **3.02×** | sana |

La cuota de utilidad se mantiene en 30 % de la de ingreso, que es la proporción de §15.

**RN-32 y AC-30.** Se siembran los cuatro trimestres y el anual. Para cuatro vendedores la
suma de trimestres iguala el anual; para Valeria Domínguez **no**, deliberadamente, para que
la advertencia de descuadre sea visible en la demostración y AC-30 tenga un caso real.

---

## 8. Supuestos adoptados (D-E)

Se adoptan los valores que el propio spec propone. Todos viven como dato en la base, no en el
código (INV-05), así que cambiarlos no requiere desplegar. Quedan listados en
`docs/decisiones-pendientes.md` con su valor asumido y el lugar donde se cambia.

| Q | Supuesto adoptado | Dónde vive |
|---|---|---|
| Q-01 | Visibilidad del vendedor por `ownerId`, no por `createdById` | `lib/scope/opportunities.ts` — un cambio de una línea |
| Q-02 | Año fiscal = año calendario | `Country.fiscalYearStartMonth = 1` |
| Q-03 | `PREVENTA` es rol propio, ve oportunidades donde está asignado como apoyo, sin `VER_COSTO` | `RolePermission` |
| Q-04 | IVA: MX 16 %, CO 19 %, CL 19 % | `Country.taxRate` |
| Q-05 | El costo estándar lo mantiene Administración por carga masiva | `Product.costSource = CARGA_MASIVA` |
| Q-06 | No se carga histórico agregado; P-09 muestra «sin datos suficientes» | — |
| Q-07 | Se permiten conceptos libres, con costo obligatorio | `QuoteLine.productId` nulo |
| Q-08 | Pesos MEDDIC 17/17/17/17/15/17 | `MeddicWeight` |
| Q-09 | SLA de autorización en horas hábiles | `CommercialPolicy.approvalSlaHours` |
| Q-10 | Sin efecto bajo monomoneda (D-A) | — |

Divergencias que también se registran ahí, porque el negocio podría querer lo contrario:
siete roles en el catálogo v2 contra cinco en el spec; el módulo de Prospectos y el crédito
compartido, que existían en el esquema anterior y salen del alcance; y el estatus `cancelada`,
que el catálogo distingue de `perdida` para la tasa de cierre y RN-12 elimina.

---

## 9. Riesgos

**El seed y el prototipo aprobado pueden discrepar en escala.** Con monomoneda USD, una
oportunidad de 2 850 000 dólares y una cuota anual de 9 millones son cifras grandes para una
consultoría de este tamaño; leídas como pesos serían ordinarias. El ajuste de cuotas de §7
resuelve la cobertura, pero conviene que Dirección confirme la escala de los importes antes de
la primera demostración.

**Falta `DATABASE_URL`.** El flujo de §4.1 permite crear y aplicar el esquema sin la
contraseña de la base, pero `prisma migrate dev`, la detección de deriva y las pruebas de
integración contra Postgres la necesitan. Es un prerequisito de entorno, no de código.

**Entra ID no está configurado.** `supabase/config.toml` trae el bloque `[auth.external.azure]`
comentado a la espera de credenciales. Sin ellas, el login no se puede probar de extremo a
extremo; el resto se prueba con sesiones simuladas.

**El repositorio no está bajo control de versiones.** No hay `.git`. Este documento no se
puede confirmar en git como pide el proceso, y ningún cambio es reversible hasta que se
inicialice.
