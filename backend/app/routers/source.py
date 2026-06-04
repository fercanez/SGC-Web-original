"""Origen vectorial oficial: capa prediosmxli (Predios Mexicali) en GeoNode."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.config import settings
from app.database import get_db
from app.geonode_client import check_wfs_access, credentials_configured
from app.models import Parcel
from app.services.predio_sync import sync_predios_from_geonode

router = APIRouter(prefix="/source", tags=["source"])


def _source_summary(db: Session | None = None) -> dict:
    layer = settings.geonode_source_layer.strip()
    synced = 0
    if db is not None and layer:
        synced = (
            db.query(Parcel)
            .filter(Parcel.source_layer == layer, Parcel.source_fid.isnot(None))
            .count()
        )
    return {
        "enabled": bool(layer and settings.geonode_url),
        "layer": layer or None,
        "title": settings.geonode_source_title,
        "srid": settings.geonode_source_srid,
        "credentials_configured": credentials_configured(),
        "synced_parcels": synced,
        "wfs_path": "/api/v1/source/status",
        "sync_path": "/api/v1/source/sync",
        "fiscal_sync_path": "/api/v1/fiscal/sync",
        "skip_demo_seed": settings.skip_demo_when_source_layer and bool(layer),
    }


@router.get("/info")
def source_info(db: Session = Depends(get_db)):
    """Metadatos del origen cartográfico y vectorial oficial."""
    return _source_summary(db)


@router.get("/status")
async def source_status():
    """Comprueba acceso WFS a la capa de origen (sin exponer credenciales)."""
    result = await check_wfs_access()
    return {**result, "title": settings.geonode_source_title}


@router.post("/sync")
async def sync_from_geonode(
    max_features: int | None = Query(
        None,
        ge=1,
        le=50000,
        description="Límite de features a importar (omitir = todas)",
    ),
    dry_run: bool = Query(
        False,
        description="Simula la sincronización sin escribir en la base de datos",
    ),
    _=Depends(require_permission(Permission.PARCELS_SYNC.value)),
):
    """
    Importa o actualiza predios desde la capa vectorial oficial de GeoNode
    (`GEONODE_SOURCE_LAYER`, por defecto `geonode:prediosmxli`).
    """
    if not settings.geonode_source_layer.strip():
        raise HTTPException(
            status_code=503,
            detail="GEONODE_SOURCE_LAYER no configurado en el servidor",
        )
    if not credentials_configured():
        raise HTTPException(
            status_code=503,
            detail="Configure GEONODE_USER y GEONODE_PASSWORD para sincronizar",
        )

    wfs = await check_wfs_access()
    if not wfs.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=wfs.get("message", "Capa vectorial no accesible"),
        )

    try:
        stats = await sync_predios_from_geonode(
            max_features=max_features, dry_run=dry_run
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error al sincronizar desde GeoNode: {exc}",
        ) from exc

    return stats
