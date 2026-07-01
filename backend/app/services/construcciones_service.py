"""Construcciones cartográficas (WFS) y cuadro UTM del predio."""

from __future__ import annotations

import json
import math
from typing import Any

from shapely.geometry import shape
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.geo import normalize_for_map_display
from app.geonode_client import fetch_wfs
from app.services.cadastral_alfanumerico import normalize_cadastral_key
from app.services.field_mapper import pick_decimal, pick_property


def _construction_layer() -> str:
    return (settings.geonode_construcciones_layer or "").strip()


def _first_coordinate(geometry: dict[str, Any]) -> tuple[float, float] | None:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return None
    if gtype == "Point":
        return float(coords[0]), float(coords[1])
    if gtype == "Polygon" and coords[0]:
        p = coords[0][0]
        return float(p[0]), float(p[1])
    if gtype == "MultiPolygon" and coords[0] and coords[0][0]:
        p = coords[0][0][0]
        return float(p[0]), float(p[1])
    return None


def _infer_input_srid(geometry: dict[str, Any]) -> int:
    pt = _first_coordinate(geometry)
    if not pt:
        return settings.geographic_srid
    x, y = abs(pt[0]), abs(pt[1])
    if x > 180 or y > 90:
        return settings.metric_srid
    return settings.geographic_srid


def _normalize_cuadro_geometry(geometry: dict[str, Any]) -> dict[str, Any]:
    try:
        return normalize_for_map_display(geometry)
    except Exception:
        gtype = geometry.get("type")
        if gtype in ("Polygon", "MultiPolygon"):
            return geometry
        raise ValueError(f"Geometría no soportada para cuadro UTM: {gtype}")


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


def _feature_matches_clave(props: dict[str, Any], clave_norm: str) -> bool:
    fields = settings.field_candidates("geonode_field_construcc_padre")
    fields += settings.field_candidates("geonode_field_cadastral")
    seen: set[str] = set()
    for field in fields:
        if field in seen:
            continue
        seen.add(field)
        val = pick_property(props, [field])
        if val is None:
            continue
        cand = normalize_cadastral_key(str(val)) or str(val).strip().upper()
        if cand == clave_norm:
            return True
    return False


def _bbox_from_geometry(
    geometry: dict[str, Any], *, pad: float = 0.00008
) -> tuple[float, float, float, float] | None:
    try:
        minx, miny, maxx, maxy = shape(geometry).bounds
    except Exception:
        return None
    return minx - pad, miny - pad, maxx + pad, maxy + pad


async def _wfs_get_features(
    params: dict[str, str], *, layer: str | None = None
) -> list[dict[str, Any]]:
    resp = await fetch_wfs(params, timeout=45.0, layer=layer)
    resp.raise_for_status()
    payload = resp.json()
    return payload.get("features") or []


async def _fetch_construcciones_mature_wfs(
    clave: str, layer: str
) -> list[dict[str, Any]]:
    """
    Paridad SGC maduro (06-construcciones-medicion.js):
    WFS 1.1.0 en /geoserver/geonode/wfs con
    CQL clavecatas='X' OR claveorig='X'.
    """
    safe = clave.replace("'", "''").strip().upper()
    cql = f"clavecatas='{safe}' OR claveorig='{safe}'"
    attempts: list[dict[str, str]] = [
        {
            "service": "WFS",
            "version": "1.1.0",
            "request": "GetFeature",
            "typeName": layer,
            "outputFormat": "application/json",
            "srsName": "EPSG:3857",
            "maxFeatures": "100",
            "CQL_FILTER": cql,
        },
        {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": layer,
            "outputFormat": "application/json",
            "srsName": f"EPSG:{settings.geographic_srid}",
            "count": "100",
            "CQL_FILTER": cql,
        },
    ]
    for params in attempts:
        try:
            features = await _wfs_get_features(params, layer=layer)
            if features:
                return features
        except Exception:
            continue
    return []


async def _fetch_construcciones_by_bbox(
    geometry: dict[str, Any], layer: str
) -> list[dict[str, Any]]:
    bbox = _bbox_from_geometry(geometry)
    if not bbox:
        return []
    minx, miny, maxx, maxy = bbox
    geom_fields = settings.field_candidates("geonode_field_construcc_geom") or [
        "the_geom",
        "geom",
        "geometry",
    ]
    srs = f"EPSG:{settings.geographic_srid}"
    bbox_param = f"{minx},{miny},{maxx},{maxy},urn:ogc:def:crs:EPSG::{settings.geographic_srid}"

    for geom_field in geom_fields:
        cql = (
            f"BBOX({geom_field},{minx},{miny},{maxx},{maxy},'{srs}')"
        )
        try:
            features = await _wfs_get_features(
                {
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": layer,
                    "outputFormat": "application/json",
                    "srsName": srs,
                    "count": "80",
                    "CQL_FILTER": cql,
                },
                layer=layer,
            )
            if features:
                return features
        except Exception:
            pass

        try:
            features = await _wfs_get_features(
                {
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": layer,
                    "outputFormat": "application/json",
                    "srsName": srs,
                    "count": "80",
                    "bbox": bbox_param,
                },
                layer=layer,
            )
            if features:
                return features
        except Exception:
            continue

    return []


async def _fetch_construcciones_by_intersects(
    geometry: dict[str, Any], layer: str
) -> list[dict[str, Any]]:
    try:
        wkt = shape(geometry).wkt
    except Exception:
        return []

    geom_fields = settings.field_candidates("geonode_field_construcc_geom") or [
        "the_geom",
        "geom",
        "geometry",
    ]
    srs = f"EPSG:{settings.geographic_srid}"

    for geom_field in geom_fields:
        for cql in (
            f"INTERSECTS({geom_field}, {wkt})",
            f"INTERSECTS({geom_field}, SRID=4326;{wkt})",
        ):
            try:
                features = await _wfs_get_features(
                    {
                        "service": "WFS",
                        "version": "2.0.0",
                        "request": "GetFeature",
                        "typeNames": layer,
                        "outputFormat": "application/json",
                        "srsName": srs,
                        "count": "80",
                        "CQL_FILTER": cql,
                    },
                    layer=layer,
                )
                if features:
                    return features
            except Exception:
                continue
    return []


async def _fetch_construcciones_spatial(
    geometry: dict[str, Any], layer: str
) -> list[dict[str, Any]]:
    """Consulta espacial (paridad SGC maduro): INTERSECTS + BBOX sobre el predio."""
    features = await _fetch_construcciones_by_intersects(geometry, layer)
    if features:
        return features
    return await _fetch_construcciones_by_bbox(geometry, layer)


def _friendly_wfs_error(exc: Exception) -> str:
    text = str(exc)
    if "401" in text or "403" in text:
        return (
            "GeoServer rechazó las credenciales WFS. "
            "Revise GEONODE_USER y GEONODE_PASSWORD."
        )
    if "400" in text:
        return (
            "GeoServer no aceptó el filtro WFS sobre construcciones. "
            "Se intentó consulta espacial por el contorno del predio."
        )
    if len(text) > 180:
        return text[:180] + "…"
    return text


async def fetch_construcciones_by_clave(
    clave: str, db: Session | None = None
) -> dict[str, Any]:
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

    srs = f"EPSG:{settings.geographic_srid}"
    last_error: str | None = None

    # 1) WFS maduro: clavecatas OR claveorig (06-construcciones-medicion.js)
    try:
        features = await _fetch_construcciones_mature_wfs(safe, layer)
        if features:
            items = [_map_construction_feature(f) for f in features]
            return {
                "clave_catastral": safe,
                "layer": layer,
                "field_used": "clavecatas_or_claveorig",
                "items": items,
            }
    except PermissionError as exc:
        return {
            "clave_catastral": safe,
            "layer": layer,
            "items": [],
            "message": str(exc),
        }
    except Exception as exc:
        last_error = _friendly_wfs_error(exc)

    predio_geom: dict[str, Any] | None = None
    if db is not None:
        try:
            from app.services.map_geometry import resolve_map_geometry

            map_data = await resolve_map_geometry(db, clave)
            predio_geom = map_data.get("geometry")
        except Exception:
            predio_geom = None

    # 2) Consulta espacial por contorno del predio
    if predio_geom:
        try:
            features = await _fetch_construcciones_spatial(predio_geom, layer)
            matched = [
                f
                for f in features
                if _feature_matches_clave(f.get("properties") or {}, safe)
            ]
            use = matched if matched else features
            items = [_map_construction_feature(f) for f in use]
            if items:
                return {
                    "clave_catastral": safe,
                    "layer": layer,
                    "field_used": "spatial_intersect",
                    "items": items,
                }
        except PermissionError as exc:
            return {
                "clave_catastral": safe,
                "layer": layer,
                "items": [],
                "message": str(exc),
            }
        except Exception as exc:
            last_error = _friendly_wfs_error(exc)

    # 3) Filtro por atributo clave (si la capa expone el campo)
    for field in padre_fields:
        for cql in (
            f"{field}='{safe}'",
            f"strEqualsIgnoreCase({field},'{safe}')",
        ):
            try:
                features = await _wfs_get_features(
                    {
                        "service": "WFS",
                        "version": "2.0.0",
                        "request": "GetFeature",
                        "typeNames": layer,
                        "outputFormat": "application/json",
                        "srsName": srs,
                        "count": "50",
                        "CQL_FILTER": cql,
                    },
                    layer=layer,
                )
                items = [_map_construction_feature(f) for f in features]
                if items:
                    return {
                        "clave_catastral": safe,
                        "layer": layer,
                        "field_used": field,
                        "items": items,
                    }
            except PermissionError as exc:
                return {
                    "clave_catastral": safe,
                    "layer": layer,
                    "items": [],
                    "message": str(exc),
                }
            except Exception as exc:
                last_error = _friendly_wfs_error(exc)
                continue

    return {
        "clave_catastral": safe,
        "layer": layer,
        "items": [],
        "message": last_error or "Sin construcciones en la capa WFS para esta clave",
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


def _cuadro_metrics(
    db: Session, geometry: dict[str, Any], geo_srid: int
) -> dict[str, Any] | None:
    row = db.execute(
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
            "geo_srid": geo_srid,
            "metric_srid": settings.metric_srid,
        },
    ).mappings().first()
    return dict(row) if row else None


def _wgs84_to_utm11(lon: float, lat: float) -> tuple[float, float]:
    """Proyección WGS84 → UTM 11N (paridad cliente / SGC maduro)."""
    a = 6378137.0
    f = 1 / 298.257223563
    k0 = 0.9996
    zone = 11
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    e2 = 2 * f - f * f
    e_prime2 = e2 / (1 - e2)
    n = a / math.sqrt(1 - e2 * math.sin(lat_rad) ** 2)
    t = math.tan(lat_rad) ** 2
    c = e_prime2 * math.cos(lat_rad) ** 2
    aa = math.cos(lat_rad) * (lon_rad - lon0)
    m = a * (
        (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * lat_rad
        - (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * math.sin(2 * lat_rad)
        + (15 * e2**2 / 256 + 45 * e2**3 / 1024) * math.sin(4 * lat_rad)
        - (35 * e2**3 / 3072) * math.sin(6 * lat_rad)
    )
    x = (
        k0
        * n
        * (
            aa
            + (1 - t + c) * aa**3 / 6
            + (5 - 18 * t + t**2 + 72 * c - 58 * e_prime2) * aa**5 / 120
        )
        + 500000
    )
    y = k0 * (
        m
        + n
        * math.tan(lat_rad)
        * (
            aa**2 / 2
            + (5 - t + 9 * c + 4 * c**2) * aa**4 / 24
            + (61 - 58 * t + t**2 + 600 * c - 330 * e_prime2) * aa**6 / 720
        )
    )
    return x, y


def _ring_from_wgs84_geometry(geometry: dict[str, Any]) -> list[tuple[float, float]]:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Polygon" and coords:
        ring = coords[0]
    elif gtype == "MultiPolygon" and coords:
        ring = max((p[0] for p in coords), key=len, default=[])
    else:
        return []
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    out: list[tuple[float, float]] = []
    for p in ring:
        if len(p) < 2:
            continue
        lon, lat = float(p[0]), float(p[1])
        if abs(lon) > 180 or abs(lat) > 90:
            out.append((lon, lat))
        else:
            out.append(_wgs84_to_utm11(lon, lat))
    return out


def _build_cuadro_python(geometry: dict[str, Any]) -> dict[str, Any]:
    """Cuadro UTM sin PostGIS — mismo enfoque que popupConstrCalcularCuadro."""
    metric_srid = settings.metric_srid
    ring = _ring_from_wgs84_geometry(geometry)
    if len(ring) < 3:
        return {
            "srid": metric_srid,
            "area_m2": None,
            "perimetro_m": None,
            "vertices": [],
            "error": "Contorno con menos de 3 vértices",
        }

    area = 0.0
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
    area = abs(area) / 2

    vertices: list[dict[str, Any]] = []
    perimetro = 0.0
    closed = ring + [ring[0]]
    for i in range(n):
        j = (i + 1) % n
        x1, y1 = ring[i]
        x2, y2 = closed[i + 1]
        dist = math.hypot(x2 - x1, y2 - y1)
        perimetro += dist
        dx = x2 - x1
        dy = y2 - y1
        ang = (math.degrees(math.atan2(dx, dy)) + 360) % 360
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
        "area_m2": round(area, 2),
        "perimetro_m": round(perimetro, 2),
        "vertices": vertices,
    }


def build_cuadro_construccion_utm(
    db: Session, geometry: dict[str, Any]
) -> dict[str, Any]:
    """Cuadro de vértices en UTM (metric_srid) con distancias y ángulos."""
    metric_srid = settings.metric_srid
    try:
        geom = _normalize_cuadro_geometry(geometry)
    except ValueError as exc:
        return {
            "srid": metric_srid,
            "area_m2": None,
            "perimetro_m": None,
            "vertices": [],
            "error": str(exc),
        }

    geo_srid = _infer_input_srid(geom)
    metrics: dict[str, Any] | None = None
    try:
        metrics = _cuadro_metrics(db, geom, geo_srid)
    except Exception:
        metrics = None

    if not metrics or not metrics.get("geom_utm"):
        alt_srid = (
            settings.metric_srid
            if geo_srid == settings.geographic_srid
            else settings.geographic_srid
        )
        try:
            metrics = _cuadro_metrics(db, geom, alt_srid)
        except Exception:
            try:
                return _build_cuadro_python(geom)
            except Exception as exc:
                return {
                    "srid": metric_srid,
                    "area_m2": None,
                    "perimetro_m": None,
                    "vertices": [],
                    "error": f"No se pudo calcular cuadro UTM: {exc}",
                }

    if not metrics or not metrics.get("geom_utm"):
        try:
            return _build_cuadro_python(geom)
        except Exception as exc:
            return {
                "srid": metric_srid,
                "area_m2": None,
                "perimetro_m": None,
                "vertices": [],
                "error": f"No se pudo calcular cuadro UTM: {exc}",
            }

    utm_geom = json.loads(metrics["geom_utm"])
    ring = _ring_from_utm_geojson(utm_geom)
    if len(ring) < 3:
        return {
            "srid": metric_srid,
            "area_m2": None,
            "perimetro_m": None,
            "vertices": [],
            "error": "Contorno con menos de 3 vértices",
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
