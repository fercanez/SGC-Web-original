"""Base alfanumérica municipal y enlace con predios cartográficos."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import Parcel, PredioAlfanumerico

# Columnas oficiales (Excel / PostgreSQL municipal)
ALFANUMERIC_COLUMNS = (
    "clave_catastral",
    "clave_catastral_norm",
    "nombre_completo",
    "delegacion",
    "colonia",
    "calle",
    "numof",
    "numint",
    "letra",
    "zonah",
    "valor2026",
    "sup_documental",
    "sup_fisica",
    "condominio",
    "adeudo_2026",
    "adeudo_total",
    "sup_const",
    "id_tasa",
    "descripcion_uso",
    "porcentaje_tasa",
)

NUMERIC_COLUMNS = frozenset(
    {
        "valor2026",
        "sup_documental",
        "sup_fisica",
        "adeudo_2026",
        "adeudo_total",
        "sup_const",
        "id_tasa",
        "porcentaje_tasa",
    }
)

# En domicilio, 0 suele significar "sin número" en el padrón municipal
ADDRESS_ZERO_EMPTY = frozenset({"numof", "numint", "letra"})
EMPTY_MARKERS = frozenset({"null", "none", "n/a", "na", "-", ""})

# Primera columna presente en el CSV/Excel (cabeceras normalizadas)
ROW_ALIASES: dict[str, tuple[str, ...]] = {
    "adeudo_2026": (
        "adeudo_2026",
        "adeudo2026",
        "adeudo_ejercicio",
        "adeudo_ejercicio_2026",
        "adeudo",
    ),
    "adeudo_total": (
        "adeudo_total",
        "adeudototal",
        "adeudo_acumulado",
        "total_adeudo",
    ),
    "valor2026": ("valor2026", "valor_2026", "valor_catastral", "avaluo"),
    "clave_catastral": (
        "clave_catastral",
        "clavecatas",
        "clave_catastral_norm",
        "cve_cat",
        "cvecatastral",
    ),
    "nombre_completo": (
        "nombre_completo",
        "nombre",
        "titular",
        "propietario",
    ),
}


def _row_value(row: dict[str, Any], column: str) -> Any:
    for key in ROW_ALIASES.get(column, (column,)):
        if key in row:
            val = row[key]
            if not _is_empty(val):
                return val
    return row.get(column)


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and value == 0.0:
        return False
    text = str(value).strip().lower()
    return text in EMPTY_MARKERS


def _parse_decimal(value: Any) -> Decimal | None:
    if _is_empty(value):
        return None
    raw = str(value).strip().replace("$", "").replace(" ", "")
    if raw.lower() in EMPTY_MARKERS:
        return None
    # Formato municipal: 183,514.32 | 1,890.00 | 5000
    if "," in raw and "." in raw:
        raw = raw.replace(",", "")
    elif "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    try:
        return Decimal(raw)
    except Exception:
        return None


def _clean_text(value: Any, column: str) -> str | None:
    if _is_empty(value):
        return None
    text = str(value).strip()
    if column in ADDRESS_ZERO_EMPTY and text in ("0", "0.0"):
        return None
    return text or None


def normalize_cadastral_key(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw.strip().upper().replace(" ", "").replace("-", "")


def build_address(record: PredioAlfanumerico) -> str | None:
    parts: list[str] = []
    if record.calle:
        parts.append(record.calle.strip())
    if record.numof:
        parts.append(f"#{record.numof.strip()}")
    if record.numint:
        parts.append(f"Int. {record.numint.strip()}")
    if record.letra:
        parts.append(record.letra.strip())
    if not parts:
        return None
    address = " ".join(parts)
    if record.zonah:
        address = f"{address}, Zona {record.zonah.strip()}"
    return address[:512]


def link_codes(record: PredioAlfanumerico) -> list[str]:
    codes: list[str] = []
    for raw in (record.clave_catastral_norm, record.clave_catastral):
        norm = normalize_cadastral_key(raw)
        if norm and norm not in codes:
            codes.append(norm)
    return codes


def find_parcel_for_record(db: Session, record: PredioAlfanumerico) -> Parcel | None:
    for code in link_codes(record):
        parcel = db.query(Parcel).filter(Parcel.cadastral_code == code).first()
        if parcel:
            return parcel
    return None


def sync_parcel_summary(parcel: Parcel, record: PredioAlfanumerico) -> None:
    """Copia campos de resumen al predio cartográfico para el visor."""
    parcel.colony = record.colonia or parcel.colony
    parcel.address = build_address(record) or parcel.address
    parcel.area_m2 = record.sup_fisica or record.sup_documental or parcel.area_m2
    parcel.cadastral_value = record.valor2026 or parcel.cadastral_value
    parcel.land_use = record.descripcion_uso or parcel.land_use
    link = record.clave_catastral_norm or record.clave_catastral
    if link:
        parcel.predial_account = normalize_cadastral_key(link) or parcel.predial_account


def link_record_to_parcel(
    db: Session, record: PredioAlfanumerico, *, sync_summary: bool = True
) -> Parcel | None:
    record.parcel_id = None
    db.flush()
    parcel = find_parcel_for_record(db, record)
    if parcel is None:
        record.parcel_id = None
        return None
    parcel_norm = normalize_cadastral_key(parcel.cadastral_code)
    record_norms = {
        n
        for n in (normalize_cadastral_key(c) for c in link_codes(record))
        if n
    }
    if parcel_norm not in record_norms:
        record.parcel_id = None
        return None
    record.parcel_id = parcel.id
    if sync_summary:
        sync_parcel_summary(parcel, record)
    return parcel


def link_all_records(db: Session, *, sync_summary: bool = True) -> dict[str, int]:
    stats = {"linked": 0, "unlinked": 0}
    records = db.query(PredioAlfanumerico).all()
    for record in records:
        parcel = link_record_to_parcel(db, record, sync_summary=sync_summary)
        if parcel:
            stats["linked"] += 1
        else:
            stats["unlinked"] += 1
    return stats


def row_to_alfanumerico_fields(row: dict[str, Any]) -> dict[str, Any] | None:
    data: dict[str, Any] = {}
    for col in ALFANUMERIC_COLUMNS:
        value = _row_value(row, col)
        if col in NUMERIC_COLUMNS:
            data[col] = _parse_decimal(value)
        elif col == "clave_catastral_norm":
            norm = _clean_text(value, col)
            data[col] = normalize_cadastral_key(norm) if norm else None
        else:
            data[col] = _clean_text(value, col)

    clave = data.get("clave_catastral")
    if not clave:
        return None

    clave_norm = normalize_cadastral_key(clave)
    if not clave_norm:
        return None
    data["clave_catastral"] = clave_norm
    if not data.get("clave_catastral_norm"):
        data["clave_catastral_norm"] = clave_norm

    return data


def upsert_alfanumerico(
    db: Session, fields: dict[str, Any], *, dry_run: bool
) -> tuple[PredioAlfanumerico | None, bool]:
    clave = fields["clave_catastral"]
    existing = (
        db.query(PredioAlfanumerico)
        .filter(
            (PredioAlfanumerico.clave_catastral == clave)
            | (PredioAlfanumerico.clave_catastral_norm == clave)
        )
        .first()
    )
    if dry_run:
        return existing, existing is None

    if existing is None:
        record = PredioAlfanumerico(**fields)
        db.add(record)
        db.flush()
        return record, True

    for key, value in fields.items():
        setattr(existing, key, value)
    db.flush()
    return existing, False
