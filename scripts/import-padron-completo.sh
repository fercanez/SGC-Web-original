#!/bin/sh
# Importación del padron2026 completo + validación de catálogos
# Uso en servidor:
#   cd /opt/sgc-web
#   PADRON_FILE=/opt/sgc-web/data/padron_2026.csv sh scripts/import-padron-completo.sh
#
# Variables opcionales:
#   API_URL=http://127.0.0.1:8000
#   ADMIN_USER=admin
#   ADMIN_PASS=geoserver
#   SKIP_SYNC=1          # no sincronizar geometría GeoNode
#   DRY_RUN=1            # solo simular import

set -e
cd /opt/sgc-web

API_URL="${API_URL:-http://127.0.0.1:8000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-geoserver}"
PADRON_FILE="${PADRON_FILE:-/opt/sgc-web/data/padron_2026.csv}"

if [ ! -f "$PADRON_FILE" ]; then
  echo "ERROR: No existe el archivo: $PADRON_FILE"
  echo "Suba padron_2026.csv por FileZilla a /opt/sgc-web/data/"
  exit 1
fi

echo "=== 1. Salud API ==="
curl -sf "$API_URL/api/v1/health" | head -c 200
echo ""

echo ""
echo "=== 2. Login ==="
TOKEN=$(curl -sf -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "Token OK"

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "=== 3. Simulación import (dry_run) ==="
  curl -sf -X POST "$API_URL/api/v1/import/excel?dry_run=true" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$PADRON_FILE" | python3 -m json.tool | head -60
  echo ""
  echo "Simulación lista. Ejecute sin DRY_RUN=1 para importar."
  exit 0
fi

echo ""
echo "=== 3. Importar padrón completo ==="
curl -sf -X POST "$API_URL/api/v1/import/excel" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$PADRON_FILE" | python3 -m json.tool | tee /tmp/sgc-import-result.json | head -80

echo ""
echo "=== 4. Resumen catálogos (post-import automático) ==="
curl -sf "$API_URL/api/v1/catalogs/summary" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

if [ "$SKIP_SYNC" != "1" ]; then
  echo ""
  echo "=== 5. Sincronizar geometría GeoNode ==="
  curl -sf -X POST "$API_URL/api/v1/source/sync" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30

  echo ""
  echo "=== 6. Re-enlazar alfanumérico ↔ cartografía ==="
  curl -sf -X POST "$API_URL/api/v1/cadastral/link" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

  echo ""
  echo "=== 7. Sincronizar adeudos (capa tributaria GeoNode) ==="
  curl -sf -X POST "$API_URL/api/v1/fiscal/sync" \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
fi

echo ""
echo "=== 8. Validación muestra (clave A1003001) ==="
curl -sf "$API_URL/api/v1/cadastral/A1003001" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(clave no encontrada aún)"

echo ""
echo "=== FIN ==="
echo "Resultado completo: /tmp/sgc-import-result.json"
echo "Revise: records_created, records_updated, parcels_linked, catalogs.totales"
