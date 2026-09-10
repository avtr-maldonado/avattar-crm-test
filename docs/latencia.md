# Latencia contra Supabase

Medido el 2 de septiembre de 2026, desde una laptop en México contra el
proyecto `cjwahoscedjnjgalmyzu` en `us-east-1`, a través del pooler de
transacción. Mediana de cinco corridas, con la conexión ya caliente.

| Consulta | Mediana |
|---|---:|
| `select 1` | **287 ms** |
| Listado de 14 oportunidades con su etapa | 401 ms |
| Detalle completo de P-02 | **1702 ms** |

## Cómo leer estos números

**Los 287 ms del `select 1` son red, no base.** Es el viaje de ida y vuelta de
México a Virginia. Todo lo demás se mide contra ese piso: el listado hace
~114 ms de trabajo real, y el detalle ~1.4 s.

**El detalle no es lento por el SQL: es lento por los viajes.** Prisma resuelve
cada relación anidada con su propia consulta, y P-02 pide once —organización,
personas, pipeline, etapas, propietario, MEDDIC, cotizaciones, hitos,
documentos, autorizaciones, historial—. Once viajes de ~130 ms explican el
segundo y medio.

## Qué NO hacer con esto

No reestructurar la consulta persiguiendo este número. **En producción el
servidor de Next vive junto a la base**, no a 3 000 km: ahí el viaje baja de
287 ms a unos pocos milisegundos y el mismo detalle queda muy por debajo del
segundo. Optimizar contra la latencia de una laptop de desarrollo es optimizar
contra una condición que la aplicación real no va a tener.

## Cuándo sí preocuparse

El requisito no funcional §13 pide **el pipeline de 500 oportunidades en menos
de 2 s**. Eso hay que medirlo con 500 filas y desde un servidor co-ubicado, no
desde aquí. Cuando exista un ambiente desplegado, repetir esta medición ahí y
actualizar esta tabla; si el listado con 500 filas se acerca a los 2 s **con la
red descontada**, entonces sí hay trabajo de consulta que hacer.

## Reproducir

Las pruebas de integración llevan `testTimeout: 20_000` en `vitest.config.ts`
por esta razón, no porque algo esté mal.

## Y la máquina

Todo lo de arriba es red. Lo que hace lento a `pnpm dev` en la laptop —OneDrive
en la ruta del repo, el antivirus por archivo, webpack sin Turbopack, y los
viajes en serie por navegación— está medido aparte en `latencia-dev.md`.
