#!/bin/sh
# Recupera SGC-Web cuando docker-compose 1.29.2 falla con KeyError: 'ContainerConfig'
# Uso: cd /opt/sgc-web && sh scripts/fix-sgc-containers.sh

set -e
cd /opt/sgc-web

echo "=== 1. Detener y eliminar contenedores viejos ==="
docker-compose down --remove-orphans 2>/dev/null || true
docker rm -f sgc-web_api_1 sgc-web_web_1 2>/dev/null || true
docker ps -aq --filter name=sgc-web | xargs -r docker rm -f
docker ps -aq --filter name=_sgc-web | xargs -r docker rm -f

echo "=== 2. Reconstruir imagenes (si hace falta) ==="
docker-compose build api web

echo "=== 3. Levantar contenedores nuevos ==="
docker-compose up -d --force-recreate --remove-orphans

echo "=== 4. Estado ==="
sleep 4
docker-compose ps

echo ""
echo "=== 5. Pruebas ==="
curl -sf http://127.0.0.1:8000/api/v1/health && echo "  OK api:8000" || echo "  FALLO api:8000"
curl -sf -o /dev/null -w "web:5173 HTTP %{http_code}\n" http://127.0.0.1:5173/ || true

echo ""
echo "Listo. En el PC: http://192.168.116.132:5173 (Ctrl+F5)"
