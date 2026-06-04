#!/bin/sh
# Diagnóstico de GET /api/v1/cadastral/{clave}/map-geometry
# Uso: CLAVE=ST312031 sh scripts/test-map-geometry.sh

set -e
cd /opt/sgc-web
CLAVE="${CLAVE:-ST312031}"
API_URL="${API_URL:-http://127.0.0.1:8000}"

echo "=== 1. Health ==="
curl -sf "$API_URL/api/v1/health" && echo "" || echo "FALLO health"

echo ""
echo "=== 2. Login ==="
TOKEN=$(curl -sf -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"geoserver"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "Token OK (${#TOKEN} chars)"

echo ""
echo "=== 3. Padrón $CLAVE ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/v1/cadastral/$CLAVE" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('clave:', d.get('clave_catastral'), 'parcel_id:', d.get('parcel_id'))"

echo ""
echo "=== 4. map-geometry (código HTTP + cuerpo) ==="
HTTP=$(curl -s -w "%{http_code}" -o /tmp/map-geom.json \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/v1/cadastral/$CLAVE/map-geometry")
echo "HTTP $HTTP"
if [ -s /tmp/map-geom.json ]; then
  python3 -m json.tool /tmp/map-geom.json | head -25
  python3 -c "
import json
d=json.load(open('/tmp/map-geom.json'))
if 'detail' in d and len(d)==1:
    print('ERROR API:', d['detail'])
else:
    print('source:', d.get('source'), 'wfs_srid:', d.get('wfs_srid'), 'vertices:', d.get('vertex_count'))
"
else
  echo "Cuerpo vacío — revise: docker logs --tail=40 sgc-web_api_1"
  echo "¿Ruta existe? curl -s $API_URL/openapi.json | grep map-geometry"
fi

echo ""
echo "=== 5. OpenAPI (¿existe ruta?) ==="
curl -sf "$API_URL/openapi.json" | python3 -c \
  "import sys,json; o=json.load(sys.stdin); print('map-geometry' in o['paths'] and 'OK ruta' or 'FALTA ruta — reconstruir API')"
