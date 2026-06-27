"""Mapeo de atributos de la capa GeoNode hacia el modelo Parcel."""

from decimal import Decimal, InvalidOperation
from typing import Any

from app.config import Settings


def _normalize_props(props: dict[str, Any]) -> dict[str, Any]:
    return {str(k).lower(): v for k, v in props.items()}


def pick_property(props: dict[str, Any], candidates: list[str]) -> str | None:
    normalized = _normalize_props(props)
    for key in candidates:
        value = normalized.get(key)
        if value is None or value == "":
            continue
        return str(value).strip()
    return None


def pick_decimal(props: dict[str, Any], candidates: list[str]) -> Decimal | None:
    raw = pick_property(props, candidates)
    if raw is None:
        return None
    try:
        return Decimal(str(raw).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def map_feature_properties(props: dict[str, Any], cfg: Settings) -> dict[str, Any]:
    return {
        "cadastral_code": pick_property(
            props, cfg.field_candidates("geonode_field_cadastral")
        ),
        "predial_account": pick_property(
            props, cfg.field_candidates("geonode_field_predial")
        ),
        "colony": pick_property(props, cfg.field_candidates("geonode_field_colony")),
        "address": pick_property(props, cfg.field_candidates("geonode_field_address")),
        "land_use": pick_property(
            props, cfg.field_candidates("geonode_field_land_use")
        ),
        "area_m2": pick_decimal(props, cfg.field_candidates("geonode_field_area")),
    }


def resolve_cadastral_code(
    mapped: dict[str, Any],
    *,
    source_layer: str,
    source_fid: str,
) -> str:
    for key in ("cadastral_code", "predial_account"):
        value = mapped.get(key)
        if value:
            return value
    layer_slug = source_layer.split(":")[-1][:32]
    return f"{layer_slug}-{source_fid}"
