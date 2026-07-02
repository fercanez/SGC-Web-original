#!/bin/sh
# Diagnóstico rápido API SGC-Web (systemd puerto 9100). Uso en el servidor:
#   sh /opt/sgc-web/scripts/verify-sgc-web-api.sh

set -e

echo "=== systemctl sgc-web-api ==="
systemctl is-active sgc-web-api 2>/dev/null || echo "inactivo o sin unidad"
systemctl status sgc-web-api --no-pager -l 2>/dev/null | tail -n 15 || true

echo ""
echo "=== Puerto 9100 ==="
ss -tlnp 2>/dev/null | grep 9100 || netstat -tlnp 2>/dev/null | grep 9100 || echo "nada escuchando en 9100"

echo ""
echo "=== health/live (sin BD) ==="
curl -sf --max-time 5 http://127.0.0.1:9100/api/v1/health/live && echo "" || echo "FALLO: API no responde en 9100"

echo ""
echo "=== health (con BD) ==="
curl -sf --max-time 10 http://127.0.0.1:9100/api/v1/health && echo "" || echo "FALLO: health con BD (PostgreSQL?)"

echo ""
echo "=== PostgreSQL local ==="
pg_isready -h localhost -p 5432 2>/dev/null || echo "pg_isready no disponible o PostgreSQL caído"

echo ""
echo "=== Proxy Apache /sgc-web-api (si aplica) ==="
curl -sf --max-time 8 -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/sgc-web-api/api/v1/health/live 2>/dev/null || \
curl -sf --max-time 8 -o /dev/null -w "HTTP %{http_code}\n" https://127.0.0.1/sgc-web-api/api/v1/health/live -k 2>/dev/null || \
echo "no se pudo probar proxy local"

echo ""
echo "Listo."
