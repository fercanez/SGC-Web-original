#!/usr/bin/env python3
"""Importa Excel/CSV alfanumérico hacia PostGIS (desde el host o dentro del contenedor API)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Importar base alfanumérica de predios (enlace por clavecatas)"
    )
    parser.add_argument("file", type=Path, help="Ruta al .xlsx o .csv")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simular sin escribir en la base de datos",
    )
    args = parser.parse_args()

    if not args.file.is_file():
        print(f"No existe el archivo: {args.file}", file=sys.stderr)
        return 1

    backend = Path(__file__).resolve().parents[1] / "backend"
    sys.path.insert(0, str(backend))

    from app.services.excel_import import import_tabular_content

    content = args.file.read_bytes()
    result = import_tabular_content(
        content, filename=args.file.name, dry_run=args.dry_run
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
