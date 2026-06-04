import json
from typing import Any

from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.validation import make_valid
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Parcel


def reproject_geojson(
    db: Session,
    geojson_geom: dict[str, Any],
    *,
    from_srid: int,
    to_srid: int | None = None,
) -> dict[str, Any]:
    """Reproyecta GeoJSON con PostGIS (p. ej. UTM 32611 → WGS84 4326)."""
    target = to_srid or settings.geographic_srid
    if from_srid == target:
        return geojson_geom
    from sqlalchemy import text

    row = db.execute(
        text(
            "SELECT ST_AsGeoJSON("
            "ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:g), :from_srid), :to_srid)"
            ")"
        ),
        {"g": json.dumps(geojson_geom), "from_srid": from_srid, "to_srid": target},
    ).scalar()
    if not row:
        return geojson_geom
    return json.loads(row)


def normalize_for_map_display(geojson_geom: dict[str, Any]) -> dict[str, Any]:
    """
    Un solo polígono simple para resaltar (sin agujeros ni multiparte).
    Evita formas en L por MultiPolygon, interior rings o geometría inválida.
    """
    geom = make_valid(shape(geojson_geom))

    if geom.geom_type == "MultiPolygon":
        geom = max(geom.geoms, key=lambda g: g.area)
    elif geom.geom_type == "GeometryCollection":
        parts = [
            g
            for g in geom.geoms
            if g.geom_type in ("Polygon", "MultiPolygon")
        ]
        if parts:
            geom = max(parts, key=lambda g: g.area if hasattr(g, "area") else 0)
            if geom.geom_type == "MultiPolygon":
                geom = max(geom.geoms, key=lambda g: g.area)

    if geom.geom_type == "Polygon":
        geom = Polygon(geom.exterior)
    elif geom.geom_type != "Polygon":
        return geojson_geom

    geom = geom.simplify(tolerance=0.000001, preserve_topology=True)
    return mapping(geom)


def count_vertices(geojson_geom: dict[str, Any]) -> int:
    gtype = geojson_geom.get("type")
    coords = geojson_geom.get("coordinates")
    if not coords:
        return 0
    if gtype == "Polygon":
        return len(coords[0]) if coords else 0
    if gtype == "MultiPolygon" and coords:
        return len(coords[0][0]) if coords[0] else 0
    return 0


def geojson_to_wkt(
    geojson: dict[str, Any],
    *,
    source_srid: int | None = None,
) -> WKTElement:
    geom = shape(geojson)
    if geom.geom_type == "Polygon":
        from shapely.geometry import MultiPolygon

        geom = MultiPolygon([geom])
    srid = source_srid or settings.geographic_srid
    return WKTElement(geom.wkt, srid=srid)


def parcel_to_geojson(db: Session, parcel: Parcel) -> dict[str, Any] | None:
    if parcel.geom is None:
        return None
    row = db.execute(
        select(func.ST_AsGeoJSON(parcel.geom))
    ).scalar_one_or_none()
    if row is None:
        return None
    return json.loads(row)


def shape_to_geojson(geom_wkb: Any) -> dict[str, Any]:
    return mapping(to_shape(geom_wkb))
