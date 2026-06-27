"""Sincronización de predios desde la capa vectorial oficial de GeoNode."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.geo import geojson_to_wkt, reproject_geojson
from app.geonode_client import fetch_wfs_geojson
from app.models import Parcel, ParcelStatus
from app.services.field_mapper import map_feature_properties, resolve_cadastral_code


def _feature_fid(feature: dict[str, Any]) -> str | None:
    fid = feature.get("id")
    if fid is not None:
        return str(fid)
    props = feature.get("properties") or {}
    for key in ("fid", "gid", "ogc_fid", "id"):
        if key in props and props[key] not in (None, ""):
            return str(props[key])
    return None


def _find_parcel(
    db: Session, *, source_layer: str, source_fid: str, cadastral_code: str
) -> Parcel | None:
    parcel = (
        db.query(Parcel)
        .filter(
            Parcel.source_layer == source_layer,
            Parcel.source_fid == source_fid,
        )
        .first()
    )
    if parcel:
        return parcel
    return db.query(Parcel).filter(Parcel.cadastral_code == cadastral_code).first()


def _apply_feature(
    db: Session,
    feature: dict[str, Any],
    *,
    source_layer: str,
    dry_run: bool,
) -> str:
    source_fid = _feature_fid(feature)
    if not source_fid:
        return "skipped"

    geometry = feature.get("geometry")
    if not geometry:
        return "skipped"

    props = feature.get("properties") or {}
    mapped = map_feature_properties(props, settings)
    cadastral_code = resolve_cadastral_code(
        mapped, source_layer=source_layer, source_fid=source_fid
    )

    parcel = _find_parcel(
        db,
        source_layer=source_layer,
        source_fid=source_fid,
        cadastral_code=cadastral_code,
    )
    now = datetime.now(timezone.utc)
    geom_for_db = reproject_geojson(
        db,
        geometry,
        from_srid=settings.metric_srid,
        to_srid=settings.geographic_srid,
    )
    wkt = geojson_to_wkt(geom_for_db, source_srid=settings.geographic_srid)

    if parcel is None:
        if dry_run:
            return "created"
        parcel = Parcel(
            cadastral_code=cadastral_code,
            predial_account=mapped.get("predial_account")
            if not settings.geonode_sync_geometry_only
            else None,
            colony=mapped.get("colony")
            if not settings.geonode_sync_geometry_only
            else None,
            address=mapped.get("address")
            if not settings.geonode_sync_geometry_only
            else None,
            area_m2=mapped.get("area_m2")
            if not settings.geonode_sync_geometry_only
            else None,
            land_use=mapped.get("land_use")
            if not settings.geonode_sync_geometry_only
            else None,
            status=ParcelStatus.ACTIVO,
            geom=wkt,
            source_layer=source_layer,
            source_fid=source_fid,
            synced_at=now,
        )
        db.add(parcel)
        return "created"

    if dry_run:
        return "updated"

    parcel.cadastral_code = cadastral_code
    if not settings.geonode_sync_geometry_only:
        parcel.predial_account = mapped.get("predial_account")
        parcel.colony = mapped.get("colony")
        parcel.address = mapped.get("address")
        parcel.area_m2 = mapped.get("area_m2")
        parcel.land_use = mapped.get("land_use")
    parcel.geom = wkt
    parcel.source_layer = source_layer
    parcel.source_fid = source_fid
    parcel.synced_at = now
    return "updated"


def _count_synced(layer: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Parcel)
            .filter(Parcel.source_layer == layer, Parcel.source_fid.isnot(None))
            .count()
        )
    finally:
        db.close()


async def sync_predios_from_geonode(
    *,
    max_features: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    layer = settings.geonode_source_layer.strip()
    if not layer:
        raise ValueError("GEONODE_SOURCE_LAYER no configurado")

    batch = settings.geonode_sync_batch_size
    start_index = 0
    stats = {
        "source_layer": layer,
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "fetched": 0,
        "dry_run": dry_run,
        "geometry_only": settings.geonode_sync_geometry_only,
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
                result = _apply_feature(
                    db, feature, source_layer=layer, dry_run=dry_run
                )
                stats[result] += 1
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

    stats["synced_total"] = _count_synced(layer)

    db = SessionLocal()
    try:
        from app.services.cadastral_alfanumerico import link_all_records

        stats["alfanumerico_relink"] = link_all_records(db, sync_summary=True)
        if not dry_run:
            db.commit()
    finally:
        db.close()

    return stats
