#!/usr/bin/env bash
# Instala el Supabase autoalojado del CRM en la VPS (decisiones §70; docs/OPERACION.md §2).
#
#   AZURE_CLIENT_ID=… AZURE_TENANT_ID=… bash instalar.sh            # ensayo: no deja nada
#   AZURE_CLIENT_ID=… AZURE_TENANT_ID=… bash instalar.sh --aplicar  # escribe /opt/supabase-crm
#
# Parte de la carpeta docker/ del Supabase de AVTR Tempo (misma versión oficial, ya probada en esta
# VPS) sin sus datos, sus consultas, sus funciones ni su .env, y la renombra: proyecto
# `supabase-crm`, contenedores `supabase-crm-*`, Envoy en 8002 y Postgres y pooler solo en
# 127.0.0.1 (5434 y 6545), para no chocar con los otros Supabase. Genera secretos nuevos y llaves
# asimétricas (ES256) sin imprimirlos. Deja vacío AZURE_SECRET: lo pone a mano quien lo tiene.
#
# Nunca levanta contenedores ni toca los Supabase existentes. Revertir --aplicar mientras no se haya
# levantado: borrar /opt/supabase-crm.
set -euo pipefail

readonly ORIGEN="/opt/supabase-tempo/docker"
readonly DESTINO="/opt/supabase-crm"
readonly APP="https://crm.avtr.solutions"
readonly API="https://supabase-crm.avtr.solutions"
readonly PUERTOS=(8002 8445 5434 6545)

modo="${1:---ensayo}"
case "$modo" in
  --ensayo) base="$(mktemp -d /tmp/supabase-crm-ensayo.XXXXXX)" ;;
  --aplicar) base="$DESTINO" ;;
  *) echo "Uso: instalar.sh [--ensayo | --aplicar]" >&2; exit 2 ;;
esac
readonly DIR="$base/docker"

falla() { echo "No se instala: $1" >&2; [[ "$modo" == --ensayo ]] && rm -rf "$base"; exit 1; }

: "${AZURE_CLIENT_ID:?Falta AZURE_CLIENT_ID (el id del registro de Entra, no es secreto)}"
: "${AZURE_TENANT_ID:?Falta AZURE_TENANT_ID}"

# ── Precondiciones: nada de esto debe existir ya.
[[ -d "$ORIGEN" ]] || falla "no existe $ORIGEN."
if [[ "$modo" == --aplicar && -e "$DESTINO" ]]; then falla "$DESTINO ya existe."; fi
if docker ps -a --format '{{.Names}}' | grep -q '^supabase-crm-'; then falla "ya hay contenedores supabase-crm-*."; fi
if docker network ls --format '{{.Name}}' | grep -qx 'supabase-crm_default'; then falla "ya existe la red supabase-crm_default."; fi
for p in "${PUERTOS[@]}"; do
  if ss -ltnH "sport = :$p" | grep -q .; then falla "el puerto $p está ocupado."; fi
done
command -v rsync >/dev/null || falla "falta rsync."

# ── Copia sin datos ni nada propio de Tempo.
mkdir -p "$DIR"
rsync -a \
  --exclude '.env' \
  --exclude 'volumes/db/data' \
  --exclude 'volumes/storage/*' \
  --exclude 'volumes/snippets/*' \
  --exclude 'volumes/functions/upsert-user*' \
  --exclude 'volumes/functions/test' \
  "$ORIGEN/" "$DIR/"
chmod 700 "$base"
cd "$DIR"

# Nombres y puertos por omisión del compose (el .env decide, pero que ningún hueco caiga en Tempo).
sed -i \
  -e 's/supabase-tempo/supabase-crm/g' \
  -e 's/:-8001}/:-8002}/g' -e 's/:-8444}/:-8445}/g' \
  -e 's/:-5433}/:-5434}/g' -e 's/:-6544}/:-6545}/g' \
  docker-compose.yml
if grep -q 'tempo' docker-compose.yml; then falla "docker-compose.yml todavía menciona tempo."; fi

# ── .env: plantilla oficial, secretos nuevos y llaves asimétricas, sin imprimir nada.
cp .env.example .env
chmod 600 .env
sh utils/generate-keys.sh --update-env </dev/null >/dev/null
sh utils/add-new-auth-keys.sh --update-env </dev/null >/dev/null
# Los dos scripts dejan .env.old (con secretos y legible por todos): fuera.
rm -f .env.old
chmod 600 .env

# Escribe KEY=valor sin pasar el valor por sed (las URL llevan / y &).
fijar() {
  K="$1" V="$2" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; hecho = 0 }
    index($0, k "=") == 1 { print k "=" v; hecho = 1; next }
    { print }
    END { if (!hecho) print k "=" v }' .env >.env.nuevo
  mv .env.nuevo .env
  chmod 600 .env
}

fijar COMPOSE_FILE docker-compose.yml
fijar STUDIO_DEFAULT_ORGANIZATION "Avattar"
fijar STUDIO_DEFAULT_PROJECT "CRM Avattar"
# Puertos: Envoy público para Nginx Proxy Manager; Postgres y pooler solo para la propia VPS.
fijar API_GW_HTTP_PORT 8002
fijar KONG_HTTP_PORT 8002
fijar KONG_HTTPS_PORT 8445
fijar POSTGRES_HOST_PORT "127.0.0.1:5434"
fijar POOLER_PROXY_PORT_TRANSACTION "127.0.0.1:6545"
fijar POOLER_TENANT_ID supabase-crm
# URLs públicas, como las de Tempo.
fijar SITE_URL "$APP"
fijar ADDITIONAL_REDIRECT_URLS "$APP/auth/callback"
fijar API_EXTERNAL_URL "$API/auth/v1"
fijar SUPABASE_PUBLIC_URL "$API"
fijar GOTRUE_JWT_ISSUER "$API/auth/v1"
fijar JWT_EXPIRY 3600
# Solo se entra con Microsoft: el alta la hace el proveedor, no el correo ni el teléfono.
fijar DISABLE_SIGNUP false
fijar ENABLE_EMAIL_SIGNUP false
fijar ENABLE_EMAIL_AUTOCONFIRM false
fijar ENABLE_PHONE_SIGNUP false
fijar ENABLE_PHONE_AUTOCONFIRM false
fijar ENABLE_ANONYMOUS_USERS false
fijar AZURE_ENABLED true
fijar AZURE_CLIENT_ID "$AZURE_CLIENT_ID"
fijar AZURE_URL "https://login.microsoftonline.com/$AZURE_TENANT_ID"
fijar AZURE_SECRET ""
# El servidor OAuth 2.1 del MCP (decisiones §61): consentimiento en el CRM.
fijar OAUTH_SERVER_ENABLED true
fijar OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION true
fijar OAUTH_SERVER_AUTHORIZATION_PATH /oauth/consent

# ── Verificación: el compose resuelve, y qué nombres y puertos quedarían.
docker compose config --quiet || falla "docker compose config no valida."
docker compose config --format json | python3 -c '
import json, sys
c = json.load(sys.stdin)
print("Proyecto:", c.get("name"))
for nombre, s in sorted(c["services"].items()):
    puertos = []
    for p in s.get("ports", []):
        if p.get("published"):
            puertos.append((p.get("host_ip") or "0.0.0.0") + ":" + str(p["published"]) + "->" + str(p.get("target")))
    linea = "  " + s.get("container_name", nombre)
    if puertos:
        linea += "  [" + ", ".join(puertos) + "]"
    print(linea)
'
vacias="$(grep -E '^(AZURE_SECRET|POSTGRES_PASSWORD|JWT_SECRET|JWT_KEYS|JWT_JWKS|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY|DASHBOARD_PASSWORD)=$' .env | cut -d= -f1 | tr '\n' ' ')"
echo "Claves vacías: ${vacias:-ninguna}"

if [[ "$modo" == --ensayo ]]; then
  rm -rf "$base"
  echo "Ensayo correcto; no quedó nada escrito."
else
  echo "Instalado en $DIR, sin levantar."
  echo "Siguiente: poner AZURE_SECRET en $DIR/.env y, con DNS y proxy listos, 'docker compose up -d' en $DIR."
fi
