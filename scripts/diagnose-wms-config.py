#!/usr/bin/env python3
"""
Diagnóstico de capas WMS (GEONODE_WMS_LAYERS) en el servidor.

  cd /opt/sgc-web/backend && source venv/bin/activate
  python3 ../scripts/diagnose-wms-config.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.config import _discover_env_files, settings


def read_env_key(path: Path, key: str) -> list[str]:
    if not path.is_file():
        return []
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0].strip() == key:
            lines.append(raw)
    return lines


def main() -> int:
    print("=== SGC-Web diagnóstico WMS ===\n")

    env_files = [Path(p) for p in _discover_env_files()]
    print("Archivos .env detectados (orden de carga, el último gana):")
    for p in env_files:
        print(f"  - {p} {'(existe)' if p.is_file() else '(NO existe)'}")
    print()

    for key in ("GEONODE_WMS_LAYERS", "GEONODE_WMS_LAYER_TITLES"):
        print(f"{key} en archivos:")
        for p in env_files:
            matches = read_env_key(p, key)
            if matches:
                for m in matches:
                    print(f"  [{p}] {m}")
            else:
                print(f"  [{p}] (sin línea)")
        val = os.environ.get(key)
        if val:
            print(f"  [variables de entorno del proceso] {key}={val}")
        print()

    layers = settings.geonode_layer_list()
    print(f"Capas WMS activas en la API ({len(layers)}):")
    for i, layer in enumerate(layers, 1):
        print(f"  {i}. id={layer['id']}  layer={layer['layer']}  title={layer['title']}")
    print()

    print("source.layer (origen WFS, NO es capa WMS del panel):")
    print(f"  {settings.geonode_source_layer.strip() or '(vacío)'}")
    print()

    if len(layers) < 3:
        print("AVISO: se esperaban al menos colonias + predios + códigos postales.")
        print("Revise:")
        print("  1. Una sola línea GEONODE_WMS_LAYERS (sin duplicar en .env)")
        print("  2. systemctl cat sgc-web-api  → EnvironmentFile / Environment=")
        print("  3. sudo systemctl restart sgc-web-api")
        print()
        print("Comando útil (solo capas WMS del panel):")
        print(
            "  curl -s http://127.0.0.1:9100/api/v1/config "
            "| python3 -c \"import sys,json; d=json.load(sys.stdin); "
            "print(json.dumps(d['geonode']['layers'], indent=2, ensure_ascii=False))\""
        )
        return 1

    print("OK: configuración WMS con múltiples capas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
