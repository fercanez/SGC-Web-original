"""Cliente HTTP hacia GeoServer WMS de GeoMexicali (con autenticación)."""

from urllib.parse import urlencode

import httpx

from app.config import settings


def credentials_configured() -> bool:
    return bool(settings.geonode_user and settings.geonode_password)


def build_wms_url(params: dict[str, str]) -> str:
    base = settings.geoserver_wms_base
    if not base:
        raise ValueError("GeoServer WMS no configurado")
    merged = dict(params)
    if settings.geonode_auth_key:
        merged["authkey"] = settings.geonode_auth_key
    return f"{base}?{urlencode(merged)}"


def httpx_auth() -> httpx.BasicAuth | None:
    if not credentials_configured():
        return None
    return httpx.BasicAuth(settings.geonode_user, settings.geonode_password)


async def fetch_wms(
    params: dict[str, str],
    *,
    timeout: float = 30.0,
) -> httpx.Response:
    url = build_wms_url(params)
    auth = httpx_auth()
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        verify=settings.geonode_ssl_verify,
    ) as client:
        return await client.get(url, auth=auth)


async def check_wms_access() -> dict:
    """Prueba GetMap mínimo sobre la primera capa configurada."""
    layers = settings.geonode_layer_list()
    if not settings.geoserver_wms_base:
        return {
            "ok": False,
            "configured": False,
            "credentials_configured": credentials_configured(),
            "message": "GEONODE_URL no configurado",
        }
    if not credentials_configured():
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": False,
            "message": "Defina GEONODE_USER y GEONODE_PASSWORD en el servidor",
        }
    if not layers:
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": True,
            "message": "Sin capas en GEONODE_WMS_LAYERS",
        }

    params = {
        "service": "WMS",
        "version": settings.geonode_wms_version,
        "request": "GetMap",
        "layers": layers[0]["layer"],
        "styles": "",
        "format": "image/png",
        "transparent": "true",
        "srs": "EPSG:3857",
        "bbox": "-13000000,3800000,-12900000,3900000",
        "width": "256",
        "height": "256",
    }
    try:
        resp = await fetch_wms(params, timeout=20.0)
    except httpx.HTTPError as exc:
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": True,
            "message": f"Error de red: {exc}",
            "http_status": None,
        }

    if resp.status_code == 200 and resp.headers.get("content-type", "").startswith(
        "image/"
    ):
        return {
            "ok": True,
            "configured": True,
            "credentials_configured": True,
            "message": "WMS accesible con las credenciales del servicio",
            "http_status": 200,
            "test_layer": layers[0]["layer"],
        }

    if resp.status_code in (401, 403):
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": True,
            "message": (
                "Credenciales rechazadas (401/403). Verifique usuario, contraseña "
                "y permisos de capa en GeoNode."
            ),
            "http_status": resp.status_code,
        }

    return {
        "ok": False,
        "configured": True,
        "credentials_configured": True,
        "message": f"Respuesta inesperada del WMS (HTTP {resp.status_code})",
        "http_status": resp.status_code,
    }


def build_wfs_url(params: dict[str, str]) -> str:
    base = settings.geoserver_wfs_base
    if not base:
        raise ValueError("GeoServer WFS no configurado")
    merged = dict(params)
    if settings.geonode_auth_key:
        merged["authkey"] = settings.geonode_auth_key
    return f"{base}?{urlencode(merged)}"


async def fetch_wfs(
    params: dict[str, str],
    *,
    timeout: float = 120.0,
) -> httpx.Response:
    url = build_wfs_url(params)
    auth = httpx_auth()
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        verify=settings.geonode_ssl_verify,
    ) as client:
        return await client.get(url, auth=auth)


async def fetch_wfs_geojson(
    type_name: str,
    *,
    start_index: int = 0,
    max_features: int = 2000,
    timeout: float = 120.0,
) -> dict:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": type_name,
        "outputFormat": "application/json",
        "srsName": f"EPSG:{settings.metric_srid}",
        "count": str(max_features),
        "startIndex": str(start_index),
    }
    resp = await fetch_wfs(params, timeout=timeout)
    resp.raise_for_status()
    payload = resp.json()
    payload["_wfs_srid"] = settings.metric_srid
    return payload


async def fetch_wfs_by_cadastral_code(
    cadastral_code: str,
    *,
    type_name: str | None = None,
    field_name: str | None = None,
    srs: int | None = None,
    max_features: int = 5,
    timeout: float = 45.0,
) -> dict:
    """
    Un predio en vivo desde GeoServer.
    Por defecto pide EPSG nativo (metric_srid, ej. 32611) para evitar deformación al pasar a 4326.
    """
    layer = (type_name or settings.geonode_source_layer).strip()
    if not layer:
        raise ValueError("GEONODE_SOURCE_LAYER no configurado")
    safe = cadastral_code.replace("'", "''")
    fields = (
        [field_name.strip()]
        if field_name
        else settings.field_candidates("geonode_field_cadastral")
    )
    if not fields:
        raise ValueError("Campo catastral no configurado")

    out_srid = srs if srs is not None else settings.metric_srid
    last_error: Exception | None = None
    for field in fields:
        cql = f"{field}='{safe}'"
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": layer,
            "outputFormat": "application/json",
            "srsName": f"EPSG:{out_srid}",
            "count": str(max_features),
            "CQL_FILTER": cql,
        }
        try:
            resp = await fetch_wfs(params, timeout=timeout)
            resp.raise_for_status()
            payload = resp.json()
            if payload.get("features"):
                payload["_wfs_field_used"] = field
                payload["_wfs_srid"] = out_srid
                return payload
        except Exception as exc:
            last_error = exc
            continue
    if last_error:
        raise last_error
    return {"type": "FeatureCollection", "features": [], "_wfs_srid": out_srid}


async def check_wfs_access(type_name: str | None = None) -> dict:
    """Prueba GetFeature mínimo sobre la capa vectorial de origen."""
    layer = type_name or settings.geonode_source_layer
    if not settings.geoserver_wfs_base:
        return {
            "ok": False,
            "configured": False,
            "credentials_configured": credentials_configured(),
            "message": "GEONODE_URL no configurado",
            "source_layer": layer or None,
        }
    if not layer:
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": credentials_configured(),
            "message": "GEONODE_SOURCE_LAYER no configurado",
            "source_layer": None,
        }
    if not credentials_configured():
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": False,
            "message": "Defina GEONODE_USER y GEONODE_PASSWORD en el servidor",
            "source_layer": layer,
        }

    try:
        payload = await fetch_wfs_geojson(layer, max_features=1, timeout=30.0)
    except httpx.HTTPError as exc:
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": True,
            "message": f"Error de red WFS: {exc}",
            "source_layer": layer,
        }
    except ValueError as exc:
        return {
            "ok": False,
            "configured": True,
            "credentials_configured": True,
            "message": f"Respuesta WFS inválida: {exc}",
            "source_layer": layer,
        }

    features = payload.get("features") or []
    sample_props = (
        list((features[0].get("properties") or {}).keys()) if features else []
    )
    return {
        "ok": True,
        "configured": True,
        "credentials_configured": True,
        "message": "WFS accesible; capa vectorial lista para sincronización",
        "source_layer": layer,
        "feature_count_sample": len(features),
        "sample_property_keys": sample_props[:20],
    }
