"""Geometría para resaltar en mapa: prioriza GeoServer WFS (igual que WMS)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.geo import count_vertices, normalize_for_map_display, reproject_geojson
from app.geonode_client import fetch_wfs_by_cadastral_code
from app.models import Parcel
from app.services.cadastral_alfanumerico import normalize_cadastral_key


def _geometry_from_parcel(db: Session, parcel_id: str) -> dict[str, Any] | None:
    from sqlalchemy import func, select

    row = db.execute(
        select(func.ST_AsGeoJSON(Parcel.geom)).where(Parcel.id == parcel_id)
    ).scalar_one_or_none()
    if not row:
        return None
    return json.loads(row)


def _wfs_clave_from_props(props: dict[str, Any]) -> str | None:
    for cand in settings.field_candidates("geonode_field_cadastral"):
        for key, value in props.items():
            if str(key).lower() == cand and value not in (None, ""):
                return str(value).strip()
    return None


def _prepare_geometry_for_map(
    db: Session,
    geom: dict[str, Any],
    *,
    from_srid: int,
    simplify: bool = False,
) -> dict[str, Any]:
    """UTM (32611) → WGS84 (4326). simplify=True solo para relleno de manzana (batch)."""
    if from_srid != settings.geographic_srid:
        geom = reproject_geojson(
            db, geom, from_srid=from_srid, to_srid=settings.geographic_srid
        )
    if simplify:
        return normalize_for_map_display(geom)
    return geom


def _apply_wfs_payload(
    db: Session,
    result: dict[str, Any],
    payload: dict[str, Any],
    *,
    norm: str,
    layer: str,
) -> bool:
    features = payload.get("features") or []
    result["wfs_feature_count"] = max(result["wfs_feature_count"], len(features))
    result["wfs_field"] = payload.get("_wfs_field_used")
    result["wfs_srid"] = payload.get("_wfs_srid", settings.metric_srid)
    result["wfs_layer"] = layer

    for feature in features:
        props = feature.get("properties") or {}
        wfs_clave = _wfs_clave_from_props(props)
        if wfs_clave and normalize_cadastral_key(wfs_clave) != norm:
            continue
        raw_geom = feature.get("geometry")
        if not raw_geom:
            continue
        result["geometry"] = _prepare_geometry_for_map(
            db, raw_geom, from_srid=int(result["wfs_srid"])
        )
        result["source"] = "geonode_wfs"
        result["wfs_cadastral_code"] = wfs_clave or norm
        return True

    if features and not result["geometry"]:
        result["note"] = (
            f"WFS ({layer}) devolvió {len(features)} feature(s) pero ninguna "
            f"coincide con clave {norm}."
        )
    return False


async def resolve_map_geometry(
    db: Session,
    clave: str,
) -> dict[str, Any]:
    """
    Devuelve geometría para el visor en EPSG:4326.
    1) WFS en vivo (prueba capa origen + capas WMS de predios)
    2) parcels.geom en PostgreSQL (copia del último sync)
    """
    norm = normalize_cadastral_key(clave) or clave.strip().upper()
    native_srid = settings.metric_srid
    result: dict[str, Any] = {
        "clave_catastral": norm,
        "geometry": None,
        "source": None,
        "wfs_feature_count": 0,
        "wfs_srid": native_srid,
        "display_srid": settings.geographic_srid,
        "database_cadastral_code": None,
        "note": None,
    }

    wfs_layers = settings.geonode_predio_wfs_layers()
    wfs_errors: list[str] = []

    for layer in wfs_layers:
        try:
            payload = await fetch_wfs_by_cadastral_code(
                norm, type_name=layer, max_features=5
            )
            if _apply_wfs_payload(db, result, payload, norm=norm, layer=layer):
                break
        except PermissionError as exc:
            wfs_errors.append(str(exc))
            break
        except Exception as exc:
            wfs_errors.append(f"{layer}: {exc}")
            continue

    if result["geometry"] is None and wfs_errors:
        result["note"] = (
            "WFS no disponible (" + "; ".join(wfs_errors[:2]) + "); "
            "usando copia en base de datos."
        )

    if result["geometry"] is None:
        parcel = db.query(Parcel).filter(Parcel.cadastral_code == norm).first()
        if parcel and parcel.geom is not None:
            result["geometry"] = _geometry_from_parcel(db, parcel.id)
            result["source"] = "database_sync"
            result["database_cadastral_code"] = parcel.cadastral_code
            result["note"] = (
                (result.get("note") or "")
                + " Geometría de sync previo; ejecute POST /source/sync para actualizar."
            ).strip()

    if result["geometry"] is None:
        result["note"] = (
            result.get("note")
            or "Sin geometría en GeoServer ni en PostgreSQL para esta clave."
        )
    elif result["geometry"]:
        result["vertex_count"] = count_vertices(result["geometry"])

    return result
