#!/bin/sh
# Comprueba que la API expone geometria para mapa (batch + por clave).
# Uso: cd /opt/sgc-web && sh scripts/verify-map-api.sh ST312001

CLAVE="${1:-ST312001}"
BASE="${API_BASE:-http://127.0.0.1:8000}"

echo "=== Health ==="
curl -sf "$BASE/api/v1/health" && echo ""

echo ""
echo "=== GET map-geometry ($CLAVE) ==="
CODE=$(curl -s -o /tmp/sgc-geom.json -w "%{http_code}" \
  "$BASE/api/v1/cadastral/$CLAVE/map-geometry")
echo "HTTP $CODE"
head -c 200 /tmp/sgc-geom.json && echo ""

echo ""
echo "=== POST map-geometries/batch ==="
CODE=$(curl -s -o /tmp/sgc-batch.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"claves\":[\"$CLAVE\"],\"max_items\":5}" \
  "$BASE/api/v1/cadastral/map-geometries/batch")
echo "HTTP $CODE"
head -c 200 /tmp/sgc-batch.json && echo ""

case "$CODE" in
  401|403)
    echo ""
    echo "OK: la ruta existe (requiere login en el navegador)."
    ;;
  404)
    echo ""
    echo "FALLO: la API no tiene las rutas nuevas. Rebuild api:"
    echo "  docker-compose build --no-cache api && docker-compose up -d api"
    exit 1
    ;;
  200|422)
    echo ""
    echo "OK: rutas de geometria disponibles."
    ;;
  *)
    echo ""
    echo "Revise el codigo HTTP anterior (esperado 200, 401 o 422)."
    ;;
esac
