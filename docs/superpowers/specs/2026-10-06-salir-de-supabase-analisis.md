# Salir de Supabase · análisis y plan de implementación

> **Estado: análisis. No se implementó nada.** Documento para decidir, no para
> ejecutar todavía. Fecha: 6 de octubre de 2026.
>
> La pregunta que contesta: *¿qué implicaría dejar de usar Supabase y construir
> un backend propio, conservando PostgreSQL como base de datos?*

---

## Respuesta corta

**Es una salida barata y de bajo riesgo técnico, pero no es gratis y no aporta
funcionalidad.** Son unas **tres o cuatro semanas** de un desarrollador, de las
que no sale ninguna pantalla nueva para el usuario.

Tres cosas que conviene saber antes de decidir:

1. **El 98 % del código no se entera.** Solo 882 de 48 382 líneas tocan
   Supabase, y la mitad de esas no cambian de fondo. La decisión de poner Prisma
   entre la aplicación y la base (INV-01) es justo lo que hace que esta salida
   sea una sustitución de piezas y no una reescritura.
2. **«Construir un backend» tiene dos lecturas con costos muy distintos**:
   sustituir los servicios de Supabase dentro de Next.js (3–4 semanas) o montar
   una API separada (2–4 meses). La segunda no se recomienda sin un cliente que
   la pida.
3. **Hay un detalle de identidad que hay que resolver antes del corte** o los
   cinco usuarios del sistema pierden su cuenta. Se explica en §4. Hoy son cinco
   personas, así que la mitigación es trivial; a escala mayor no lo sería.

**Recomendación**: si el motivo es portabilidad o coherencia con Microsoft,
hacerlo por partes y en este orden —almacenamiento, base de datos, identidad—,
no todo en un corte. Si el motivo es solo incomodidad con Supabase Auth, hacer
únicamente la parte de identidad y dejar la base y los archivos donde están: es
la mitad del trabajo y quita la dependencia que de verdad estorba.

---

## 1. Qué usa hoy el proyecto de Supabase

Seis servicios, con muy distinto grado de atadura.

| Servicio | Dónde vive | Atadura | Qué cuesta sustituirlo |
|---|---|---|---|
| **Identidad** (OAuth con Entra ID, sesión en cookie, refresco de token) | `login/page.tsx`, `auth/callback`, `auth/signout`, `lib/auth/session.ts`, `middleware.ts` | **Alta** | Lo más grande del trabajo |
| **API administrativa de usuarios** (`auth.admin.listUsers`) | `lib/scope/usuarios.ts` | Media | Una tabla propia |
| **Almacenamiento** (bucket `documentos`, subida y URL firmada) | `lib/domain/document.ts` | Baja | Cambio de SDK, un día |
| **PostgreSQL gestionado** | `DATABASE_URL`, `DIRECT_URL` | Baja | Es Postgres estándar: se muda |
| **Pooler de conexiones** (Supavisor, puertos 6543 y 5432) | `prisma/schema.prisma` | Media | Hay que resolverlo aparte (§5, fase 4) |
| **Historial de migraciones + MCP** (`supabase_migrations`, `list_tables`, `get_advisors`) | proceso de trabajo | Media | Se sustituye por Prisma Migrate |

En números: **10 archivos** importan Supabase —tres de ellos son los propios
envoltorios de `lib/supabase/`—, **5 variables de entorno** y **2 dependencias**
de npm (`@supabase/ssr`, `@supabase/supabase-js`).

---

## 2. Qué no lo usa, y por qué eso abarata la salida

No cambia **nada** de esto:

- `prisma/schema.prisma` completo: el modelo de datos es Postgres puro.
- `lib/scope/**` salvo `usuarios.ts`: todos los lectores, todo el alcance por rol.
- `lib/domain/**` salvo `document.ts`: las reglas de negocio, los servicios con
  transacción, las funciones puras.
- `lib/audit`, `lib/policy`, `lib/money`, `lib/filters`, `lib/tiempo`.
- Todas las pantallas, todas las Server Actions, el contrato `ResultadoAccion`.
- Los quince invariantes. Ninguno depende de Supabase.
- Las ~450 pruebas unitarias.

Dos datos que lo confirman:

- **RLS no está haciendo nada.** Las migraciones tienen un
  `ENABLE ROW LEVEL SECURITY` y **cero políticas**. Es deny-all como respaldo,
  tal como dice el contrato: *«RLS está en deny-all como respaldo, no como
  autorización»*. Toda la autorización vive en `lib/scope` y en `lib/domain`.
  **Al salir de Supabase no se pierde ni una regla de seguridad**, porque ninguna
  estaba delegada en la base.
- **Las extensiones son estándar.** Solo `pg_trgm`, y además todavía no se usa en
  ninguna consulta (`lib/scope/busqueda.ts` la menciona como mejora pendiente).
  Existe en cualquier PostgreSQL.

Dicho de otro modo: el proyecto ya está construido como si Supabase fuera
reemplazable. Lo es.

---

## 3. Dos lecturas de «construir un backend»

Conviene separarlas porque se parecen al nombrarlas y no se parecen en nada al
costearlas.

### Opción A · Sustituir los servicios; Next.js sigue siendo el backend

Next.js App Router **ya es el backend**: los Server Components leen por
`lib/scope`, las Server Actions escriben por `lib/domain`, y los Route Handlers
cubren lo que no cabe en una acción. No hay un «frontend que llama a una API».

Salir de Supabase, en esta lectura, es cambiar tres piezas: identidad,
almacenamiento y hospedaje de la base.

- **Esfuerzo**: 15–21 días hábiles.
- **Riesgo**: medio, concentrado en identidad.
- **Qué gana**: portabilidad, control del esquema de autenticación, migraciones
  versionadas en el repositorio.
- **Qué pierde**: nada funcional.

### Opción B · Una API separada (NestJS, Fastify, Express)

Next.js quedaría como cliente y la lógica se mudaría a un servicio aparte.

- **Esfuerzo**: 40–80 días hábiles.
- **Riesgo**: alto. Rompe el contrato `ResultadoAccion`; obliga a serializar y
  volver a validar en la frontera HTTP; duplica la autorización (hoy está en una
  capa, pasaría a estar en dos); añade un salto de red a cada operación; y hay
  que reconstruir desde cero la parte que hoy garantiza INV-01 y INV-02 —que el
  costo no se serialice para quien no tiene `VER_COSTO` es, en una API REST,
  mucho más fácil de romper sin notarlo.
- **Qué gana**: poder servir a otros clientes. Hoy no hay ninguno pedido.

**No se recomienda la opción B** salvo que el negocio pida explícitamente una
aplicación móvil o una integración de terceros. Y si la pide, conviene decidirla
por ese caso de uso, no como consecuencia de salir de Supabase: son dos
proyectos distintos que se están nombrando igual.

El resto de este documento desarrolla la **opción A**.

---

## 4. El hallazgo que manda en el plan: el vínculo de identidad

**La columna `users.entra_object_id` no guarda lo que su nombre dice.**

El esquema la documenta como *«SSO con Entra ID vía Supabase Auth»* y el
comentario de `lib/auth/session.ts` dice *«el vínculo es el object id de Entra,
no el correo: un correo puede reasignarse a otra persona, el object id no»*. La
intención es clara y es correcta. Lo que guarda, no.

Verificado contra la base el 6-oct-2026:

| Qué | Valor observado |
|---|---|
| `users.entra_object_id` | UUID de 36 caracteres |
| ¿Coincide con `auth.users.id` de Supabase? | **Sí, en los cinco perfiles** |
| `auth.identities.provider_id` (el identificador que manda Entra) | cadena de **43 caracteres**, no un UUID |
| Usuarios en el sistema | **5** |

Es decir: la columna guarda **el UUID que generó Supabase**, no el identificador
de Entra. Hoy funciona perfectamente —mientras Supabase sea quien emite el
token, `sub` es ese UUID y todo cuadra—, pero es exactamente la pieza que deja
de cuadrar al cambiar de emisor.

Hay un segundo matiz, y es el que decide el plan. Esos 43 caracteres son el
`sub` que Entra ID emite, que es **pairwise**: Entra da un identificador
distinto por cada registro de aplicación. El `oid` —el que sí es estable para
una persona en todo el tenant— es otro claim, y es un UUID.

Eso deja tres caminos:

1. **Reutilizar el mismo registro de aplicación de Entra** que usa Supabase hoy,
   añadiéndole el nuevo URI de redirección. El `sub` se conserva, y basta copiar
   `auth.identities.provider_id` a `users.entra_object_id` antes del corte.
   Es el camino limpio si TI puede tocar ese registro.
2. **Registrar una aplicación nueva** y vincular por el claim `oid` en vez del
   `sub`. Más robusto a futuro —el `oid` sobrevive a cambios de registro— pero
   hay que poblar la columna con los `oid` reales, que hoy no están en la base.
3. **Vaciar la columna y dejar que el respaldo por correo revincule.** El código
   ya tiene ese camino: cuando `entraObjectId` es nulo busca por correo sin
   distinguir mayúsculas y sella el vínculo en el primer ingreso
   (`vincularEntraObjectId`). Con **cinco usuarios**, esto es una línea de SQL y
   cinco inicios de sesión.

**Recomendación: el camino 3, combinado con el 2.** Vaciar la columna en el
corte, pedir el claim `oid` en el proveedor nuevo, y dejar que cada quien se
revincule al entrar. Se gana además que la columna pase a guardar, por fin, lo
que su nombre promete. A escala de cincuenta o doscientos usuarios esta
recomendación cambiaría: ahí convendría el camino 1 para no obligar a nadie a
nada.

**Lo que no se puede hacer es olvidarlo.** Si se apaga Supabase sin tocar la
columna, los cinco perfiles quedan con un identificador que ningún token volverá
a traer, y como `entraObjectId` ya no es nulo, el respaldo por correo tampoco
entra: **todos caen en «sin acceso»** y hay que arreglarlo a mano desde la base.

---

## 5. Plan de implementación (opción A)

Las fases están numeradas por tema. La **secuencia recomendada no es ese orden**:
conviene ir de lo aislado a lo delicado, para que cada corte se pueda verificar
sin arrastrar al siguiente. El orden sugerido está en §9.

### Fase 0 · Decisiones previas (sin código)

Tres elecciones que hay que cerrar antes de tocar nada:

1. **Dónde vive PostgreSQL.** Candidatos: Azure Database for PostgreSQL
   (coherente con el tenant de Microsoft que ya se usa para identidad), Neon
   (el menor trabajo de operación: pooling serverless, ramas, driver con
   adaptador de Prisma), AWS RDS, o autogestionado.
2. **Dónde viven los archivos.** Azure Blob Storage (misma coherencia y misma
   factura), Cloudflare R2 (sin costo de egreso) o AWS S3.
3. **Quién opera.** Respaldos, recuperación a un punto en el tiempo, monitoreo,
   alertas, rotación de secretos. Hoy lo hace Supabase sin que nadie lo piense.
   **Esta es la implicación que más se subestima**: no es trabajo de migración,
   es trabajo permanente.

Además, aquí arranca la dependencia externa: **el URI de redirección del
registro de aplicación en Entra ID lo cambia quien administre el tenant**, no
quien desarrolla. Conviene pedirlo el primer día.

### Fase 1 · Identidad propia

La pieza grande. Se recomienda **Auth.js v5** (`next-auth@beta`) con el proveedor
`microsoft-entra-id`, antes que escribir el flujo OIDC a mano: cookies, CSRF,
rotación y revocación de tokens son fáciles de escribir mal.

Correspondencia pieza por pieza:

| Hoy (Supabase) | Después (Auth.js) |
|---|---|
| `supabase.auth.signInWithOAuth({ provider: "azure" })` | `signIn("microsoft-entra-id")` |
| `exchangeCodeForSession(code)` en `/auth/callback` | lo resuelve el handler de Auth.js |
| `supabase.auth.getClaims()` | `auth()` |
| refresco del token en `middleware.ts` | middleware de Auth.js |
| `supabase.auth.signOut()` | `signOut()` |

Lo importante: **el perfil de latencia se conserva**. Hoy `getClaims()` verifica
la firma localmente contra el JWKS en vez de viajar al servidor de autenticación
—una decisión tomada el día que se midió que `getUser` costaba ~170 ms por
request desde México (`docs/latencia-dev.md`, §4a)—. La sesión JWT de Auth.js se
verifica igual, en local. **No hay regresión de latencia**, siempre que no se
elija la estrategia de sesión en base de datos.

Lo que **no cambia** en esta fase: toda la lógica de `getSessionResult` que busca
el perfil, arma los permisos y los cachea por rol. Esa parte no sabe de Supabase;
solo recibe un `sub` y un correo.

Y aquí se ejecuta la migración del vínculo de §4.

### Fase 2 · Sustituto de `auth.users`

La pantalla de Administración lista *«quienes ya entraron con Microsoft y
todavía no tienen perfil»* (`autenticadosSinPerfil`), y hoy sale de
`supabase.auth.admin.listUsers()`. Sin Supabase no existe esa tabla.

Salida recomendada: **una tabla propia**, por ejemplo `IngresoSinPerfil`, con
`entraObjectId`, correo, nombre, primer y último ingreso. El callback hace un
`upsert` cuando no encuentra perfil. Es menos pieza que la alternativa
—adoptar el adaptador de base de datos de Auth.js, que traería sus propias
tablas `users` y `accounts` y duplicaría el concepto de usuario con
`public.users`— y registra exactamente lo que la pantalla necesita.

Antes del corte se siembra con los pendientes que haya en Supabase, para no
perder la lista.

### Fase 3 · Almacenamiento

- `subirDocumento` → `PutObjectCommand` (S3/R2) o `BlockBlobClient` (Azure).
- `urlDeDescarga` → URL prefirmada (S3) o token SAS (Azure), con la misma
  vigencia que hoy.
- **Migrar los archivos conservando las claves.** Las filas de `Document`
  guardan `storageKey`; si las claves cambian, las descargas se rompen. Es un
  script de una sola vez.

Oportunidad de paso: `Q-17` lleva pendiente desde el 9 de septiembre porque **el
bucket `documentos` está en público**, y el contrato advierte que con el bucket
público cualquiera con la URL descarga el archivo. Un almacén nuevo nace
privado: la deuda se salda sola.

### Fase 4 · Base de datos y migraciones

- **Mudanza de datos**: `pg_dump` / `pg_restore` para un corte con ventana, o
  réplica lógica si se quiere una ventana de minutos.
- **Pooling**: hoy `DATABASE_URL` apunta al pooler en modo transacción (6543) y
  `DIRECT_URL` al modo sesión (5432). Eso lo da Supabase. En el host nuevo hay
  que resolverlo: PgBouncer con `?pgbouncer=true` en Prisma, el pooler del
  proveedor, o un driver serverless. **Sin pooler, un despliegue serverless agota
  las conexiones bajo carga.** Es el error clásico de esta migración.
- **Migraciones**: pasar del proceso actual —`db:diff` genera el SQL, el MCP de
  Supabase lo aplica, la versión se anota a mano— a **Prisma Migrate**
  (`migrate dev` en desarrollo, `migrate deploy` en el despliegue), con un
  baseline del esquema actual. Esto es **mejor que lo de hoy**: historial
  versionado en el repositorio, aplicación automática y trazable.
- **Se pierde el MCP de Supabase**: `list_tables` para verificar en el acto y
  `get_advisors` para detectar índices faltantes o problemas de seguridad. El
  primero lo cubre `prisma migrate status`; el segundo no tiene sustituto
  directo. Es una pérdida real, aunque menor.

### Fase 5 · Entorno, salud y pruebas

- `/salud` comprueba hoy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  y `SUPABASE_SERVICE_ROLE_KEY`. Cambian por las del almacén y el pooler.
- `.env.example` se reescribe.
- Secretos nuevos en Vercel.
- **Las pruebas de integración corren contra la base real.** La migración es la
  ocasión de darles una base propia: hoy comparten la de desarrollo, y por eso
  el escenario del seed (§15) está roto y siete suites fallan por datos. Separar
  las bases arregla un problema que ya existe.

### Fase 6 · Corte y vuelta atrás

- Ventana: congelar escrituras, volcado final, restauración, cambio de
  variables, verificar `/salud`, y **probar el inicio de sesión de cada rol**
  (vendedor, gerente, dirección, administración, preventa).
- **Vuelta atrás**: dejar el proyecto de Supabase vivo y en solo lectura dos
  semanas, y guardar una copia de `users.entra_object_id` tal como estaba.

---

## 6. Implicaciones

### Lo que se gana

- **Portabilidad.** La base y los archivos dejan de estar atados a un proveedor
  con su propio modelo de autenticación.
- **Coherencia con Microsoft.** Si todo va a Azure, identidad, base y archivos
  quedan bajo el mismo tenant, la misma factura y el mismo control de acceso.
- **Control del esquema de autenticación.** Hoy `auth.users` es una caja cerrada
  que no se puede consultar con Prisma ni extender.
- **Migraciones versionadas** en el repositorio en vez de un proceso manual.
- **Se salda `Q-17`** (bucket público) sin trabajo extra.
- **Una base de pruebas separada**, que hoy hace falta.

### Lo que se pierde

- **El servicio de identidad gestionado**: refresco, rotación, revocación,
  limitación de intentos y el panel de usuarios. Pasa a ser código propio que
  hay que mantener y parchear.
- **El panel de Supabase** para mirar datos, registros y advisors cuando algo
  falla en producción.
- **Respaldos y recuperación automáticos**: hay que configurarlos y verificar
  que se restauran, que no es lo mismo que configurarlos.
- **El MCP de migraciones**, que hoy permite aplicar y verificar en el acto.
- **Tres o cuatro semanas** del plan de trabajo sin funcionalidad nueva.

### Lo que no cambia

- Los quince invariantes, el dominio, los lectores, las pantallas, el modelo de
  datos, el contrato de las Server Actions y las ~450 pruebas unitarias.
- La latencia de negocio: hoy ya es Prisma contra Postgres. Puede incluso
  mejorar si el host nuevo queda más cerca que el actual
  (`docs/latencia.md` tiene la medición de referencia).
- La forma de trabajar: sigue siendo Next.js, Prisma y Server Actions.

---

## 7. Riesgos, ordenados por lo que cuesta equivocarse

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El vínculo de identidad** (§4): si se apaga Supabase sin tocar `entra_object_id`, los cinco usuarios quedan sin acceso | Vaciar la columna en el corte y dejar que el respaldo por correo revincule; guardar copia previa |
| 2 | **Dependencia de TI**: el URI de redirección en Entra ID lo cambia quien administre el tenant | Pedirlo el primer día; si tarda, la fase 1 se bloquea entera |
| 3 | **Conexiones agotadas** en serverless sin pooler | Elegir el pooler en la fase 0, no al final; probar con carga |
| 4 | **Sesión escrita a mano** (cookies, CSRF, rotación) | Usar Auth.js, no escribir el flujo OIDC desde cero |
| 5 | **Archivos con claves distintas** tras la mudanza | Conservar `storageKey` tal cual; verificar descargas antes del corte |
| 6 | **Pérdida de respaldos** durante la ventana | Volcado verificado —restaurado en otra base— antes de apagar nada |

---

## 8. Costo

Un desarrollador, sobre la arquitectura actual:

| Fase | Días hábiles |
|---|---|
| 0 · decisiones y registro en Entra | 1–2 (más la espera de TI) |
| 1 · identidad con Auth.js y migración del vínculo | 5–7 |
| 2 · tabla de ingresos sin perfil | 1 |
| 3 · almacenamiento y mudanza de archivos | 2–3 |
| 4 · PostgreSQL nuevo, Prisma Migrate y pooling | 3–4 |
| 5 · entorno, salud y pruebas | 2 |
| 6 · corte, verificación y ventana de vuelta atrás | 1–2 |
| **Total opción A** | **15–21** |
| *Opción B, para comparar* | *40–80* |

---

## 9. Recomendación

**Primero, contestar por qué.** El motivo cambia qué fases valen la pena:

| Si el motivo es… | Entonces |
|---|---|
| Costo | Medir primero. Supabase para cinco usuarios es barato; un Postgres gestionado más almacenamiento más operación puede no serlo |
| Portabilidad o control | Opción A completa, por partes |
| Coherencia con Microsoft / dónde viven los datos | Opción A completa, con Azure en las tres piezas |
| Incomodidad con Supabase Auth | **Solo fases 1 y 2.** La base y los archivos se quedan. Mitad del trabajo, quita lo que estorba |
| Querer una API para otros clientes | Eso es la opción B y es otro proyecto. Decidirlo por el caso de uso |

**Segundo, el orden.** Si se hace completa, conviene ir de lo aislado a lo
delicado, y no al revés:

1. **Almacenamiento** (fase 3). Aislado, barato, verificable solo, y salda `Q-17`.
2. **Base de datos** (fase 4). Mudanza con ventana, con Supabase todavía vivo
   para la identidad.
3. **Identidad** (fases 1 y 2). Al final, con la ventana de vuelta atrás más
   larga, porque es la única que puede dejar a todo el mundo fuera.

**Tercero, cuándo no hacerlo.** Si el plan de trabajo tiene comprometido E5
(regional) o las autorizaciones de descuento, son tres o cuatro semanas sin nada
visible para quien usa el sistema. La salida no caduca: el proyecto está
construido de forma que seguirá siendo igual de barata dentro de seis meses.

---

## Apéndice · Inventario verificado

Medido sobre el repositorio el 6 de octubre de 2026.

```
Archivos que importan Supabase (10)
  lib/supabase/server.ts            40 líneas   envoltorio
  lib/supabase/admin.ts             20          envoltorio
  lib/supabase/client.ts            15          envoltorio
  middleware.ts                     82          refresco de sesión
  app/(auth)/auth/callback/route.ts 61          intercambio de código
  app/(auth)/auth/signout/route.ts  34          cierre de sesión
  app/(auth)/login/page.tsx        116          arranque del OAuth
  lib/auth/session.ts              216          claims + perfil (la mayor parte no cambia)
  lib/domain/document.ts           195          almacenamiento (la mayor parte no cambia)
  lib/scope/usuarios.ts            103          listado de auth.users
                                   ───
                                   882 líneas de 48 382 del proyecto  (1,8 %)

Variables de entorno (5)
  NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY · DATABASE_URL · DIRECT_URL

Dependencias (2)
  @supabase/ssr · @supabase/supabase-js

Políticas RLS                       0   (un ENABLE, ninguna política)
Extensiones no estándar             0   (solo pg_trgm, y aún sin usar)
Usuarios en el sistema              5
Perfiles con vínculo de identidad   5   (los cinco apuntan a auth.users.id)
```
