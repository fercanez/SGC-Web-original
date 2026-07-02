"""Identificación de predio por coordenada (clic en mapa)."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.geo import reproject_geojson
from app.geonode_client import _extract_clave_from_wfs_props, fetch_wfs_at_point
from app.services.cadastral_alfanumerico import normalize_cadastral_key

logger = logging.getLogger(__name__)


def _pick_from_catastro_predios(
    db: Session, lon: float, lat: float
) -> dict[str, Any] | None:
    """Paridad SGC maduro: catastro.predios en UTM (metric_srid)."""
    metric = settings.metric_srid
    row = db.execute(
        text("""
            WITH punto AS (
                SELECT ST_Transform(
                    ST_SetSRID(ST_Point(:lon, :lat), 4326),
                    :metric_srid
                ) AS geom
            )
            SELECT
                p.id::text AS parcel_id,
                p.clave_catastral,
                ST_AsGeoJSON(ST_Transform(p.geom, 4326))::json AS geometry
            FROM catastro.predios p, punto pt
            WHERE p.geom IS NOT NULL
              AND (p.vigente IS TRUE OR p.vigente IS NULL)
              AND (
                    ST_Intersects(p.geom, pt.geom)
                    OR ST_DWithin(p.geom, pt.geom, 2)
              )
            ORDER BY
                CASE WHEN ST_Intersects(p.geom, pt.geom) THEN 0 ELSE 1 END,
                ST_Area(p.geom) ASC,
                ST_Distance(p.geom, pt.geom) ASC
            LIMIT 1
        """),
        {"lon": lon, "lat": lat, "metric_srid": metric},
    ).mappings().first()

    if not row or not row.get("clave_catastral"):
        return None

    geom = row.get("geometry")
    if isinstance(geom, str):
        geom = json.loads(geom)

    clave = normalize_cadastral_key(str(row["clave_catastral"])) or str(
        row["clave_catastral"]
    ).strip().upper()

    return {
        "clave_catastral": clave,
        "geometry": geom,
        "parcel_id": row.get("parcel_id"),
        "source": "catastro_predios",
    }


def _pick_from_parcels_table(
    db: Session, lon: float, lat: float
) -> dict[str, Any] | None:
    """Respaldo: tabla ORM parcels (4326) si existe."""
    row = db.execute(
        text("""
            SELECT
                id::text AS parcel_id,
                cadastral_code,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM parcels
            WHERE geom IS NOT NULL
              AND (
                    ST_Intersects(
                        geom,
                        ST_SetSRID(ST_Point(:lon, :lat), 4326)
                    )
                    OR ST_DWithin(
                        geom::geography,
                        ST_SetSRID(ST_Point(:lon, :lat), 4326)::geography,
                        3
                    )
              )
            ORDER BY ST_Area(geom::geography) ASC
            LIMIT 1
        """),
        {"lon": lon, "lat": lat},
    ).mappings().first()

    if not row or not row.get("cadastral_code"):
        return None

    geom = row.get("geometry")
    if isinstance(geom, str):
        geom = json.loads(geom)

    return {
        "clave_catastral": normalize_cadastral_key(str(row["cadastral_code"]))
        or str(row["cadastral_code"]).strip().upper(),
        "geometry": geom,
        "parcel_id": row.get("parcel_id"),
        "source": "database",
    }


def _pick_from_db(db: Session, lon: float, lat: float) -> dict[str, Any] | None:
    for fn in (_pick_from_catastro_predios, _pick_from_parcels_table):
        try:
            hit = fn(db, lon, lat)
            if hit:
                return hit
        except Exception as exc:
            logger.warning("pick predio at point (%s): %s", fn.__name__, exc)
    return None


def _prepare_wfs_geometry(
    db: Session,
    geom: dict[str, Any],
    *,
    from_srid: int,
) -> dict[str, Any]:
    out_srid = settings.geographic_srid
    if from_srid != out_srid:
        try:
            geom = reproject_geojson(db, geom, from_srid=from_srid, to_srid=out_srid)
        except Exception:
            pass
    return geom


async def resolve_predio_at_point(
    db: Session,
    lon: float,
    lat: float,
) -> dict[str, Any] | None:
    """Predio bajo un clic: PostGIS local y luego WFS GeoServer."""
    db_hit = _pick_from_db(db, lon, lat)
    if db_hit:
        return db_hit

    try:
        payload = await fetch_wfs_at_point(lon, lat)
    except Exception as exc:
        logger.warning("WFS at point: %s", exc)
        return None

    features = payload.get("features") or []
    if not features:
        return None

    from_srid = int(payload.get("_wfs_srid") or settings.geographic_srid)
    for feature in features:
        props = feature.get("properties") or {}
        clave = _extract_clave_from_wfs_props(props)
        if not clave:
            continue
        geom = feature.get("geometry")
        if geom:
            try:
                geom = _prepare_wfs_geometry(db, geom, from_srid=from_srid)
            except Exception:
                pass
        return {
            "clave_catastral": clave,
            "geometry": geom,
            "source": "geonode_wfs",
        }

    return None
