"""Sincronización de adeudos desde capa vectorial GeoNode hacia predios_alfanumerico."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.geonode_client import fetch_wfs_geojson
from app.models import PredioAlfanumerico
from app.services.cadastral_alfanumerico import normalize_cadastral_key
from app.services.catalog_builder import upsert_valuacion_for_predio
from app.services.field_mapper import pick_decimal, pick_property


def map_adeudo_properties(props: dict[str, Any]) -> dict[str, Any]:
    return {
        "cadastral_code": pick_property(
            props, settings.field_candidates("geonode_field_cadastral")
        ),
        "adeudo_2026": pick_decimal(
            props, settings.field_candidates("geonode_field_adeudo_2026")
        ),
        "adeudo_total": pick_decimal(
            props, settings.field_candidates("geonode_field_adeudo_total")
        ),
        "valor2026": pick_decimal(
            props, settings.field_candidates("geonode_field_valor")
        ),
    }


def _find_predio(db: Session, cadastral_code: str) -> PredioAlfanumerico | None:
    norm = normalize_cadastral_key(cadastral_code)
    if not norm:
        return None
    return (
        db.query(PredioAlfanumerico)
        .filter(
            (PredioAlfanumerico.clave_catastral == norm)
            | (PredioAlfanumerico.clave_catastral_norm == norm)
        )
        .first()
    )


def _apply_adeudo_feature(
    db: Session,
    feature: dict[str, Any],
    *,
    dry_run: bool,
) -> str:
    props = feature.get("properties") or {}
    mapped = map_adeudo_properties(props)
    code = mapped.get("cadastral_code")
    if not code:
        return "skipped_no_clave"

    predio = _find_predio(db, code)
    if predio is None:
        return "skipped_no_padron"

    adeudo_2026 = mapped.get("adeudo_2026")
    adeudo_total = mapped.get("adeudo_total")
    valor2026 = mapped.get("valor2026")
    if adeudo_2026 is None and adeudo_total is None and valor2026 is None:
        return "skipped_no_adeudo"

    if dry_run:
        return "updated"

    changed = False
    if adeudo_2026 is not None and predio.adeudo_2026 != adeudo_2026:
        predio.adeudo_2026 = adeudo_2026
        changed = True
    if adeudo_total is not None and predio.adeudo_total != adeudo_total:
        predio.adeudo_total = adeudo_total
        changed = True
    if valor2026 is not None and predio.valor2026 != valor2026:
        predio.valor2026 = valor2026
        changed = True

    if not changed:
        return "unchanged"

    upsert_valuacion_for_predio(db, predio)
    return "updated"


def _count_with_adeudo(db: Session) -> int:
    return (
        db.query(PredioAlfanumerico)
        .filter(
            (PredioAlfanumerico.adeudo_2026.isnot(None))
            | (PredioAlfanumerico.adeudo_total.isnot(None))
        )
        .count()
    )


async def sync_adeudos_from_geonode(
    *,
    max_features: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    layer = settings.geonode_adeudo_layer.strip()
    if not layer:
        raise ValueError("GEONODE_ADEUDO_LAYER no configurado")

    batch = settings.geonode_sync_batch_size
    start_index = 0
    stats: dict[str, Any] = {
        "source_layer": layer,
        "fetched": 0,
        "updated": 0,
        "unchanged": 0,
        "skipped_no_clave": 0,
        "skipped_no_padron": 0,
        "skipped_no_adeudo": 0,
        "dry_run": dry_run,
        "ejercicio": settings.padron_default_ejercicio,
    }

    while True:
        page_size = batch
        if max_features is not None:
            remaining = max_features - stats["fetched"]
            if remaining <= 0:
                break
            page_size = min(batch, remaining)

        payload = await fetch_wfs_geojson(
            layer,
            start_index=start_index,
            max_features=page_size,
        )
        features = payload.get("features") or []
        if not features:
            break

        stats["fetched"] += len(features)

        db = SessionLocal()
        try:
            for feature in features:
                result = _apply_adeudo_feature(db, feature, dry_run=dry_run)
                stats[result] = stats.get(result, 0) + 1
            if not dry_run:
                db.commit()
            else:
                db.rollback()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        if len(features) < page_size:
            break
        start_index += len(features)

    db = SessionLocal()
    try:
        stats["predios_con_adeudo"] = _count_with_adeudo(db)
    finally:
        db.close()

    return stats
