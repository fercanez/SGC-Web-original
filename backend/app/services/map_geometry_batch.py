"""Geometrías en lote para resaltar búsquedas (manzana / bloque)."""

from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import PredioAlfanumerico
from app.services.cadastral_alfanumerico import normalize_cadastral_key
from app.services.map_geometry import resolve_map_geometry

MAX_BATCH = 80
_WFS_CONCURRENCY = 6


def _fiscal_status(
    adeudo_2026: Decimal | None, adeudo_total: Decimal | None
) -> str:
    a26 = float(adeudo_2026 or 0)
    a_tot = float(adeudo_total or 0)
    if a26 > 0 or a_tot > 0:
        return "con_adeudo"
    return "sin_adeudo"


async def _geometry_for_clave(clave: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        data = await resolve_map_geometry(db, clave)
        geom = data.get("geometry")
        if not geom:
            return None
        return data
    finally:
        db.close()


async def batch_map_geometries(
    db: Session,
    claves: list[str],
    *,
    max_items: int = MAX_BATCH,
) -> dict[str, Any]:
    unique: list[str] = []
    seen: set[str] = set()
    for raw in claves:
        norm = normalize_cadastral_key(raw) or (raw or "").strip().upper()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        unique.append(norm)
        if len(unique) >= max_items:
            break

    records_by_clave: dict[str, PredioAlfanumerico] = {}
    for norm in unique:
        row = (
            db.query(PredioAlfanumerico)
            .filter(
                (PredioAlfanumerico.clave_catastral == norm)
                | (PredioAlfanumerico.clave_catastral_norm == norm)
            )
            .first()
        )
        if row:
            records_by_clave[norm] = row

    sem = asyncio.Semaphore(_WFS_CONCURRENCY)
    features: list[dict[str, Any]] = []
    failed = 0

    async def one(clave: str) -> None:
        nonlocal failed
        async with sem:
            try:
                data = await _geometry_for_clave(clave)
            except Exception:
                failed += 1
                return
            if not data or not data.get("geometry"):
                failed += 1
                return
            rec = records_by_clave.get(clave)
            fiscal = _fiscal_status(
                rec.adeudo_2026 if rec else None,
                rec.adeudo_total if rec else None,
            )
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "clave": clave,
                        "fiscal": fiscal,
                    },
                    "geometry": data["geometry"],
                }
            )

    await asyncio.gather(*(one(c) for c in unique))

    return {
        "type": "FeatureCollection",
        "features": features,
        "requested": len(unique),
        "drawn": len(features),
        "failed": failed,
        "max_items": max_items,
    }
