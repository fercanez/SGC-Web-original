#!/bin/sh
# Instala y activa el servicio systemd sgc-web-api (sin Docker).
# Uso en el servidor: cd /opt/sgc-web && sudo sh scripts/install-sgc-web-api-service.sh

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecute como root: sudo sh scripts/install-sgc-web-api-service.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/scripts/sgc-web-api.service"
UNIT_DST="/etc/systemd/system/sgc-web-api.service"
VENV_UVICORN="$ROOT/backend/venv/bin/uvicorn"

if [ ! -x "$VENV_UVICORN" ]; then
  echo "No existe $VENV_UVICORN"
  echo "Cree el venv: cd $ROOT/backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

echo "=== Detener uvicorn manual en 9100 (si hay) ==="
for pid in $(ss -tlnp 2>/dev/null | grep ':9100' | grep -oP 'pid=\K[0-9]+' || true); do
  cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
  case "$cmd" in
    *sgc-web/backend*)
      echo "  kill $pid"
      kill "$pid" 2>/dev/null || true
      ;;
  esac
done
sleep 2

echo "=== Instalar unidad systemd ==="
cp "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload
systemctl enable sgc-web-api
systemctl restart sgc-web-api

echo ""
echo "=== Estado ==="
systemctl status sgc-web-api --no-pager -l || true
echo ""
curl -sf http://127.0.0.1:9100/api/v1/health && echo "  OK health" || echo "  FALLO health — journalctl -u sgc-web-api -n 40"
echo ""
echo "Comandos útiles:"
echo "  sudo systemctl restart sgc-web-api"
echo "  sudo journalctl -u sgc-web-api -f"
