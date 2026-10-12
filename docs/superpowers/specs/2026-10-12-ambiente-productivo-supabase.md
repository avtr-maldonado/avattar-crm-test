# Ambiente productivo del CRM Avattar · plan e implicaciones

12 de octubre de 2026. **Estado: pasos 0 a 5 hechos. La base está lista y el SSO encendido.**
Falta Vercel, el dominio y el humo; ver la sección 8. Las deudas D1, D2 y D3 quedaron corregidas y razonadas en
`docs/decisiones-pendientes.md` §50.

Análisis original, de antes de ejecutar. Responde a: «crear otro proyecto en Supabase
para los datos productivos con el mismo esquema que DEV, ¿podemos hacer la migración desde aquí?».
La copia viva está en claude.ai; este archivo es la versión del repo.

**Respuesta corta.** Sí. El esquema se lleva desde esta máquina con la CLI de Supabase que ya usa
`aplicar-migraciones.mjs`, apuntando al proyecto nuevo con un archivo de variables aparte; los
catálogos y los primeros administradores se siembran desde aquí también. Lo que no se hace desde
aquí: crear el proyecto, el bucket, el proveedor de Entra ID, las variables en Vercel y el DNS, que
son clics en tres consolas. Antes hay cinco deudas que PROD heredaría si se copia DEV tal cual; las
tres de código se resuelven en medio día. Un día de trabajo técnico más las esperas de Entra y DNS;
unos 35 a 50 USD al mes en Supabase.

## 1. Lo que hay hoy (medido el 12 de octubre de 2026 contra DEV)

| Qué | DEV |
|---|---|
| Proyecto | `cjwahoscedjnjgalmyzu`, `us-east-1`, Postgres 17.6, pooler compartido (`aws-0-us-east-1.pooler.supabase.com`, 6543 transacción y 5432 sesión) |
| Esquema | 33 tablas en `public`, todas con RLS activo y 0 políticas; `anon` y `authenticated` con permisos de tabla, pero RLS en deny-all los deja sin filas |
| Extensiones | `pg_trgm`, `pgcrypto`, `uuid-ossp` en el esquema `extensions`; `pg_stat_statements` y `vault` de Supabase |
| Migraciones aplicadas | 7 en `supabase_migrations.schema_migrations`; la carpeta `supabase/migrations/` trae 5 archivos |
| Storage | bucket `documentos`, **privado**, 7 archivos, 0,8 MB; lo creó alguien a mano, no una migración |
| Autenticación | Supabase Auth con proveedor Azure (Entra ID); 5 identidades vinculadas |
| Catálogos | 3 países, 3 políticas comerciales, 4 pipelines, 18 etapas, 13 tipos de actividad, 7 orígenes, 7 roles de comité, 8 motivos de pérdida, 7 familias, 13 permisos en 65 celdas de matriz, 24 pesos MEDDIC |
| Datos de negocio | 14 usuarios (5 con identidad), 10 productos de demostración, 19 cuentas, 10 personas, 15 oportunidades, 19 actividades, 18 cotizaciones, 10 hitos, 5 documentos, 8 objetivos, 274 entradas de bitácora. **Todo es escenario de prueba** |
| Despliegue | Vercel `avattar-crm-test`, desde la rama `develop`; `main` existe y va detrás |
| Variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`. Sin `AZURE_*`: el calendario de Microsoft 365 está apagado en DEV |
| Herramientas aquí | CLI de Supabase 2.109.1 global; `aplicar-migraciones.mjs` hace `supabase db push --db-url $DIRECT_URL`; `prisma migrate diff` compara base contra `schema.prisma`; `prisma.config.ts` carga `.env.local` y luego `.env` |

## 2. Lo que PROD heredaría si se copia DEV tal cual

Son las cosas que conviene arreglar antes de crear el proyecto, porque crear PROD desde una base
con deuda es la forma de convertir la deuda en permanente.

| # | Deuda | Qué pasa si no se arregla | Cómo se arregla |
|---|---|---|---|
| D1 | **Dos migraciones aplicadas que no están en la carpeta**: `20260902012224_mover_extensiones_fuera_de_public` (quita `citext`, mueve `pg_trgm` a `extensions`) y `20260902050952_unicidad_real_de_objetivos_anuales` (índice único con `NULLS NOT DISTINCT` para que no haya dos cuotas anuales de la misma persona, `RN-32`) | PROD nacería con `pg_trgm` en `public` (hallazgo del advisor) y **aceptaría dos cuotas anuales iguales** | El texto está guardado en `schema_migrations.statements` de DEV (610 y 1 038 caracteres): se recuperan a dos archivos con su versión original. Además `organizaciones_sin_pais` está aplicada como `20260917192619` y el archivo dice `20260917120000`: renombrar el archivo para que el historial de DEV y el de PROD sean el mismo |
| D2 | **Deriva entre `schema.prisma` y DEV**: una sola, la llave `organizations.country_code` tiene `ON DELETE SET NULL` en el schema y otra regla en DEV | `prisma migrate diff` nunca da vacío, y ese vacío es la prueba de que PROD está bien | Una migración de dos líneas, aplicada primero en DEV |
| D3 | **El seed solo siembra el escenario de prueba** (§15): `main()` mezcla países, permisos y catálogos con usuarios, cuentas y oportunidades de demostración | No hay forma de poblar PROD sin arrastrar datos falsos | Un modo `db:seed:catalogos` que siembre solo lo de catálogo y reciba los correos de los primeros administradores; mismo código, otra entrada |
| D4 | **El bucket no lo crea ninguna migración** | Se olvida y la pestaña Documentos falla al subir | Crearlo a mano en PROD, privado desde el primer día (la nota `Q-17` del 9-sep ya quedó vieja: DEV lo tiene privado), con límite de tamaño y tipos |
| D5 | **Lo editado en la base y no en el código**: la matriz de permisos (§40) y la política comercial se cambian en DEV desde la interfaz o por SQL | PROD arrancaría con la matriz del seed, no con la que el negocio ya ajustó | Antes de sembrar, comparar la matriz y la política de DEV contra el seed y decidir cuál va (pregunta 5 abajo) |

## 3. El plan paso a paso

| # | Paso | Dónde | Cómo se verifica |
|---|---|---|---|
| 0 | **Preparar el repo**: recuperar D1, migración D2, `db:seed:catalogos` D3, `aplicar-migraciones.mjs` con `--env <archivo>` y `--dry-run`, `.env.production.local` (ya está ignorado por `.env*.local`) | Desde aquí | `prisma migrate diff --from-url DEV --to-schema-datamodel` vacío; pruebas verdes |
| 1 | **Crear el proyecto PROD**: misma organización, nombre `avattar-crm-prod`, región `us-east-1` (la misma; la latencia desde México está medida), Postgres 17, plan Pro (un proyecto gratuito se pausa tras una semana sin uso y no tiene respaldos), contraseña de base generada y guardada en el gestor de contraseñas. Anotar URL, anon key, service_role y las dos cadenas del pooler | Consola de Supabase | El proyecto responde; el ref nuevo queda apuntado |
| 2 | **Esquema**: `node aplicar-migraciones.mjs --env .env.production.local --dry-run`, revisar, y sin `--dry-run`. Aplica las 7 migraciones en orden sobre una base vacía | Desde aquí | `prisma migrate diff --from-url PROD --to-schema-datamodel` vacío; 33 tablas con RLS; extensiones en `extensions`; `get_advisors` sin hallazgos si el MCP está autorizado |
| 3 | **Datos iniciales**: `db:seed:catalogos` contra PROD: países y política comercial, permisos y matriz, pipelines y etapas, tipos de actividad, orígenes, roles de comité, motivos de pérdida, familias, pesos MEDDIC, y los perfiles de los primeros administradores (correo, nombre, rol, países). Nada de cuentas, personas, oportunidades, actividades, cotizaciones ni productos de demostración | Desde aquí | Conteos iguales a los de DEV en catálogos; cero en negocio; la matriz coincide con lo decidido en D5 |
| 4 | **Storage**: bucket `documentos`, privado, límite 25 MB, tipos PDF, Word, Excel, PowerPoint e imágenes. No se migran los 7 archivos de DEV: son de prueba | Consola de Supabase | Subir y descargar un documento desde la app en el paso 7 |
| 5 | **Autenticación**: Authentication › Providers › Azure con el client id y secret (el mismo registro de Entra o uno nuevo, pregunta 6) y el Tenant URL de Avattar para que solo entre gente del tenant; en el portal de Entra, agregar el redirect URI `https://<ref-prod>.supabase.co/auth/v1/callback` (cada proyecto tiene el suyo); Site URL = dominio productivo; Redirect URLs `https://<dominio>/**`; apagar el proveedor de correo y contraseña y los registros abiertos | Consola de Supabase y portal de Entra (administrador del tenant) | El primer administrador entra con Microsoft y queda vinculado por correo (`CU-01.1`); alguien sin perfil cae en «Acceso no configurado» |
| 6 | **Vercel**: proyecto nuevo `avattar-crm` ligado a la rama `main` (el de prueba sigue en `develop`); variables de producción: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (6543 con `?pgbouncer=true`), `DIRECT_URL` (5432); `AZURE_*` solo si el calendario va en producción (pregunta 7); dominio `crm.avattar.com` o el que se decida, con su DNS, y agregado a Site URL y Redirect URLs del paso 5 | Consola de Vercel y DNS | `GET /salud` del dominio dice base alcanzable y variables presentes |
| 7 | **Humo**: entrar como el primer administrador; dar de alta a los demás (plan de pruebas, bloque 11); crear un producto real, una cuenta real y la primera oportunidad real supervisados; subir un documento. Nada con prefijo QA: en PROD todo lo que se captura es real desde el día uno (`INV-15`: lo borrado se queda marcado) | Navegador | Bloque 11 del plan de pruebas en verde; `/salud` limpio |
| 8 | **Operación**: cambios siempre `develop` → prueba → `main` → PROD; migraciones a PROD con el mismo script y `--dry-run`, nunca editar una aplicada; respaldos diarios del plan Pro (7 días) y decidir si se contrata recuperación a un punto en el tiempo; quién tiene acceso al proyecto PROD en la organización de Supabase; rotar `service_role` y la contraseña de base cuando alguien con acceso se va; anotar en el ADR los dos refs y qué variable apunta a cuál | Consola de Supabase, ADR | Un release de prueba completo antes del primero real |

## 4. Qué viaja a PROD y qué no

| Viaja | No viaja |
|---|---|
| El esquema completo: 7 migraciones, RLS, extensiones, índices | Los 14 usuarios de DEV: en PROD los perfiles nacen en Administración y se vinculan por correo en el primer ingreso; los ids de `auth.users` son otros |
| Catálogos: países, política comercial, permisos y matriz, pipelines y etapas, tipos de actividad, orígenes, roles de comité, motivos de pérdida, familias, pesos MEDDIC | Cuentas, personas, oportunidades, actividades, cotizaciones, hitos, objetivos, bitácora: son el escenario §15 |
| Los primeros administradores (perfil sin identidad, listos para el primer ingreso) | Los 10 productos de demostración, salvo que el negocio entregue su catálogo real para sembrarlo (pregunta 4) |
| La configuración del bucket (privado, límites), no sus archivos | Los 7 documentos de DEV |
| El proveedor de Entra ID, con el redirect URI nuevo | Las llaves y contraseñas de DEV: PROD tiene las suyas, en `.env.production.local` y en Vercel, nunca en el repo |

## 5. Implicaciones y riesgos

| Implicación | Qué hacer |
|---|---|
| **Dos ambientes contra el mismo registro de Entra.** El callback de Supabase cambia con el ref del proyecto, así que el registro debe listar los dos redirect URIs. Un registro nuevo para PROD aísla el secreto pero vuelve a pedir el consentimiento del administrador del tenant | Decidir en la pregunta 6; en los dos casos lo hace el administrador de Entra, no esta máquina |
| **El calendario de Microsoft 365 escribe en calendarios reales.** DEV está apagado (sin `AZURE_*`); si PROD lo enciende, cada actividad agendada aparece en el calendario del responsable | Mantener DEV apagado; encender PROD solo cuando el negocio lo pida (pregunta 7) |
| **Los ids de identidad no se copian.** `users.entra_object_id` guarda el id de `auth.users` del proyecto, que es distinto en PROD (análisis del 6-oct) | No copiar `users`; sembrar perfiles con `entra_object_id` nulo y dejar que el primer ingreso vincule por correo |
| **PROD arranca vacío de negocio y todo lo que se capture es real.** No hay borrado duro (`INV-15`) | El plan de pruebas se ejecuta en TEST; en PROD, altas supervisadas |
| **Dos juegos de secretos.** Contraseña de base, `service_role` y anon key por proyecto; `.env.production.local` en esta máquina | Gestor de contraseñas; `.env*.local` ya está en `.gitignore`; nunca pegar la cadena de PROD en `.env.local` |
| **Equivocarse de base.** El mismo script sirve para DEV y PROD; la diferencia es un archivo de variables | `--env` obligatorio para PROD, `--dry-run` primero, y el script imprime el host al que va a escribir antes de hacerlo |
| **El historial de migraciones manda.** Si DEV y PROD no tienen las mismas versiones, el siguiente `db push` falla o aplica de más | Resolver D1 antes de crear PROD; después, ninguna migración se aplica a mano sin su archivo |
| **Superficie de Supabase que la app no usa.** La app nunca llama a la API de datos (PostgREST): todo pasa por Prisma. Exponer `public` en la API de PROD es superficie sin uso | En PROD, quitar `public` de los esquemas expuestos de la API (Settings › API); RLS deny-all sigue como respaldo |
| **Región y latencia.** Los usuarios están en México, Colombia y Chile; `us-east-1` ya está medido desde México (`docs/latencia.md`) y no hay región más cercana para los tres países | Misma región que DEV |
| **Costo.** Plan Pro 25 USD al mes por organización con un proyecto incluido en cómputo Micro; cómputo Small ~15 USD si hace falta; recuperación a un punto en el tiempo es un extra de ~100 USD al mes (aproximado; confirmar en la página de precios). Vercel: el plan Hobby no permite uso comercial, el Pro cuesta 20 USD por miembro | Presupuestar unos 35 a 50 USD al mes en Supabase más Vercel Pro |
| **DEV en plan gratuito.** Si DEV está en el plan gratuito, se pausa tras una semana sin uso; al compartir organización con PROD en Pro, pasa a contar como segundo proyecto | Revisar en qué plan está DEV al crear la organización o el proyecto |

## 6. Tiempo

| Tramo | Tiempo |
|---|---|
| Paso 0, preparar el repo (D1, D2, D3, script, pruebas) | Medio día |
| Pasos 1 a 3, proyecto, esquema y datos | Dos horas |
| Pasos 4 a 6, bucket, Entra, Vercel y DNS | Dos horas de trabajo más las esperas del administrador de Entra y de la propagación de DNS |
| Paso 7, humo | Una hora |
| Total | Un día de trabajo técnico, repartido según las esperas |

## 7. Lo que necesito que decidas

1. Nombre del proyecto y dominio productivo (`crm.avattar.com`).
2. Plan y región: Pro en `us-east-1` es la recomendación.
3. Quiénes son los primeros administradores (correos de Microsoft).
4. Productos: ¿PROD arranca con el catálogo real, o vacío hasta la carga masiva?
5. Matriz de permisos y política comercial: ¿la del seed o la que hoy tiene DEV?
6. Entra ID: ¿el mismo registro de aplicación con dos redirect URIs, o uno nuevo para PROD?
7. Calendario de Microsoft 365: ¿encendido en PROD desde el primer día?
8. Vercel: ¿proyecto nuevo ligado a `main` (recomendado) o el mismo proyecto con dos ramas?

Con las respuestas 1 a 3 se puede ejecutar el paso 0 y dejar listo el repo; el resto decide los
pasos 3, 5 y 6.


## 8. Estado de la ejecución (12 de octubre de 2026)

| Paso | Estado |
|---|---|
| 0 · Preparar el repo | **Hecho.** D1, D2 y D3 corregidas; ver `decisiones-pendientes.md` §50 |
| 1 · Crear el proyecto | **Hecho por el negocio.** `luujtoutcpswhewsxmja`, región `us-east-1`, Postgres 17.11 |
| 2 · Esquema | **Hecho.** 9 migraciones; 33 tablas con RLS y 0 políticas; extensiones en `extensions`; `migrate diff` vacío |
| 3 · Datos iniciales | **Hecho.** Los 13 catálogos con los mismos conteos que desarrollo; 0 en las 12 tablas de negocio; `miguel.maldonado@` y `alejandro.salazar@` como ADMINISTRADOR en MX/CO/CL, sin identidad todavía |
| 4 · Storage | **Hecho**, y mejor de lo planeado: el bucket dejó de crearse a mano y ahora lo pone la migración `20261012130000_bucket_documentos.sql`, privado, en los dos ambientes |
| 5 · Entra ID | **Hecho.** Mismo tenant y registro que desarrollo, con el callback del proyecto nuevo; verificado siguiendo el redirect del endpoint público de autorización |
| 6 · Vercel y dominio | **Pendiente** |
| 7 · Humo | **Pendiente** |
| 8 · Operación | **Pendiente** |

### Lo que falta, y quién lo hace

**Entra ID (paso 5) · hecho.** Producción redirige al mismo tenant y al mismo registro de
aplicación que desarrollo, con su propio callback
(`https://luujtoutcpswhewsxmja.supabase.co/auth/v1/callback`). Comprobado sin credenciales con
`GET /auth/v1/authorize?provider=azure`, que devuelve el `client_id` y el `redirect_uri` reales:
es la única forma de distinguir «configurado» de «configurado en el proyecto correcto».

**Vercel (paso 6).** Proyecto nuevo ligado a `main`, con `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (6543 con
`?pgbouncer=true`) y `DIRECT_URL` (5432) del proyecto nuevo. Las dos llaves salen de Project
Settings → API y no están en esta máquina. Más el dominio, su DNS, y agregarlo al Site URL y a
los Redirect URLs de Supabase.

**Humo (paso 7).** Bloque 11 del plan de pruebas: el primer administrador entra, da de alta a los
demás, se crea un producto y una cuenta reales, se sube un documento.

**Catálogo de productos.** Sigue pendiente de que el negocio lo entregue; producción arrancó sin
productos a propósito.

### Lo que se aprendió ejecutando

- **La región del pooler se midió, no se supuso.** Supabase reparte los proyectos nuevos entre
  regiones y prefijos (`aws-0-`, `aws-1-`); se probaron ocho candidatas hasta que una autenticó.
- **El pooler en modo sesión de un proyecto nuevo corta en quince conexiones.** El seed sembraba los
  catálogos con `Promise.all` y murió con `EMAXCONNSESSION`. Ahora van en serie.
- **El bucket se volvió migración**, que era la forma correcta de cerrar D4 y `Q-17` de una vez.
