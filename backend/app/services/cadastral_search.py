"""Búsqueda avanzada en predios_alfanumerico con comodines y paginación."""

from __future__ import annotations

from sqlalchemy import and_, or_
from sqlalchemy.orm import Query, Session

from app.models import PredioAlfanumerico
from app.schemas import PredioAlfanumericoRead
from app.services.cadastral_alfanumerico import normalize_cadastral_key

PAGE_SIZE_DEFAULT = 500
PAGE_SIZE_MAX = 500


def _text_ilike(column, value: str | None, *, min_len: int = 2):
    if not value or len(value.strip()) < min_len:
        return None
    term = value.strip().upper()
    return column.ilike(f"%{term}%")


def _numof_filter(value: str | None):
    if not value or not value.strip():
        return None
    term = value.strip()
    return PredioAlfanumerico.numof.ilike(f"%{term}%")


def _clave_filter(pattern: str | None):
    """Clave exacta, prefijo o patrón con _ (un carácter) y * / % (varios)."""
    if not pattern or len(pattern.strip()) < 2:
        return None
    raw = pattern.strip().upper()
    has_wildcard = "_" in raw or "*" in raw or "%" in raw

    if has_wildcard:
        like = raw.replace("*", "%")
        return or_(
            PredioAlfanumerico.clave_catastral.ilike(like),
            PredioAlfanumerico.clave_catastral_norm.ilike(like),
        )

    norm = normalize_cadastral_key(raw) or raw
    return or_(
        PredioAlfanumerico.clave_catastral_norm.ilike(f"{norm}%"),
        PredioAlfanumerico.clave_catastral.ilike(f"{raw}%"),
        PredioAlfanumerico.clave_catastral == raw,
        PredioAlfanumerico.clave_catastral_norm == norm,
    )


def _collect_clauses(
    *,
    clave: str | None = None,
    apellido: str | None = None,
    calle: str | None = None,
    numof: str | None = None,
    colonia: str | None = None,
) -> list:
    clauses = []
    cf = _clave_filter(clave)
    if cf is not None:
        clauses.append(cf)
    for col, val in (
        (PredioAlfanumerico.nombre_completo, apellido),
        (PredioAlfanumerico.calle, calle),
        (PredioAlfanumerico.colonia, colonia),
    ):
        f = _text_ilike(col, val)
        if f is not None:
            clauses.append(f)
    nf = _numof_filter(numof)
    if nf is not None:
        clauses.append(nf)
    return clauses


def build_advanced_query(
    db: Session,
    *,
    clave: str | None = None,
    apellido: str | None = None,
    calle: str | None = None,
    numof: str | None = None,
    colonia: str | None = None,
    combinar: str = "todos",
) -> Query:
    clauses = _collect_clauses(
        clave=clave,
        apellido=apellido,
        calle=calle,
        numof=numof,
        colonia=colonia,
    )

    if not clauses:
        raise ValueError(
            "Indique al menos un criterio (clave 2+ caracteres, apellido, calle, "
            "colonia 2+ o número oficial)."
        )

    if combinar == "cualquiera" and len(clauses) > 1:
        return db.query(PredioAlfanumerico).filter(or_(*clauses))
    return db.query(PredioAlfanumerico).filter(and_(*clauses))


def search_predios_advanced(
    db: Session,
    *,
    clave: str | None = None,
    apellido: str | None = None,
    calle: str | None = None,
    numof: str | None = None,
    colonia: str | None = None,
    combinar: str = "todos",
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), PAGE_SIZE_MAX)
    combinar = "cualquiera" if combinar == "cualquiera" else "todos"

    base = build_advanced_query(
        db,
        clave=clave,
        apellido=apellido,
        calle=calle,
        numof=numof,
        colonia=colonia,
        combinar=combinar,
    )
    total = base.count()
    rows = (
        base.order_by(PredioAlfanumerico.clave_catastral)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    total_pages = (total + page_size - 1) // page_size if total else 0

    return {
        "items": [PredioAlfanumericoRead.model_validate(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "combinar": combinar,
        "criteria": {
            "clave": (clave or "").strip() or None,
            "apellido": (apellido or "").strip() or None,
            "calle": (calle or "").strip() or None,
            "numof": (numof or "").strip() or None,
            "colonia": (colonia or "").strip() or None,
        },
    }
