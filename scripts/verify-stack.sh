#!/bin/sh
# Verifica SGC-Web en el servidor. Uso: sh scripts/verify-stack.sh

set -e
cd "$(dirname "$0")/.." || exit 1

echo "=== Contenedores ==="
docker-compose ps

echo ""
echo "=== API directa (puerto 8000) ==="
curl -sf http://127.0.0.1:8000/api/v1/health && echo "" || echo "FALLO: API no responde en 8000"

echo ""
echo "=== GeoNode WMS ==="
curl -sf http://127.0.0.1:8000/api/v1/geonode/status && echo "" || echo "FALLO: geonode/status"

echo ""
echo "=== API vía proxy Vite (puerto 5173) — lo que usa el navegador ==="
curl -sf http://127.0.0.1:5173/api/v1/health && echo "" || echo "FALLO: proxy /api en 5173 (reconstruya web: docker-compose build --no-cache web && docker-compose up -d web)"

echo ""
echo "=== Config (capas WMS) ==="
curl -sf http://127.0.0.1:5173/api/v1/config | head -c 500 && echo "" || true

echo ""
echo "Listo. En el PC abra: http://192.168.116.132:5173/api/v1/health"
