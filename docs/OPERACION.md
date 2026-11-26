# Operación · CRM Avattar en la VPS

Producción corre en la VPS de Avattar (decisiones §70), junto a AVTR Tempo y otros servicios. Este
documento es para quien opera: publicar, volver a una versión, respaldar y restaurar. La dirección de
la VPS no se escribe aquí: es `[IP_VPS]`.

| Pieza | Dónde | Puerto | Público por |
|---|---|---|---|
| App (Next.js standalone) | `/opt/avattar-crm`, contenedor `avattar-crm-app-1` | 3132 | `https://crm.avtr.solutions` |
| Supabase del CRM | `/opt/supabase-crm/docker`, contenedores `supabase-crm-*` | Envoy 8002; Postgres y pooler solo en `127.0.0.1` (5434, 6545) | `https://supabase-crm.avtr.solutions` |
| Respaldos | `/opt/respaldos/avattar-crm` | — | — |

HTTPS y los dominios los pone **Nginx Proxy Manager** (`https://npm-scouts.avtr.solutions`). El
firewall (`ufw` + `ufw-docker`) solo deja pasar 22, 80 y 443 y lo ya abierto para otros servicios:
**3132 y 8002 no se abren**; el proxy llega por la red interna de Docker.

La app habla con Postgres por la red `supabase-crm_default` (`supabase-crm-db:5432`), sin pasar por
el host; con Auth y Storage, por la URL pública.

---

## 1. Publicar

### 1.1 Lo normal: merge a `main`

`CI` (lint, tipos, pruebas unitarias y de arquitectura, build) corre en cada PR y en cada push a
`main`. Cuando pasa en `main`, `Publicar` entra por SSH y corre `deploy/deploy.sh <sha>`:

1. Trae el commit y construye la imagen. Si falla, la app que corre no se toca.
2. Si hay migraciones pendientes, **respalda la base** (`antes-de-<sha>-<fecha>.dump`) y las aplica,
   cada una en una transacción con su anotación en `supabase_migrations.schema_migrations`.
3. Levanta la app y espera a que esté sana (`/login` → 200). Si no queda sana, regresa a la versión
   anterior. Las migraciones aplicadas se quedan: **toda migración debe ser compatible con la
   versión anterior de la app**.
4. Prueba de humo: `/login` 200, `/salud` 200 (base alcanzable) y `POST /mcp` 401.

### 1.2 A mano o para volver a una versión

GitHub → Actions → **Publicar** → *Run workflow* con el sha (40 caracteres) de un commit de `main`.
O en la VPS: `bash /opt/avattar-crm/deploy/deploy.sh <sha>`.

### 1.3 Variables de la app

`/opt/avattar-crm/.env` (permisos 600, nunca en git; forma en `.env.example`, sección VPS). Las
`NEXT_PUBLIC_*` se incrustan al construir: cambiarlas exige publicar otra vez, no basta reiniciar.

---

## 2. El Supabase del CRM

### 2.1 Instalación (una vez)

`deploy/supabase/instalar.sh` parte de la carpeta `docker/` del Supabase de Tempo (misma versión
oficial), sin sus datos, consultas, funciones ni `.env`; renombra a `supabase-crm`, genera secretos
nuevos y llaves asimétricas ES256 sin imprimirlos, y **no levanta nada**.

```bash
AZURE_CLIENT_ID=… AZURE_TENANT_ID=… bash instalar.sh            # ensayo: valida y no deja nada
AZURE_CLIENT_ID=… AZURE_TENANT_ID=… bash instalar.sh --aplicar  # escribe /opt/supabase-crm
```

Después, a mano:

1. `AZURE_SECRET` en `/opt/supabase-crm/docker/.env` (el secreto del registro de Entra).
2. En Entra ID, en el registro de la app, la URI de redirección
   `https://supabase-crm.avtr.solutions/auth/v1/callback`.
3. DNS (Hostinger): registros A `crm` y `supabase-crm` a `[IP_VPS]`.
4. Nginx Proxy Manager: `supabase-crm.avtr.solutions` → `172.16.0.1:8002` con **Websockets** y
   certificado; `crm.avtr.solutions` → `172.16.0.1:3132` con certificado y, en *Advanced*, búferes
   grandes para los encabezados:

   ```nginx
   proxy_buffer_size 128k;
   proxy_buffers 4 256k;
   proxy_busy_buffers_size 256k;
   ```

   Sin esto, `/auth/callback` da **502** (`upstream sent too big header` en el registro del proxy):
   las cookies de sesión de Supabase que se fijan al entrar no caben en el búfer por omisión de
   Nginx. Se pone en la interfaz, no en el `.conf`: el proxy regenera sus archivos y lo pisaría.
5. `docker compose up -d` en `/opt/supabase-crm/docker`.

Revertir mientras no hay datos: `docker compose down -v` en esa carpeta y borrarla. No toca los otros
Supabase.

### 2.2 Llaves que usa la app

| En `/opt/avattar-crm/.env` | Sale de `/opt/supabase-crm/docker/.env` |
|---|---|
| `APP_URL` | `https://crm.avtr.solutions`, fijo: sin ella, el login redirige a `https://0.0.0.0:3132` (el host interno que ve el servidor detrás del proxy) |
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_PUBLIC_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_PUBLISHABLE_KEY` (la llave nueva; supabase-js la acepta donde iba la anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` |
| `DATABASE_URL`, `DIRECT_URL` | `postgresql://postgres:<POSTGRES_PASSWORD>@supabase-crm-db:5432/postgres` (la contraseña codificada en porcentaje si trae `@ # / :`) |

Los tokens se firman con ES256 (`JWT_KEYS`), así que `getClaims` y el MCP validan en local con el
JWKS, igual que en la nube.

### 2.3 Catálogos y administradores (una vez, y al agregar administradores)

```bash
cd /opt/avattar-crm
docker compose --profile herramientas build herramientas
docker compose run --rm herramientas pnpm db:seed:catalogos --env .env.produccion --dry-run \
  --admin "correo@avattar.com|Nombre Apellido|ADMINISTRADOR|MX,CO,CL"
# sin --dry-run para escribir
```

`db:seed:catalogos` **reescribe la matriz de permisos y la política comercial con las del código**:
en un ambiente donde Administración ya ajustó la matriz, respaldar antes (§3.2).

### 2.4 ¿Está al día?

```bash
docker compose run --rm herramientas sh -c \
  'pnpm exec prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script'
```

Vacío = el esquema coincide con `schema.prisma`.

---

## 3. Respaldos

### 3.1 Automáticos

- `deploy.sh` respalda la base antes de cada publicación con migraciones.
- Nocturno (cron de root, 03:15): `pg_dump -Fc` de la base y copia del volumen de Storage, 14 días.

```cron
15 3 * * * d=/opt/respaldos/avattar-crm; mkdir -p $d && docker exec supabase-crm-db pg_dump -U postgres -d postgres -Fc > $d/noche-$(date +\%Y\%m\%d).dump && tar -C /opt/supabase-crm/docker/volumes -czf $d/storage-$(date +\%Y\%m\%d).tgz storage && find $d -name 'noche-*' -o -name 'storage-*' -mtime +14 -delete
```

### 3.2 A mano

```bash
docker exec supabase-crm-db pg_dump -U postgres -d postgres -Fc > /opt/respaldos/avattar-crm/manual-$(date +%Y%m%d-%H%M).dump
```

### 3.3 Restaurar

Con la app detenida (`docker compose stop app` en `/opt/avattar-crm`):

```bash
docker exec -i supabase-crm-db pg_restore -U postgres -d postgres --clean --if-exists < <respaldo>.dump
```

`--clean` borra antes de crear: probar primero en una base aparte
(`createdb -U postgres prueba_restauracion` dentro del contenedor y `-d prueba_restauracion`).

---

## 4. Lo que no se hace

- No copiar `.env` de la VPS a un equipo ni a un chat: se generan y se leen en la VPS.
- No publicar Postgres ni el pooler en `0.0.0.0`, ni abrir 3132 u 8002 en `ufw`.
- No editar una migración ya aplicada: se escribe otra.
- No `docker compose down -v` en `/opt/supabase-crm` con datos: `-v` borra la base.
