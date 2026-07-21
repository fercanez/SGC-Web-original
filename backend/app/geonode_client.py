"""Cliente HTTP hacia GeoServer WMS de GeoMexicali (con autenticación)."""

from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings


def credentials_configured() -> bool:
    return bool(
        (settings.geonode_user and settings.geonode_password)
        or settings.geonode_auth_key
    )


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


def build_wfs_url(params: dict[str, str], *, layer: str | None = None) -> str:
    base = _wfs_base_for_layer(layer)
    if not base:
        raise ValueError("GeoServer WFS no configurado")
    merged = dict(params)
    if settings.geonode_auth_key:
        merged["authkey"] = settings.geonode_auth_key
    return f"{base}?{urlencode(merged)}"


def _wfs_base_for_layer(layer: str | None) -> str | None:
    """SGC maduro usa /geoserver/{workspace}/wfs para capas geonode:*."""
    if not settings.geonode_url:
        return None
    path = (
        settings.geoserver_path
        if settings.geoserver_path.startswith("/")
        else f"/{settings.geoserver_path}"
    )
    workspace = (layer or "").split(":", 1)[0].strip() if layer and ":" in layer else ""
    if workspace:
        return f"{settings.geonode_url}{path}/{workspace}/wfs"
    return f"{settings.geonode_url}{path}/wfs"


async def fetch_wfs(
    params: dict[str, str],
    *,
    timeout: float = 120.0,
    layer: str | None = None,
    auth: bool = True,
) -> httpx.Response:
    url = build_wfs_url(params, layer=layer)
    httpx_auth_obj = httpx_auth() if auth else None
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        verify=settings.geonode_ssl_verify,
    ) as client:
        resp = await client.get(url, auth=httpx_auth_obj)
    if auth and resp.status_code in (401, 403):
        raise PermissionError(
            "GeoServer WFS rechazó las credenciales (401/403). "
            "Revise GEONODE_USER, GEONODE_PASSWORD o GEONODE_AUTH_KEY en el .env del servidor."
        )
    return resp


async def fetch_wfs_geojson(
    type_name: str,
    *,
    start_index: int = 0,
    max_features: int = 2000,
    timeout: float = 120.0,
) -> dict:
    params = {
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": type_name,
        "outputFormat": "application/json",
        "srsName": f"EPSG:{settings.metric_srid}",
        "maxFeatures": str(max_features),
    }
    resp = await fetch_wfs(params, timeout=timeout, layer=type_name)
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
    cql_filters: list[str] = [f"clavecatas='{safe}' OR claveorig='{safe}'"]
    fields = (
        [field_name.strip()]
        if field_name
        else settings.field_candidates("geonode_field_cadastral")
    )
    if not fields:
        raise ValueError("Campo catastral no configurado")
    for field in fields:
        fl = field.lower()
        if fl in ("clavecatas", "claveorig"):
            continue
        cql_filters.append(f"{field}='{safe}'")

    srs_attempts = [srs] if srs is not None else [settings.geographic_srid, settings.metric_srid]
    last_error: Exception | None = None
    versions = ("2.0.0", "1.1.0")
    for cql in cql_filters:
        for out_srid in srs_attempts:
            for version in versions:
                if version == "1.1.0":
                    params = {
                        "service": "WFS",
                        "version": "1.1.0",
                        "request": "GetFeature",
                        "typeName": layer,
                        "outputFormat": "application/json",
                        "srsName": f"EPSG:{out_srid}",
                        "maxFeatures": str(max_features),
                        "CQL_FILTER": cql,
                    }
                else:
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
                    resp = await fetch_wfs(params, timeout=timeout, layer=layer, auth=True)
                    if resp.status_code in (401, 403):
                        resp = await fetch_wfs(
                            params, timeout=timeout, layer=layer, auth=False
                        )
                    resp.raise_for_status()
                    payload = resp.json()
                    if payload.get("features"):
                        payload["_wfs_field_used"] = cql
                        payload["_wfs_srid"] = out_srid
                        return payload
                except PermissionError:
                    try:
                        resp = await fetch_wfs(
                            params, timeout=timeout, layer=layer, auth=False
                        )
                        resp.raise_for_status()
                        payload = resp.json()
                        if payload.get("features"):
                            payload["_wfs_field_used"] = cql
                            payload["_wfs_srid"] = out_srid
                            return payload
                    except Exception as exc:
                        last_error = exc
                        continue
                except Exception as exc:
                    last_error = exc
                    continue
    if last_error:
        raise last_error
    return {
        "type": "FeatureCollection",
        "features": [],
        "_wfs_srid": srs_attempts[-1] if srs_attempts else settings.metric_srid,
    }


def _extract_clave_from_wfs_props(props: dict[str, Any]) -> str | None:
    for key in (
        "clave_catastral",
        "clavecatas",
        "claveorig",
        "clave",
        "CLAVE_CATASTRAL",
        "ClaveCatas",
    ):
        val = props.get(key)
        if val not in (None, ""):
            return str(val).strip().upper()
    for cand in settings.field_candidates("geonode_field_cadastral"):
        for key, value in props.items():
            if str(key).lower() == cand.lower() and value not in (None, ""):
                return str(value).strip().upper()
    return None


async def fetch_wfs_at_point(
    lon: float,
    lat: float,
    *,
    type_name: str | None = None,
    max_features: int = 5,
    timeout: float = 30.0,
) -> dict:
    """Predio en un punto (WFS CQL espacial — paridad SGC maduro /predios/intersecta)."""
    layer = (type_name or settings.geonode_source_layer).strip()
    if not layer:
        raise ValueError("GEONODE_SOURCE_LAYER no configurado")

    safe_lon = f"{lon:.8f}"
    safe_lat = f"{lat:.8f}"
    cql_filters = [
        f"INTERSECTS(geom, SRID=4326;POINT({safe_lon} {safe_lat}))",
        f"INTERSECTS(the_geom, SRID=4326;POINT({safe_lon} {safe_lat}))",
        f"DWITHIN(geom, POINT({safe_lon} {safe_lat}), 0.00008, degrees)",
        f"DWITHIN(the_geom, POINT({safe_lon} {safe_lat}), 0.00008, degrees)",
    ]

    last_error: Exception | None = None
    for cql in cql_filters:
        for version in ("2.0.0", "1.1.0"):
            for out_srid in (settings.geographic_srid, settings.metric_srid):
                if version == "1.1.0":
                    params = {
                        "service": "WFS",
                        "version": "1.1.0",
                        "request": "GetFeature",
                        "typeName": layer,
                        "outputFormat": "application/json",
                        "srsName": f"EPSG:{out_srid}",
                        "maxFeatures": str(max_features),
                        "CQL_FILTER": cql,
                    }
                else:
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
                    resp = await fetch_wfs(params, timeout=timeout, layer=layer, auth=True)
                    if resp.status_code in (401, 403):
                        resp = await fetch_wfs(
                            params, timeout=timeout, layer=layer, auth=False
                        )
                    resp.raise_for_status()
                    payload = resp.json()
                    if payload.get("features"):
                        payload["_wfs_cql"] = cql
                        payload["_wfs_srid"] = out_srid
                        return payload
                except Exception as exc:
                    last_error = exc
                    continue

    if last_error:
        raise last_error
    return {"type": "FeatureCollection", "features": []}


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
