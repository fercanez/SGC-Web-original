"""Proxy WMS hacia GeoServer/GeoNode (credenciales solo en servidor)."""

from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Response

from app.config import settings
from app.geonode_client import check_wms_access, credentials_configured, fetch_wms

router = APIRouter(prefix="/geonode", tags=["geonode"])

ALLOWED_WMS_PARAMS = frozenset(
    {
        "service",
        "version",
        "request",
        "layers",
        "styles",
        "format",
        "transparent",
        "srs",
        "crs",
        "bbox",
        "width",
        "height",
        "bgcolor",
        "exceptions",
        "tiled",
    }
)


def _require_geonode_ready() -> None:
    if not settings.geoserver_wms_base:
        raise HTTPException(status_code=503, detail="GeoNode/GeoServer no configurado")
    if not credentials_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "GeoMexicali requiere autenticación. Configure GEONODE_USER y "
                "GEONODE_PASSWORD en el archivo .env del servidor (nunca en el navegador)."
            ),
        )


@router.get("/status")
async def geonode_status():
    """Comprueba acceso WMS con el usuario de servicio (sin exponer credenciales)."""
    result = await check_wms_access()
    return {
        **result,
        "geonode_url": settings.geonode_url or None,
        "layer_count": len(settings.geonode_layer_list()),
    }


@router.get("/wms")
async def wms_proxy(request: Request) -> Response:
    """
    Reenvía GetMap/GetCapabilities al WMS con Basic Auth del usuario de servicio.
  El navegador nunca recibe usuario ni contraseña de GeoNode.
    """
    _require_geonode_ready()

    params = {
        k.lower(): v
        for k, v in request.query_params.items()
        if k.lower() in ALLOWED_WMS_PARAMS
    }
    if not params.get("request"):
        params["request"] = "GetMap"
    if not params.get("service"):
        params["service"] = "WMS"
    if not params.get("version"):
        params["version"] = settings.geonode_wms_version

    target_host = urlparse(settings.geoserver_wms_base or "").netloc.lower()
    if not target_host:
        raise HTTPException(status_code=503, detail="GEONODE_URL inválido")

    try:
        upstream = await fetch_wms(params)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"No se pudo contactar GeoMexicali: {exc}"
        ) from exc

    if upstream.status_code in (401, 403):
        raise HTTPException(
            status_code=502,
            detail=(
                "GeoServer rechazó las credenciales del servicio. Revise permisos del "
                "usuario en GeoNode o caducidad de contraseña."
            ),
        )

    body = upstream.content
    content_type = upstream.headers.get("content-type", "image/png")

    if body[:5] == b"<?xml" or b"ServiceException" in body[:500]:
        snippet = body[:400].decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer devolvió error XML en lugar de imagen: {snippet[:200]}",
        )

    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer respondió tipo {content_type}, se esperaba image/png",
        )

    # MapLibre carga teselas con crossOrigin; requiere CORS explícito en la imagen
    cors_headers: dict[str, str] = {"Cache-Control": "public, max-age=300"}
    origin = request.headers.get("origin")
    if origin:
        cors_headers["Access-Control-Allow-Origin"] = origin
        cors_headers["Vary"] = "Origin"
    else:
        cors_headers["Access-Control-Allow-Origin"] = "*"

    return Response(
        content=body,
        status_code=upstream.status_code,
        media_type=content_type,
        headers=cors_headers,
    )
