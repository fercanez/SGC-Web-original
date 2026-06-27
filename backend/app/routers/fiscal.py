"""Sincronización fiscal (adeudos) desde capas tributarias de GeoNode."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.config import settings
from app.geonode_client import check_wfs_access, credentials_configured
from app.services.adeudo_sync import sync_adeudos_from_geonode

router = APIRouter(prefix="/fiscal", tags=["fiscal"])


@router.get("/status")
async def fiscal_status():
    """Comprueba acceso WFS a la capa de adeudos."""
    layer = settings.geonode_adeudo_layer.strip()
    if not layer:
        return {
            "ok": False,
            "configured": False,
            "message": "GEONODE_ADEUDO_LAYER no configurado",
            "adeudo_layer": None,
        }
    result = await check_wfs_access(layer)
    return {
        **result,
        "adeudo_layer": layer,
        "sync_path": "/api/v1/fiscal/sync",
        "field_adeudo_2026": settings.geonode_field_adeudo_2026,
        "field_adeudo_total": settings.geonode_field_adeudo_total,
    }


@router.post("/sync")
async def sync_fiscal_adeudos(
    max_features: int | None = Query(
        None,
        ge=1,
        le=500000,
        description="Límite de features a importar (omitir = todas)",
    ),
    dry_run: bool = Query(
        False,
        description="Simula sin escribir en la base de datos",
    ),
    _=Depends(require_permission(Permission.PARCELS_SYNC.value)),
):
    """
    Actualiza adeudo_2026 y adeudo_total en predios_alfanumerico desde la capa
    tributaria de GeoNode (GEONODE_ADEUDO_LAYER). Requiere padrón importado.
    """
    layer = settings.geonode_adeudo_layer.strip()
    if not layer:
        raise HTTPException(
            status_code=503,
            detail="GEONODE_ADEUDO_LAYER no configurado en el servidor",
        )
    if not credentials_configured():
        raise HTTPException(
            status_code=503,
            detail="Configure GEONODE_USER y GEONODE_PASSWORD para sincronizar",
        )

    wfs = await check_wfs_access(layer)
    if not wfs.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=wfs.get("message", "Capa de adeudos no accesible"),
        )

    try:
        stats = await sync_adeudos_from_geonode(
            max_features=max_features, dry_run=dry_run
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error al sincronizar adeudos: {exc}",
        ) from exc

    return stats
