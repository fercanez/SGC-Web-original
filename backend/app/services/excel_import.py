"""Importación de datos alfanuméricos desde Excel/CSV hacia PostGIS.

La cartografía (geometría) proviene de GeoNode; este módulo carga la tabla
`predios_alfanumerico` y enlaza con `parcels` por clave_catastral_norm / clavecatas.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any, BinaryIO, TextIO

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.services.cadastral_alfanumerico import (
    ALFANUMERIC_COLUMNS,
    link_all_records,
    link_record_to_parcel,
    row_to_alfanumerico_fields,
    upsert_alfanumerico,
)


def _normalize_header(name: str) -> str:
    text = str(name or "").strip().lower()
    text = re.sub(r"\s+", "_", text)
    return text


def _row_dict(values: tuple[Any, ...], headers: list[str]) -> dict[str, Any]:
    return {headers[i]: values[i] if i < len(values) else None for i in range(len(headers))}


def _detect_csv_delimiter(text: str) -> str:
    first_line = text.split("\n", 1)[0] if text else ""
    if first_line.count("\t") > first_line.count(","):
        return "\t"
    if ";" in first_line and first_line.count(";") > first_line.count(","):
        return ";"
    return ","


def iter_csv_rows(stream: TextIO, *, delimiter: str = ",") -> tuple[list[str], Any]:
    reader = csv.reader(stream, delimiter=delimiter)
    try:
        raw_headers = next(reader)
    except StopIteration:
        return [], iter(())
    headers = [str(h).strip() for h in raw_headers]

    def rows():
        for line in reader:
            if not any(cell not in (None, "") for cell in line):
                continue
            row = _row_dict(tuple(line), headers)
            yield {_normalize_header(h): row[h] for h in headers}

    return headers, rows()


def iter_xlsx_rows(stream: BinaryIO) -> tuple[list[str], Any]:
    import openpyxl

    wb = openpyxl.load_workbook(stream, read_only=True, data_only=True)
    ws = wb.active
    row_iter = ws.iter_rows(values_only=True)
    try:
        first = next(row_iter)
    except StopIteration:
        wb.close()
        return [], iter(())
    headers = [str(c).strip() if c is not None else f"col_{i}" for i, c in enumerate(first)]

    def rows():
        for line in row_iter:
            if not any(cell not in (None, "") for cell in line):
                continue
            row = _row_dict(line, headers)
            yield {_normalize_header(h): row[h] for h in headers}

    return headers, rows()


def read_tabular_rows(
    content: bytes, *, filename: str = ""
) -> tuple[list[str], list[dict[str, Any]]]:
    """Lee filas de .csv, .txt o .xlsx."""
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xlsm")):
        headers, row_iter = iter_xlsx_rows(io.BytesIO(content))
        return headers, list(row_iter)

    text = content.decode("utf-8-sig", errors="replace")
    delimiter = _detect_csv_delimiter(text)
    headers, row_iter = iter_csv_rows(io.StringIO(text), delimiter=delimiter)
    return headers, list(row_iter)


def _apply_row(
    db: Session,
    row: dict[str, Any],
    *,
    dry_run: bool,
    stats: dict[str, Any],
) -> None:
    fields = row_to_alfanumerico_fields(row)
    if not fields:
        stats["skipped"] += 1
        stats["errors"].append("Fila sin clave_catastral")
        return

    record, created = upsert_alfanumerico(db, fields, dry_run=dry_run)
    if created:
        stats["records_created"] += 1
    else:
        stats["records_updated"] += 1

    if dry_run or record is None:
        return

    parcel = link_record_to_parcel(db, record)
    if parcel:
        stats["parcels_linked"] += 1
    else:
        stats["parcels_pending_geometry"] += 1


def import_tabular_content(
    content: bytes,
    *,
    filename: str = "",
    dry_run: bool = False,
) -> dict[str, Any]:
    headers, rows = read_tabular_rows(content, filename=filename)
    stats: dict[str, Any] = {
        "filename": filename or "(sin nombre)",
        "headers_detected": headers,
        "expected_columns": list(ALFANUMERIC_COLUMNS),
        "rows_read": len(rows),
        "records_created": 0,
        "records_updated": 0,
        "parcels_linked": 0,
        "parcels_pending_geometry": 0,
        "skipped": 0,
        "dry_run": dry_run,
        "errors": [],
    }

    if not rows:
        stats["errors"].append("Archivo vacío o sin filas de datos")
        return stats

    batch = settings.excel_import_batch_size
    db = SessionLocal()
    try:
        for i, row in enumerate(rows, start=1):
            try:
                _apply_row(db, row, dry_run=dry_run, stats=stats)
            except Exception as exc:
                stats["skipped"] += 1
                stats["errors"].append(f"Fila {i}: {exc}")

            if not dry_run and i % batch == 0:
                db.commit()

        if not dry_run:
            relink = link_all_records(db, sync_summary=True)
            stats["relink_after_import"] = relink
            from app.services.catalog_builder import rebuild_catalogs_from_padron

            stats["catalogs"] = rebuild_catalogs_from_padron(db)
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    stats["errors"] = stats["errors"][:50]
    stats["linked_by"] = (
        "padron2026.clave_catastral = prediosmxli.clavecatas = parcels.cadastral_code"
    )
    return stats
