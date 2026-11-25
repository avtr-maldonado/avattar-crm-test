#!/usr/bin/env bash
# Publica en la VPS un commit de main (decisiones §70; docs/OPERACION.md). Lo corre el flujo
# «Publicar» de GitHub por SSH; la llave de despliegue solo puede ejecutar este archivo, y lo que
# manda (el sha) llega en SSH_ORIGINAL_COMMAND. A mano: bash deploy/deploy.sh <sha de 40 caracteres>
#
# Pasos: trae el commit, construye la imagen, respalda la base si hay migraciones pendientes, las
# aplica, levanta la app y espera a que esté sana. Si la construcción o una migración fallan, la app
# que corre no se toca; si la app nueva no queda sana, regresa a la versión anterior. Nunca imprime
# variables. Calcado del de AVTR Tempo.
set -euo pipefail

# El Postgres del Supabase del CRM (la VPS tiene otros Supabase aparte).
readonly DB_CONTAINER="supabase-crm-db"
readonly BACKUP_DIR="/opt/respaldos/avattar-crm"
readonly HEALTH_TIMEOUT=240

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# El sha es la última palabra de la petición: con la llave limitada a este script llega solo, y con
# una llave sin límite llega al final de «bash …/deploy.sh <sha>».
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-$*}
readonly TARGET="${!#:-}"
if [[ ! "$TARGET" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Uso: deploy.sh <sha de 40 caracteres>" >&2
  exit 2
fi

# Una publicación a la vez.
exec 9>/tmp/avattar-crm-deploy.lock
flock -n 9 || { echo "Ya hay una publicación en curso." >&2; exit 1; }

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "La carpeta tiene cambios locales en archivos versionados: no se publica encima." >&2
  exit 1
fi

readonly PREVIOUS="$(git rev-parse HEAD)"
git fetch --quiet origin
if ! git merge-base --is-ancestor "$TARGET" origin/main 2>/dev/null; then
  echo "El commit pedido no está en main." >&2
  exit 2
fi

psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# El Supabase autoalojado no trae la tabla donde la CLI anota las migraciones: se crea con la misma
# forma, para que la historia se lea igual que en los proyectos de la nube.
ensure_migrations_table() {
  psql_db -q <<'SQL' >/dev/null
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL
}

# Las migraciones de supabase/migrations/ que la base aún no tiene anotadas, en orden.
pending_migrations() {
  local applied file base version
  applied="$(psql_db -At -c 'select version from supabase_migrations.schema_migrations' </dev/null)" || return 1
  for file in supabase/migrations/*.sql; do
    base="$(basename "$file" .sql)"
    version="${base%%_*}"
    grep -qx "$version" <<<"$applied" || echo "$file"
  done
}

# Cada una va en una transacción junto con su anotación: o entra completa o no entra.
apply_migrations() {
  # Dentro de «apply_migrations || abort», set -e no aplica: cada falla regresa a mano.
  local pending file base version name count=0
  ensure_migrations_table || return 1
  pending="$(pending_migrations)" || return 1
  if [[ -z "$pending" ]]; then
    echo "Sin migraciones pendientes."
    return 0
  fi

  # Respaldo antes de tocar la base: restaurarlo es la vuelta atrás de una migración (OPERACION.md).
  mkdir -p "$BACKUP_DIR"
  local backup
  backup="$BACKUP_DIR/antes-de-${TARGET:0:7}-$(date +%Y%m%d-%H%M%S).dump"
  docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc >"$backup" || return 1
  echo "Respaldo previo a migrar: $(basename "$backup")."

  while IFS= read -r file; do
    base="$(basename "$file" .sql)"
    version="${base%%_*}"
    name="${base#*_}"
    if [[ ! "$version" =~ ^[0-9]{14}$ || ! "$name" =~ ^[a-z0-9_]+$ ]]; then
      echo "Nombre de migración inesperado: $base" >&2
      return 1
    fi
    echo "Aplicando la migración $base…"
    {
      cat "$file"
      printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" \
        "$version" "$name"
    } | psql_db --single-transaction -q -f - >/dev/null || return 1
    count=$((count + 1))
  done <<<"$pending"
  psql_db -q -c "notify pgrst, 'reload schema'" </dev/null >/dev/null
  echo "Migraciones aplicadas: $count."
}

app_health() {
  local id
  id="$(docker compose ps -q app 2>/dev/null | head -n 1)"
  [[ -z "$id" ]] && { echo "sin-contenedor"; return; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id"
}

wait_healthy() {
  local waited=0
  while ((waited < HEALTH_TIMEOUT)); do
    [[ "$(app_health)" == "healthy" ]] && return 0
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# Antes de levantar nada: si algo falla aquí, sigue corriendo la versión anterior.
abort() {
  echo "$1 Producción sigue en ${PREVIOUS:0:7}." >&2
  git checkout --quiet --detach "$PREVIOUS"
  exit 1
}

echo "Publicando ${TARGET:0:7} (antes: ${PREVIOUS:0:7})…"
git checkout --quiet --detach "$TARGET"
docker compose build app || abort "La imagen no se pudo construir."
apply_migrations || abort "Una migración falló y no se aplicó."

if docker compose up -d app && wait_healthy; then
  echo "Publicado ${TARGET:0:7}: la app está sana."
  docker image prune -f >/dev/null
  exit 0
fi

# Las migraciones ya aplicadas se quedan: deben ser compatibles con la versión anterior.
echo "La app no quedó sana (estado: $(app_health)). Regresando a ${PREVIOUS:0:7}…" >&2
docker compose logs --tail 40 app >&2 || true
git checkout --quiet --detach "$PREVIOUS"
if docker compose build app && docker compose up -d app && wait_healthy; then
  echo "Producción regresó a ${PREVIOUS:0:7}." >&2
else
  echo "No se pudo regresar a ${PREVIOUS:0:7}: revisa la VPS." >&2
fi
exit 1
