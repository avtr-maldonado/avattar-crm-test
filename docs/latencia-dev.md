# Latencia en desarrollo (`pnpm dev`)

Medido el 10 de septiembre de 2026 en la laptop de desarrollo: HP con i7-1255U
(10 núcleos, serie U), 15.6 GB de RAM, NVMe SK hynix BC711, Windows 11 Pro,
Node 22.19, pnpm 11.25, Next 15.5.24 **con webpack** (`next dev` sin
`--turbopack`).

Complementa a `latencia.md`, que mide la red hacia Supabase. Esto mide la
máquina y el arranque. Son problemas distintos y se arreglan en lugares
distintos, y **ninguno se arregla con `next build`**: el requisito es que el
servidor de desarrollo sea usable para probar, no que producción sea rápida.

## Lo que se veía

Del propio log de `pnpm dev`, recuperado de la sesión anterior:

| Evento | Tiempo |
|---|---:|
| `Compiled /oportunidades` | **15.3 s** |
| `Compiled successfully` | 27.0 s · 10.3 s · 9.9 s · 7.9 s |
| `Compiled /middleware` | 3.3 s |
| `GET /login 200` | **16.0 s** (con compilación) · 5.3 s |
| `GET /oportunidades 200`, ya compilado | 2.4 – 2.6 s |
| `GET / 307` — solo redirige a `/login` u `/oportunidades` | **3.2 s** |
| `POST /oportunidades` (acciones de servidor, caliente) | 66 – 226 ms |
| «Fast Refresh had to perform a full reload due to a runtime error» | **18 veces** |
| `EPERM: operation not permitted, open` / `rename '…\.next\…'` | 6 veces |

Dos lecturas inmediatas. Las acciones de servidor en caliente tardan lo que
tarda la red a Virginia: **la base no es el problema**. Y un redirect que no
consulta nada tarda 3.2 s: el costo está antes de llegar al código de negocio.

## Cuatro causas, cada una con su huella

### 1 · Bitdefender escanea cada archivo que se escribe — 6.7 ms por archivo

Hay **dos antivirus en tiempo real**: Bitdefender Endpoint Security Tools
(`EPSecurityService`, 651 MB residentes) y Windows Defender. Sus exclusiones no
se pueden leer desde la sesión (`Get-MpPreference` devuelve `0x800106ba`: las
administra TI).

La huella es inconfundible. Misma carpeta, mismo disco:

```
1 archivo de 6 MB               7 ms
1 500 archivos de 4 KB     10 074 ms   ← los mismos 6 MB en total
sobrescribir esos 1 500     9 255 ms
```

El costo no es por byte —el disco entrega 6 MB en 7 ms— sino **por archivo**,
unos 6.7 ms fijos por cada `open`+`write`+`close`. Eso es un escaneo sincrónico
en el acceso. Y se paga igual dentro y fuera de OneDrive (10 106 ms contra
10 164 ms), lo que descarta a OneDrive como causa de *esto*.

webpack escribe cientos de archivos por compilación —chunks, manifiestos,
paquetes de caché— y vuelve a escribir en cada recarga. A 6.7 ms cada uno, una
compilación paga entre 1 y 4 s solo en esperar al antivirus.

**Corrección:** pedir a TI exclusiones de Bitdefender para `node_modules`,
`.next`, `%LOCALAPPDATA%\pnpm` y el proceso `node.exe`. No hay nada que hacer
en el código.

### 2 · OneDrive está en la ruta de cada lectura — 7 veces más lento

El repositorio vivía en `C:\Users\…\OneDrive - AVATTAR\Escritorio\avattar-crm`
cuando se midió esto; el 10 de septiembre de 2026 se movió a `C:\dev\avattar-crm`.
**Cada carpeta y cada archivo —incluidos `.next`, `node_modules` y `.git`—
llevan el atributo `ReparsePoint`**: el controlador de archivos en la nube de
OneDrive intercepta cada `stat`, `open` y `rename`. `node_modules` son 37 107
archivos (989 MB); `.next`, 350 MB.

Misma máquina, mismo antivirus, mismo NVMe; solo cambia la ruta:

```
stat de 8 000 archivos en repo/node_modules (OneDrive)      3 011 ms →  2 657 archivos/s
stat de 7 195 archivos en una copia fuera de OneDrive         385 ms → 18 688 archivos/s
copiar next/dist (7 195 archivos) fuera de OneDrive       50 946 ms
renombrar 1 500 archivos dentro / fuera                     5 132 ms / 3 499 ms
```

Resolver módulos —lo que webpack hace decenas de miles de veces al arrancar y
al recompilar— corre a un séptimo de la velocidad del disco.

Pero el daño mayor no es la lentitud: es el `EPERM` en `rename` dentro de
`.next`. Cuando OneDrive tiene tomado un archivo que webpack quiere renombrar
para confirmar su caché, la escritura falla, **la caché se descarta y la
siguiente compilación vuelve a ser fría**. Por eso `Compiled /oportunidades in
15.3s` se repite en vez de bajar a 1 – 2 s, que es lo que hace una recompilación
incremental sana.

**Corrección:** mover el repositorio fuera de OneDrive, por ejemplo a
`C:\dev\avattar-crm`. El respaldo del código es git, no OneDrive, y OneDrive
nunca fue el respaldo de `node_modules`. Si tiene que quedarse ahí por política,
la alternativa parcial es dejar `node_modules` y `.next` como *junctions* a una
carpeta fuera de OneDrive; corrige las escrituras, no las lecturas del código
fuente.

### 3 · webpack, no Turbopack

`"dev": "next dev"`. Next 15.5 trae Turbopack estable para desarrollo y aquí no
está activado. Vercel documenta arranques hasta 76 % más rápidos y Fast Refresh
hasta 96 % más rápido; además escribe muchos menos archivos por compilación,
así que **atenúa también las causas 1 y 2**.

Compatibilidad revisada: `next.config.ts` no tiene `webpack()`, Tailwind 3 va
por PostCSS, `next/font/google` y Prisma (externalizado) funcionan, y
`experimental.authInterrupts` no depende del empaquetador.

**Corrección:** `"dev": "next dev --turbopack"`. Sin medir aquí porque el
servidor de desarrollo lo levanta quien desarrolla; medir el primer `Compiled`
después del cambio.

### 4 · Cada navegación hace seis viajes de red en serie desde México

El piso de red a `us-east-1` es **287 ms por viaje** (`latencia.md`). Lo que
una navegación a `/oportunidades` hace hoy, en orden:

```
middleware   supabase.auth.getUser()          166 ms   red (Supabase Auth)
layout       supabase.auth.getUser()          166 ms   red — otra vez: el middleware es otro runtime
             prisma.user.findFirst            298 ms   perfil
             prisma.rolePermission.findMany   437 ms   permisos del rol — en serie tras el perfil
             contadoresDeNavegacion           297 ms ┐ en paralelo con la página
página       5 lecturas en Promise.all        437 ms ┘
             listOpportunities                657 ms   después de las 5
                                          ─────────
ruta crítica                              ≈ 2.0 – 2.4 s     ← coincide con GET /oportunidades 200 in 2429ms
```

El detalle de oportunidad es peor: Prisma resuelve cada relación anidada con su
propia consulta, once viajes, 1.7 s (`latencia.md`). El grafo del código
confirma el ancho: `DetalleOportunidadPage` alcanza **15 lectores** de
`lib/scope`, la ficha de organización 13, `/oportunidades` 9.

Dos agravantes que sí son de desarrollo:

- El `matcher` del middleware deja pasar `/_next/webpack-hmr`,
  `/__nextjs_original-stack-frame`, `/__nextjs_font/*`, `/_next/data/*` y cada
  *prefetch* `?_rsc=`. **Cada uno paga un `getUser()` a Virginia** que no
  autoriza nada.
- Las 18 recargas completas por «runtime error»: cada una vuelve a pagar la
  ruta completa. Un error de consola en desarrollo cuesta 2.4 s, no cero.

**Correcciones,** todas benefician también a producción:

| | Cambio | Ahorro por navegación | Costo |
|---|---|---:|---|
| a | `getClaims()` en vez de `getUser()`, en middleware y en `getSessionResult`. El proyecto firma con **ES256** (verificado en `/.well-known/jwks.json`): la firma se verifica en local, sin red. supabase-js 2.112 ya lo trae | −332 ms, y −166 ms por cada request de desarrollo | dos líneas |
| b | `matcher` que excluya `_next/` y `__nextjs` completos | quita los `getUser` que no autorizan nada | una línea |
| c | Matriz de permisos por rol en caché de proceso (TTL 60 s; invalidar al editar catálogos) | −437 ms | `lib/auth/session.ts` |
| d | `relationJoins` en Prisma: las relaciones anidadas viajan en **una** consulta | detalle: −1.2 s (11 → 2 viajes) | una línea en `schema.prisma` + `prisma generate` **con el dev apagado** (el DLL queda tomado) |
| e | `contadoresDeNavegacion` dentro de `<Suspense>` | el layout deja de esperar 297 ms | un componente |
| f | **Base local para desarrollo**: el piso pasa de 287 ms a ~1 ms por viaje | `/oportunidades` 2.4 s → ~0.4 s; detalle 1.7 s → ~0.1 s | ver abajo |

Sobre (f). Docker 28 está instalado (Desktop apagado), Supabase CLI 2.109 está
disponible vía pnpm, y la migración vigente **no referencia `auth.*` ni
`extensions.*`**: basta un `postgres:17` plano, o el instalador nativo de
PostgreSQL 17 si la RAM aprieta —la máquina ya está comprimiendo memoria con
Bitdefender, Edge WebView y Chrome arriba, y Docker Desktop cuesta ~2 GB—.
`.env.local` sobreescribe `DATABASE_URL`/`DIRECT_URL`; la identidad sigue en
Supabase (con `getClaims` no cuesta red) y Storage sigue remoto por
`service_role`. El seed está en `prisma.config.ts` (`tsx prisma/seed.ts`).

## Qué no es

- **No es la base.** Las acciones de servidor responden en 66 – 226 ms en
  caliente. El SQL está bien; los viajes son muchos y la red es larga.
- **No es `next build`.** Producción no es la corrección de desarrollo, y está
  explícitamente fuera del alcance.
- **No es la máquina, pero la máquina no ayuda.** Un i7 serie U en el plan «HP
  Optimized», 15.6 GB con compresión de memoria activa y dos antivirus: cada
  causa de arriba pesa más de lo que pesaría en un escritorio.

## Orden sugerido

Por impacto sobre el tiempo que se pasa esperando, y por costo:

1. **Mover el repo fuera de OneDrive** (causa 2). Cero código. Es lo que deja
   sobrevivir la caché de webpack. **Hecho el 10 de septiembre de 2026:** el repo
   está en `C:\dev\avattar-crm`.
2. **`--turbopack`** (causa 3). Una bandera. **Hecho el 11 de septiembre de 2026.**
3. **`getClaims` + `matcher`** (4a, 4b). Dos líneas cada uno. **Hecho el 11 de
   septiembre de 2026.**
4. **Exclusiones de Bitdefender** (causa 1). Depende de TI; pedirlo hoy.
5. **`relationJoins` y caché de permisos** (4c, 4d). **Hecho el 11 de septiembre
   de 2026**; `relationJoins` queda escrito en el schema y se activa al correr
   `pnpm db:generate` con el dev apagado. También 4e, los contadores en
   `Suspense`, y la lista de P-01 en paralelo con las demás lecturas. Detalle en
   «Correcciones aplicadas», abajo.
6. **Base local** (4f) si después de lo anterior el piso de 287 ms sigue
   siendo el cuello. Casi seguro lo será para el detalle.

## Correcciones aplicadas (11 de septiembre de 2026)

Con el repo ya fuera de OneDrive se aplicaron las palancas de código de este
documento. Ninguna cambia el comportamiento funcional; todas quitan viajes de
red o esperas en serie.

| | Cambio | Dónde |
|---|---|---|
| 3 | `next dev --turbopack` | `package.json` |
| 4a | `getClaims()` en vez de `getUser()`: la firma ES256 se verifica en local con el JWKS (una clave EC P-256, traída una vez por proceso), sin viaje al servidor de autenticación. Si el token expiró lo renueva por dentro y las cookies salen por `setAll`, así que el middleware sigue haciendo su trabajo | `middleware.ts`, `lib/auth/session.ts` |
| 4b | `matcher` que excluye `_next/` y `__nextjs` completos. Los prefetch `?_rsc=` siguen pasando, pero ya no cuestan red | `middleware.ts` |
| 4c | Matriz de permisos por rol en caché de proceso, TTL 60 s. `invalidarPermisosEnCache()` queda para cuando exista el editor de `RolePermission` | `lib/auth/session.ts` |
| 4d | `previewFeatures = ["relationJoins"]`. **Se activa al correr `pnpm db:generate` con el dev apagado**; hasta entonces el cliente sigue en `query` | `prisma/schema.prisma` |
| 4e | Los contadores de la barra viajan como promesa y se resuelven dentro de `Suspense` (`ContadorRubro`); el layout ya no los espera | `app/(app)/layout.tsx`, `components/ui/` |
| — | En P-01, `listOpportunities` se encadena solo a `getCountry` y corre en paralelo con las otras cuatro lecturas, en vez de después de las cinco | `app/(app)/oportunidades/page.tsx` |

Lo que queda en la ruta crítica de cada request: **un** viaje a la base por el
perfil (`prisma.user.findFirst`) más las lecturas de la propia pantalla. Antes
eran cuatro en serie antes de tocar el negocio.

### `relationJoins`, medido

Contra la base real, con la oportunidad que más relaciones tiene
(`OPP-2026-00490`) y la misma forma de `getOpportunityDetail`. Mediana con la
conexión caliente: cinco corridas con `join`, diez con `query`. Piso de red ese
día: 303 ms por viaje.

| Estrategia | Consultas SQL | Detalle de P-02 |
|---|---:|---:|
| `query` (la de hoy) | 24 | **2 769 ms** |
| `join` (`relationJoins`) | 4 | **327 ms** |

No eran once viajes, eran veinticuatro: cada relación anidada dentro de otra
—`committeeRole` dentro de `people`, `fromStage`, `toStage` y `byUser` dentro de
`stageHistory`— suma la suya. Con `join` Postgres arma el JSON de su lado y el
resultado viaja una vez.

Se midió con un cliente generado aparte, fuera del repo, porque el dev tenía
tomado el motor. Al correr `pnpm db:generate`, `pnpm test` debe pasar igual: la
semántica es la misma, cambia el SQL.

### Lo que sigue

- **Exclusiones de Bitdefender** (causa 1). Depende de TI. Sin ellas cada
  compilación sigue pagando 6.7 ms por archivo escrito.
- **Base local** (4f). Con todo lo anterior, el piso de ~300 ms por viaje sigue
  siendo el costo de cada lectura; una Postgres local lo baja a ~1 ms. Es un
  cambio de entorno, no de código: `DATABASE_URL` y `DIRECT_URL` en
  `.env.local`, aplicar `supabase/migrations/` y `pnpm db:seed`.
- **Las recargas completas por «runtime error».** No se pueden diagnosticar sin
  el servidor arriba. En la siguiente sesión de pruebas, guardar la consola del
  navegador en la primera que aparezca: cada una vuelve a pagar la ruta entera.

## Reproducir

La medición decisiva cabe en unas líneas de Node; correrla en cualquier carpeta:

```js
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("bench", { recursive: true });
let t = performance.now();
writeFileSync("bench/grande.bin", Buffer.alloc(6 * 1024 * 1024, 1));
console.log("1 × 6 MB     ", (performance.now() - t).toFixed(0), "ms");
t = performance.now();
for (let i = 0; i < 1500; i++) writeFileSync(`bench/c${i}.js`, Buffer.alloc(4096, 1));
console.log("1500 × 4 KB  ", (performance.now() - t).toFixed(0), "ms");
```

Si el segundo número es cientos de veces el primero, hay un escáner por
archivo en el camino. Para OneDrive, comparar un `stat` recursivo de
`node_modules/next` contra una copia del mismo árbol en `%LOCALAPPDATA%`.
