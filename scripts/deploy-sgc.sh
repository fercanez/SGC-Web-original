#!/bin/sh
# Despliegue de SGC-Web evitando el bug de docker-compose 1.29.2
# (KeyError: 'ContainerConfig' al recrear contenedores).
#
# Estrategia: construir las imagenes nuevas, ELIMINAR los contenedores
# viejos (nunca "recreate") y crear contenedores nuevos desde cero.
#
# Uso:
#   cd /opt/sgc-web && sh scripts/deploy-sgc.sh            # todos los servicios
#   cd /opt/sgc-web && sh scripts/deploy-sgc.sh api web    # solo algunos

set -e
cd /opt/sgc-web

SERVICES="$*"

echo "=== 1. Construir imagenes ==="
docker-compose build $SERVICES

echo "=== 2. Detener y eliminar contenedores (evita 'recreate') ==="
docker-compose stop $SERVICES 2>/dev/null || true
docker-compose rm -f $SERVICES 2>/dev/null || true
# Respaldo: forzar borrado por nombre si compose dejo alguno
docker rm -f sgc-web_api_1 sgc-web_web_1 2>/dev/null || true

echo "=== 3. Crear contenedores nuevos ==="
docker-compose up -d $SERVICES

echo "=== 4. Estado ==="
sleep 4
docker-compose ps

echo ""
echo "=== 5. Pruebas ==="
curl -sf http://127.0.0.1:8000/api/v1/health && echo "  OK api:8000" || echo "  FALLO api:8000"
curl -sf -o /dev/null -w "web:5173 HTTP %{http_code}\n" http://127.0.0.1:5173/ || true

echo ""
echo "Listo. En el PC: http://192.168.116.132:5173 (Ctrl+F5)"
