"""Adeudos en vivo desde GeoServer (capa tributaria o prediosmxli)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.geonode_client import fetch_wfs_by_cadastral_code
from app.models import PredioAlfanumerico
from app.services.adeudo_sync import map_adeudo_properties
from app.services.cadastral_alfanumerico import normalize_cadastral_key
from app.services.catalog_builder import upsert_valuacion_for_predio


def _layers_to_try() -> list[str]:
    seen: set[str] = set()
    layers: list[str] = []
    for raw in (
        settings.geonode_adeudo_layer,
        settings.geonode_source_layer,
    ):
        layer = raw.strip()
        if layer and layer not in seen:
            seen.add(layer)
            layers.append(layer)
    return layers


def _pick_fiscal_from_features(
    features: list[dict[str, Any]],
    *,
    expected_clave: str,
) -> dict[str, Any] | None:
    norm = normalize_cadastral_key(expected_clave) or expected_clave.strip().upper()
    best: dict[str, Any] | None = None

    for feature in features:
        props = feature.get("properties") or {}
        mapped = map_adeudo_properties(props)
        code = mapped.get("cadastral_code")
        if code:
            code_norm = normalize_cadastral_key(code)
            if code_norm and code_norm != norm:
                continue
        if (
            mapped.get("adeudo_2026") is None
            and mapped.get("adeudo_total") is None
            and mapped.get("valor2026") is None
        ):
            continue
        if best is None:
            best = mapped
        else:
            for key in ("adeudo_2026", "adeudo_total", "valor2026"):
                if best.get(key) is None and mapped.get(key) is not None:
                    best[key] = mapped[key]
    return best


async def resolve_fiscal_from_geonode(
    clave: str,
) -> dict[str, Any]:
    """
    Busca adeudos por WFS en capas configuradas.
    Devuelve montos y metadatos (capa/campo usado).
    """
    norm = normalize_cadastral_key(clave) or clave.strip().upper()
    result: dict[str, Any] = {
        "clave_catastral": norm,
        "found": False,
        "source_layer": None,
        "wfs_field": None,
        "adeudo_2026": None,
        "adeudo_total": None,
        "valor2026": None,
        "sample_property_keys": [],
        "note": None,
    }

    if not settings.geonode_url:
        result["note"] = "GEONODE_URL no configurado"
        return result

    last_error: str | None = None
    for layer in _layers_to_try():
        try:
            payload = await fetch_wfs_by_cadastral_code(
                norm,
                type_name=layer,
                max_features=5,
            )
        except Exception as exc:
            last_error = str(exc)
            continue

        features = payload.get("features") or []
        if features and not result["sample_property_keys"]:
            props = features[0].get("properties") or {}
            result["sample_property_keys"] = list(props.keys())[:25]

        mapped = _pick_fiscal_from_features(features, expected_clave=norm)
        if mapped:
            result["found"] = True
            result["source_layer"] = layer
            result["wfs_field"] = payload.get("_wfs_field_used")
            result["adeudo_2026"] = mapped.get("adeudo_2026")
            result["adeudo_total"] = mapped.get("adeudo_total")
            result["valor2026"] = mapped.get("valor2026")
            return result

    if last_error:
        result["note"] = f"WFS: {last_error}"
    else:
        result["note"] = (
            "Sin atributos de adeudo en GeoServer para esta clave. "
            "Ejecute POST /api/v1/fiscal/sync o revise GEONODE_FIELD_ADEUDO_*."
        )
    return result


def apply_fiscal_to_record(
    record: PredioAlfanumerico,
    fiscal: dict[str, Any],
) -> bool:
    """Copia adeudos resueltos al registro. Devuelve True si hubo cambios."""
    if not fiscal.get("found"):
        return False

    changed = False
    for attr, key in (
        ("adeudo_2026", "adeudo_2026"),
        ("adeudo_total", "adeudo_total"),
        ("valor2026", "valor2026"),
    ):
        value = fiscal.get(key)
        if value is None:
            continue
        if not isinstance(value, Decimal):
            value = Decimal(str(value))
        if getattr(record, attr) != value:
            setattr(record, attr, value)
            changed = True
    return changed


async def refresh_record_fiscal(
    db: Session,
    record: PredioAlfanumerico,
    *,
    persist: bool = True,
) -> dict[str, Any]:
    """Consulta WFS y opcionalmente persiste adeudos en predios_alfanumerico."""
    fiscal = await resolve_fiscal_from_geonode(record.clave_catastral)
    changed = apply_fiscal_to_record(record, fiscal)
    if changed and persist:
        upsert_valuacion_for_predio(db, record)
        db.flush()
    fiscal["persisted"] = changed and persist
    fiscal["record_has_adeudo"] = (
        record.adeudo_2026 is not None or record.adeudo_total is not None
    )
    return fiscal
