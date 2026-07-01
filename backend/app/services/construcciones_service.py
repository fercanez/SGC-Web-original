"""Construcciones cartográficas (WFS) y cuadro UTM del predio."""

from __future__ import annotations

import json
import math
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.geonode_client import fetch_wfs
from app.services.field_mapper import pick_decimal, pick_property


def _construction_layer() -> str:
    return (settings.geonode_construcciones_layer or "").strip()


def _map_construction_feature(feature: dict[str, Any]) -> dict[str, Any]:
    props = feature.get("properties") or {}
    geom = feature.get("geometry")
    perimetro = pick_decimal(
        props, settings.field_candidates("geonode_field_construcc_perimetro")
    )
    if perimetro is None and geom:
        perimetro = _perimeter_from_geojson_metric(geom)

    return {
        "clave_const": pick_property(
            props, settings.field_candidates("geonode_field_construcc_num")
        ),
        "niveles": pick_property(
            props, settings.field_candidates("geonode_field_construcc_niveles")
        ),
        "sup_inc_m2": pick_decimal(
            props, settings.field_candidates("geonode_field_construcc_sup")
        ),
        "tipo": pick_property(
            props, settings.field_candidates("geonode_field_construcc_tipo")
        ),
        "perimetro_m": float(perimetro) if perimetro is not None else None,
        "geometry": geom,
    }


def _perimeter_from_geojson_metric(geom: dict[str, Any]) -> float | None:
    if geom.get("type") != "Polygon":
        return None
    ring = geom.get("coordinates", [[]])[0]
    if len(ring) < 3:
        return None
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += math.hypot(x2 - x1, y2 - y1)
    return round(total, 4)


async def fetch_construcciones_by_clave(clave: str) -> dict[str, Any]:
    layer = _construction_layer()
    if not layer:
        return {
            "clave_catastral": clave.strip().upper(),
            "layer": None,
            "items": [],
            "message": "Capa de construcciones no configurada (GEONODE_CONSTRUCCIONES_LAYER)",
        }

    safe = clave.replace("'", "''").strip().upper()
    padre_fields = settings.field_candidates("geonode_field_construcc_padre")
    if not padre_fields:
        padre_fields = settings.field_candidates("geonode_field_cadastral")

    last_error: str | None = None
    for field in padre_fields:
        cql = f"UPPER({field})='{safe}'"
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": layer,
            "outputFormat": "application/json",
            "srsName": f"EPSG:{settings.geographic_srid}",
            "count": "50",
            "CQL_FILTER": cql,
        }
        try:
            resp = await fetch_wfs(params, timeout=45.0)
            resp.raise_for_status()
            payload = resp.json()
            features = payload.get("features") or []
            items = [_map_construction_feature(f) for f in features]
            return {
                "clave_catastral": safe,
                "layer": layer,
                "field_used": field,
                "items": items,
            }
        except Exception as exc:
            last_error = str(exc)
            continue

    return {
        "clave_catastral": safe,
        "layer": layer,
        "items": [],
        "message": last_error or "Sin construcciones en la capa WFS",
    }


def _ring_from_utm_geojson(geom: dict[str, Any]) -> list[tuple[float, float]]:
    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if gtype == "Polygon" and coords:
        ring = coords[0]
    elif gtype == "MultiPolygon" and coords:
        ring = max((p[0] for p in coords), key=len, default=[])
    else:
        return []
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return [(float(p[0]), float(p[1])) for p in ring if len(p) >= 2]


def build_cuadro_construccion_utm(
    db: Session, geometry: dict[str, Any]
) -> dict[str, Any]:
    """Cuadro de vértices en UTM (metric_srid) con distancias y ángulos."""
    metric_srid = settings.metric_srid
    metrics = db.execute(
        text(
            """
            SELECT
              ST_Area(
                ST_Transform(
                  ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :geo_srid),
                  :metric_srid
                )::geography
              ) AS area_m2,
              ST_Perimeter(
                ST_Transform(
                  ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :geo_srid),
                  :metric_srid
                )::geography
              ) AS perimetro_m,
              ST_AsGeoJSON(
                ST_Transform(
                  ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :geo_srid),
                  :metric_srid
                )
              ) AS geom_utm
            """
        ),
        {
            "geojson": json.dumps(geometry),
            "geo_srid": settings.geographic_srid,
            "metric_srid": metric_srid,
        },
    ).mappings().first()

    if not metrics or not metrics.get("geom_utm"):
        return {
            "srid": metric_srid,
            "area_m2": None,
            "perimetro_m": None,
            "vertices": [],
        }

    utm_geom = json.loads(metrics["geom_utm"])
    ring = _ring_from_utm_geojson(utm_geom)
    if len(ring) < 3:
        return {
            "srid": metric_srid,
            "area_m2": None,
            "perimetro_m": None,
            "vertices": [],
        }

    vertices: list[dict[str, Any]] = []
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        x1, y1 = ring[i]
        x2, y2 = ring[j]
        dist = math.hypot(x2 - x1, y2 - y1)
        prev_i = (i - 1) % n
        ax, ay = ring[prev_i]
        bx, by = ring[i]
        cx, cy = ring[j]
        v1 = (ax - bx, ay - by)
        v2 = (cx - bx, cy - by)
        dot = v1[0] * v2[0] + v1[1] * v2[1]
        m1 = math.hypot(v1[0], v1[1]) or 1.0
        m2 = math.hypot(v2[0], v2[1]) or 1.0
        cos_a = max(-1.0, min(1.0, dot / (m1 * m2)))
        ang = math.degrees(math.acos(cos_a))
        vertices.append(
            {
                "vertice": f"P{i + 1}",
                "lado": f"P{i + 1}-P{j + 1}",
                "dist_m": round(dist, 2),
                "angulo_deg": round(ang, 2),
                "este": round(x1, 3),
                "norte": round(y1, 3),
            }
        )

    return {
        "srid": metric_srid,
        "area_m2": round(float(metrics["area_m2"]), 2)
        if metrics["area_m2"] is not None
        else None,
        "perimetro_m": round(float(metrics["perimetro_m"]), 2)
        if metrics["perimetro_m"] is not None
        else None,
        "vertices": vertices,
    }
