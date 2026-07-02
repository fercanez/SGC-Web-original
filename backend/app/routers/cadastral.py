"""Consulta y enlace de la base alfanumérica municipal."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.database import get_db
from app.models import Parcel, PredioAlfanumerico
from app.schemas import (
    BatchMapGeometriesRequest,
    BatchMapGeometriesResponse,
    CuadroConstruccionRequest,
    PredioAlfanumericoRead,
)
from app.services.construcciones_service import (
    build_cuadro_construccion_utm,
    fetch_construcciones_by_clave,
)
from app.services.cadastral_alfanumerico import (
    link_all_records,
    link_record_to_parcel,
    normalize_cadastral_key,
)
from app.services.cadastral_search import search_predios_advanced

router = APIRouter(prefix="/cadastral", tags=["cadastral"])
map_pick_router = APIRouter(tags=["cadastral-map-pick"])


def _get_by_clave(db: Session, clave: str) -> PredioAlfanumerico | None:
    norm = normalize_cadastral_key(clave)
    record = (
        db.query(PredioAlfanumerico)
        .filter(PredioAlfanumerico.clave_catastral == clave)
        .first()
    )
    if record:
        return record
    if norm:
        record = (
            db.query(PredioAlfanumerico)
            .filter(PredioAlfanumerico.clave_catastral_norm == norm)
            .first()
        )
        if record:
            return record
        return (
            db.query(PredioAlfanumerico)
            .filter(PredioAlfanumerico.clave_catastral == norm)
            .first()
        )
    return None


@router.get("/fields")
def cadastral_fields():
    """Columnas oficiales de la base alfanumérica municipal."""
    from app.services.cadastral_alfanumerico import ALFANUMERIC_COLUMNS

    return {
        "table": "predios_alfanumerico",
        "link_to_geometry": (
            "padron2026.clave_catastral = geonode:prediosmxli.clavecatas = parcels.cadastral_code"
        ),
        "columns": list(ALFANUMERIC_COLUMNS),
    }


def _q_opt(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    return text if text else None


@router.get("/search/advanced")
def search_cadastral_advanced(
    clave: str | None = Query(None, max_length=64, description="Clave o patrón (ej. ST32____)"),
    apellido: str | None = Query(None, max_length=128, description="Apellido o nombre"),
    nombre: str | None = Query(None, max_length=128, description="Alias de apellido"),
    calle: str | None = Query(None, max_length=128),
    numof: str | None = Query(None, max_length=32, description="Número oficial"),
    colonia: str | None = Query(None, max_length=128),
    combinar: str = Query(
        "todos",
        description="todos = AND (todos los campos), cualquiera = OR",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """
    Búsqueda combinada en predios_alfanumerico.
    Comodines en clave: _ = un carácter, * o % = varios.
    Sin tope de resultados: pagina de 500 en 500 si hay más.
    """
    titular = _q_opt(apellido) or _q_opt(nombre)
    try:
        return search_predios_advanced(
            db,
            clave=_q_opt(clave),
            apellido=titular,
            calle=_q_opt(calle),
            numof=_q_opt(numof),
            colonia=_q_opt(colonia),
            combinar=combinar,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/search")
def search_cadastral(
    q: str = Query(..., min_length=2, max_length=64, description="Clave catastral o prefijo"),
    limit: int = Query(25, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """Busca en predios_alfanumerico por clave exacta o prefijo normalizado."""
    term = q.strip()
    exact = _get_by_clave(db, term)
    if exact:
        return {
            "query": term,
            "items": [PredioAlfanumericoRead.model_validate(exact)],
            "total": 1,
        }

    norm = normalize_cadastral_key(term)
    if not norm:
        return {"query": term, "items": [], "total": 0}

    rows = (
        db.query(PredioAlfanumerico)
        .filter(PredioAlfanumerico.clave_catastral_norm.ilike(f"{norm}%"))
        .order_by(PredioAlfanumerico.clave_catastral)
        .limit(limit)
        .all()
    )
    items = [PredioAlfanumericoRead.model_validate(r) for r in rows]
    return {"query": term, "items": items, "total": len(items)}


@router.post("/map-geometries/batch", response_model=BatchMapGeometriesResponse)
async def batch_map_geometries(
    body: BatchMapGeometriesRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """
    Geometrías WFS/BD para varios predios (búsqueda de manzana).
    Cada feature incluye `fiscal`: sin_adeudo | con_adeudo.
    """
    if not body.claves:
        return BatchMapGeometriesResponse(
            features=[],
            requested=0,
            drawn=0,
            failed=0,
            max_items=body.max_items,
        )
    from app.services.map_geometry_batch import batch_map_geometries as run_batch

    max_items = min(max(body.max_items, 1), 80)
    data = await run_batch(db, body.claves, max_items=max_items)
    return BatchMapGeometriesResponse(**data)


@router.post("/link")
def link_cadastral_to_parcels(
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_SYNC.value)),
):
    """
    Enlaza registros alfanuméricos con predios cartográficos ya sincronizados.
    Ejecutar después de POST /source/sync si importó Excel antes que la geometría.
    """
    stats = link_all_records(db, sync_summary=True)
    db.commit()
    return stats


@router.post("/cuadro-construccion")
def cuadro_construccion(
    body: CuadroConstruccionRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    """Cuadro de vértices UTM (distancias, ángulos, este/norte) del contorno del predio."""
    return build_cuadro_construccion_utm(db, body.geometry)


@router.get("/by-parcel/{parcel_id}", response_model=PredioAlfanumericoRead)
def get_cadastral_by_parcel(
    parcel_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    record = (
        db.query(PredioAlfanumerico)
        .filter(PredioAlfanumerico.parcel_id == parcel_id)
        .first()
    )
    if not record:
        parcel = db.get(Parcel, parcel_id)
        if parcel:
            record = _get_by_clave(db, parcel.cadastral_code)
    if not record:
        raise HTTPException(
            status_code=404,
            detail="Sin datos alfanuméricos vinculados a este predio",
        )
    return record


@router.get("/intersecta")
async def cadastral_intersecta(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    return await _resolve_intersecta(db, lon, lat)


async def _resolve_intersecta(db: Session, lon: float, lat: float):
    """
    Predio bajo un punto (clic en mapa).
    Paridad SGC maduro GET /predios/intersecta: PostGIS + WFS GeoServer.
    """
    from app.services.predio_at_point import resolve_predio_at_point

    try:
        hit = await resolve_predio_at_point(db, lon, lat)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error al identificar predio: {exc}",
        ) from exc
    if not hit:
        raise HTTPException(status_code=404, detail="No se encontró predio en esa ubicación")
    return hit


@map_pick_router.get("/catastro/intersection")
@map_pick_router.get("/catastro/intersecta")
async def catastro_map_pick_alias(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """Alias de /cadastral/intersecta (compatibilidad frontend)."""
    return await _resolve_intersecta(db, lon, lat)


@router.get("/{clave}/map-geometry")
async def get_cadastral_map_geometry(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """
    Geometría para resaltar en el mapa.
    Prioriza WFS en vivo (misma fuente que las capas WMS de GeoNode).
    Siempre responde 200; geometry puede ser null con nota explicativa.
    """
    from app.services.map_geometry import resolve_map_geometry

    norm = normalize_cadastral_key(clave) or clave.strip().upper()
    try:
        record = _get_by_clave(db, clave)
        clave_busqueda = record.clave_catastral if record else clave
        data = await resolve_map_geometry(db, clave_busqueda)
    except Exception as exc:
        data = {
            "clave_catastral": norm,
            "geometry": None,
            "source": None,
            "wfs_feature_count": 0,
            "display_srid": 4326,
            "database_cadastral_code": None,
            "note": f"Error al obtener geometría: {exc}",
        }

    if not data.get("geometry"):
        data["note"] = data.get("note") or "Sin geometría para esta clave"
    return data


@router.get("/{clave}/construcciones")
async def construcciones_predio(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    """Construcciones de la clave desde capa WFS GeoServer."""
    return await fetch_construcciones_by_clave(clave, db)


@router.get("/{clave}/folio-real")
def folio_real_predio(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    """Folio real del padrón municipal (catalogos.padron_2026), igual que SGC maduro."""
    clave_norm = clave.strip().upper()
    try:
        row = (
            db.execute(
                text("""
                    SELECT NULLIF(NULLIF(TRIM(p.folio_real::text), ''), '0') AS folio_real
                    FROM catalogos.padron_2026 p
                    WHERE UPPER(TRIM(p.clave_catastral)) = :clave
                    LIMIT 1
                """),
                {"clave": clave_norm},
            )
            .mappings()
            .first()
        )
    except Exception:
        row = None

    folio = None
    if row and row.get("folio_real"):
        folio = str(row["folio_real"]).strip() or None

    return {"clave_catastral": clave_norm, "folio_real": folio}


@router.get("/{clave}/propietarios")
def propietarios_predio(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    rows = db.execute(
        text("""
            SELECT
                pp.id_predio_propietario,
                pp.clave_catastral,
                pp.id_persona,
                concat_ws(
                    ' ',
                    per.nombre,
                    per.apellido_paterno,
                    per.apellido_materno
                ) AS nombre_completo,
                per.razon_social,
                per.rfc,
                pp.porcentaje_propiedad,
                pp.tipo_titularidad,
                pp.vigente,
                pp.fecha_inicio,
                pp.fecha_fin
            FROM catastro.predio_propietario pp
            JOIN catalogos.personas per
                ON per.id_persona = pp.id_persona
            WHERE pp.clave_catastral = :clave
              AND pp.vigente IS TRUE
            ORDER BY
                CASE
                    WHEN pp.tipo_titularidad = 'PROPIETARIO' THEN 1
                    WHEN pp.tipo_titularidad = 'COPROPIETARIO' THEN 2
                    ELSE 3
                END,
                pp.porcentaje_propiedad DESC,
                nombre_completo
        """),
        {"clave": clave.strip().upper()},
    ).mappings().all()

    total = sum(float(r["porcentaje_propiedad"] or 0) for r in rows)

    return {
        "clave_catastral": clave.strip().upper(),
        "total_participacion": total,
        "items": [
            {
                "id_predio_propietario": r["id_predio_propietario"],
                "id_persona": r["id_persona"],
                "nombre_completo": r["razon_social"] or r["nombre_completo"],
                "rfc": r["rfc"],
                "porcentaje_propiedad": float(r["porcentaje_propiedad"] or 0),
                "tipo_titularidad": r["tipo_titularidad"],
                "vigente": r["vigente"],
                "fecha_inicio": str(r["fecha_inicio"]) if r["fecha_inicio"] else None,
                "fecha_fin": str(r["fecha_fin"]) if r["fecha_fin"] else None,
            }
            for r in rows
        ],
    }


@router.get("/{clave}", response_model=PredioAlfanumericoRead)
def get_cadastral_record(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    record = _get_by_clave(db, clave)
    if not record:
        raise HTTPException(status_code=404, detail="Registro alfanumérico no encontrado")
    return record


@router.post("/{clave}/fiscal/refresh")
async def refresh_cadastral_fiscal(
    clave: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    """
    Completa adeudo_2026 / adeudo_total desde WFS (capa de adeudos o prediosmxli)
    cuando el padrón los trae vacíos.
    """
    record = _get_by_clave(db, clave)
    if not record:
        raise HTTPException(status_code=404, detail="Registro alfanumérico no encontrado")

    from app.services.fiscal_resolve import refresh_record_fiscal

    meta = await refresh_record_fiscal(db, record, persist=True)
    db.commit()
    db.refresh(record)
    return {
        "record": PredioAlfanumericoRead.model_validate(record),
        "fiscal": meta,
    }
