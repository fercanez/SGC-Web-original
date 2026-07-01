from fastapi import APIRouter

from app.config import settings
from app.geonode_client import credentials_configured
from app.municipality import get_municipality

router = APIRouter(prefix="/config", tags=["config"])


@router.get("")
def public_config():
    """Configuración pública para el cliente web (mapa, GeoNode, validaciones)."""
    muni = get_municipality()
    layers = settings.geonode_layer_list()
    return {
        "municipality": {
            "name": settings.municipality_name,
            "state": settings.state_name,
            "full_name": muni.full_name,
            "state_code": muni.state_code,
            "municipality_code": muni.municipality_code,
        },
        "map": {
            "center": [settings.default_map_center_lon, settings.default_map_center_lat],
            "zoom": settings.default_map_zoom,
            "geographic_srid": settings.geographic_srid,
            "metric_srid": settings.metric_srid,
        },
        "cadastral": {
            "pattern": settings.cadastral_code_pattern,
            "example": muni.cadastral_example,
            "help": muni.cadastral_help,
        },
        "geonode": {
            "enabled": bool(settings.geonode_url and layers),
            "use_proxy": bool(settings.geonode_url),
            "auth_required": settings.geonode_auth_required,
            "credentials_configured": credentials_configured(),
            "wms_proxy_path": "/api/v1/geonode/wms",
            "status_path": "/api/v1/geonode/status",
            "layer_count": len(layers),
            "layers": layers,
            "fallback_osm": True,
        },
        "source": {
            "enabled": bool(
                settings.geonode_url and settings.geonode_source_layer.strip()
            ),
            "layer": settings.geonode_source_layer.strip() or None,
            "title": settings.geonode_source_title,
            "srid": settings.geonode_source_srid,
            "status_path": "/api/v1/source/status",
            "sync_path": "/api/v1/source/sync",
            "info_path": "/api/v1/source/info",
        },
        "construcciones": {
            "enabled": bool(
                settings.geonode_url and settings.geonode_construcciones_layer.strip()
            ),
            "layer": settings.geonode_construcciones_layer.strip() or None,
            "title": settings.geonode_construcciones_title,
            "wms_id": settings.geonode_construcciones_layer.replace(":", "_")
            if settings.geonode_construcciones_layer
            else None,
            "wfs_path": "/geoserver/geonode/wfs"
            if settings.geonode_url
            else None,
            "base_url": settings.geonode_url or None,
        },
        "locale": {
            "language": "es-MX",
            "currency": "MXN",
        },
    }
