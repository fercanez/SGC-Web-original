#!/bin/sh
# Arranca SGC-Web SIN reconstruir imágenes (usa sgc-web_api / sgc-web_web ya existentes).
# Uso: cd /opt/sgc-web && sh scripts/start-sgc-existing.sh

set -e
cd /opt/sgc-web

env_val() {
  key=$1
  default=$2
  if [ -f .env ]; then
    line=$(grep -E "^${key}=" .env 2>/dev/null | head -1 | tr -d '\r')
    if [ -n "$line" ]; then
      echo "$line" | cut -d= -f2-
      return
    fi
  fi
  echo "$default"
}

if ! docker image inspect sgc-web_api:latest >/dev/null 2>&1; then
  echo "FALTA imagen sgc-web_api:latest — construya con: docker build --network=host -t sgc-web_api ./backend"
  exit 1
fi
if ! docker image inspect sgc-web_web:latest >/dev/null 2>&1; then
  echo "FALTA imagen sgc-web_web:latest — construya con: docker build --network=host -t sgc-web_web ./frontend"
  exit 1
fi

echo "=== Red y contenedores ==="
docker network create sgc-web_default 2>/dev/null || true
docker rm -f sgc-web_api_1 sgc-web_web_1 2>/dev/null || true

GEONODE_URL=$(env_val GEONODE_URL "http://192.168.116.132")
GEOSERVER_PATH=$(env_val GEOSERVER_PATH "/geoserver")
GEONODE_USER=$(env_val GEONODE_USER "")
GEONODE_PASSWORD=$(env_val GEONODE_PASSWORD "")
GEONODE_SSL_VERIFY=$(env_val GEONODE_SSL_VERIFY "false")
GEONODE_WMS_LAYERS=$(env_val GEONODE_WMS_LAYERS "")
GEONODE_WMS_LAYER_TITLES=$(env_val GEONODE_WMS_LAYER_TITLES "")
GEONODE_SOURCE_LAYER=$(env_val GEONODE_SOURCE_LAYER "")
GEONODE_SOURCE_TITLE=$(env_val GEONODE_SOURCE_TITLE "Predios Mexicali")
GEONODE_FIELD_CADASTRAL=$(env_val GEONODE_FIELD_CADASTRAL "clavecatas")
GEONODE_FIELD_PREDIAL=$(env_val GEONODE_FIELD_PREDIAL "clavecatas")
SKIP_DEMO=$(env_val SKIP_DEMO_WHEN_SOURCE_LAYER "true")
SYNC_GEOM=$(env_val GEONODE_SYNC_GEOMETRY_ONLY "true")
CORS_ORIGINS=$(env_val CORS_ORIGINS "http://192.168.116.132:5173")

echo "=== API ==="
docker run -d \
  --name sgc-web_api_1 \
  --network sgc-web_default \
  --network-alias api \
  --env-file .env \
  -e "GEONODE_URL=$GEONODE_URL" \
  -e "GEOSERVER_PATH=$GEOSERVER_PATH" \
  -e "GEONODE_USER=$GEONODE_USER" \
  -e "GEONODE_PASSWORD=$GEONODE_PASSWORD" \
  -e "GEONODE_SSL_VERIFY=$GEONODE_SSL_VERIFY" \
  -e "GEONODE_WMS_LAYERS=$GEONODE_WMS_LAYERS" \
  -e "GEONODE_WMS_LAYER_TITLES=$GEONODE_WMS_LAYER_TITLES" \
  -e "GEONODE_SOURCE_LAYER=$GEONODE_SOURCE_LAYER" \
  -e "GEONODE_SOURCE_TITLE=$GEONODE_SOURCE_TITLE" \
  -e "GEONODE_FIELD_CADASTRAL=$GEONODE_FIELD_CADASTRAL" \
  -e "GEONODE_FIELD_PREDIAL=$GEONODE_FIELD_PREDIAL" \
  -e "SKIP_DEMO_WHEN_SOURCE_LAYER=$SKIP_DEMO" \
  -e "GEONODE_SYNC_GEOMETRY_ONLY=$SYNC_GEOM" \
  -e "CORS_ORIGINS=$CORS_ORIGINS" \
  --add-host host.docker.internal:host-gateway \
  -p 8000:8000 \
  --restart unless-stopped \
  sgc-web_api:latest

echo "=== Web ==="
docker run -d \
  --name sgc-web_web_1 \
  --network sgc-web_default \
  --env-file .env \
  -e VITE_API_PROXY_TARGET=http://api:8000 \
  -p 5173:5173 \
  --restart unless-stopped \
  sgc-web_web:latest

sleep 8
docker ps --filter name=sgc-web

curl -sf http://127.0.0.1:8000/api/v1/health && echo "  OK api:8000" || echo "  FALLO api:8000"
curl -sf http://127.0.0.1:5173/api/v1/health && echo "  OK web:5173" || echo "  FALLO web:5173"

echo ""
echo "PC: http://192.168.116.132:5173/login"
