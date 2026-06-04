"""Consulta y reconstrucción de catálogos derivados del padrón."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.catalog_models import (
    CatCalle,
    CatColonia,
    CatDelegacion,
    CatRegimenPropiedad,
    CatTasa,
    CatTitular,
    CatUsoSuelo,
    CatZonaHomogenea,
)
from app.database import get_db
from app.models import PredioAlfanumerico
from app.services.catalog_builder import catalog_summary, rebuild_catalogs_from_padron

router = APIRouter(prefix="/catalogs", tags=["catalogs"])

CATALOG_READ = Permission.PARCELS_READ.value
CATALOG_REBUILD = Permission.PARCELS_IMPORT.value


@router.get("/summary")
def get_catalog_summary(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    """Conteos de catálogos generados desde predios_alfanumerico."""
    return catalog_summary(db)


@router.post("/rebuild")
def rebuild_catalogs(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_REBUILD)),
):
    """
    Analiza predios_alfanumerico y crea/actualiza catálogos + enlaces FK.
    Ejecutar después de importar padron2026.
    """
    if db.query(PredioAlfanumerico).count() == 0:
        raise HTTPException(
            status_code=400,
            detail="No hay registros en predios_alfanumerico. Importe el padrón primero.",
        )
    stats = rebuild_catalogs_from_padron(db)
    db.commit()
    return stats


@router.get("/delegaciones")
def list_delegaciones(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = db.query(CatDelegacion).order_by(CatDelegacion.nombre).all()
    return [{"id": r.id, "nombre": r.nombre} for r in rows]


@router.get("/colonias")
def list_colonias(
    delegacion_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    q = db.query(CatColonia).order_by(CatColonia.nombre)
    if delegacion_id:
        q = q.filter(CatColonia.delegacion_id == delegacion_id)
    rows = q.all()
    return [{"id": r.id, "nombre": r.nombre, "delegacion_id": r.delegacion_id} for r in rows]


@router.get("/calles")
def list_calles(
    colonia_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    q = db.query(CatCalle).order_by(CatCalle.nombre)
    if colonia_id:
        q = q.filter(CatCalle.colonia_id == colonia_id)
    rows = q.all()
    return [{"id": r.id, "nombre": r.nombre, "colonia_id": r.colonia_id} for r in rows]


@router.get("/zonas-homogeneas")
def list_zonas(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = db.query(CatZonaHomogenea).order_by(CatZonaHomogenea.codigo).all()
    return [{"id": r.id, "codigo": r.codigo} for r in rows]


@router.get("/usos-suelo")
def list_usos(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = db.query(CatUsoSuelo).order_by(CatUsoSuelo.descripcion).all()
    return [{"id": r.id, "descripcion": r.descripcion} for r in rows]


@router.get("/tasas")
def list_tasas(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = db.query(CatTasa).order_by(CatTasa.id_tasa_municipal).all()
    return [
        {
            "id": r.id,
            "id_tasa_municipal": r.id_tasa_municipal,
            "porcentaje": float(r.porcentaje),
            "uso_suelo_id": r.uso_suelo_id,
        }
        for r in rows
    ]


@router.get("/regimenes-propiedad")
def list_regimenes(
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = db.query(CatRegimenPropiedad).order_by(CatRegimenPropiedad.codigo).all()
    return [{"id": r.id, "codigo": r.codigo, "descripcion": r.descripcion} for r in rows]


@router.get("/titulares")
def list_titulares(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(require_permission(CATALOG_READ)),
):
    rows = (
        db.query(CatTitular)
        .order_by(CatTitular.nombre_completo)
        .offset(skip)
        .limit(min(limit, 500))
        .all()
    )
    return [{"id": r.id, "nombre_completo": r.nombre_completo} for r in rows]
