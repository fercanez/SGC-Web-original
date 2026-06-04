import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.database import get_db

router = APIRouter(prefix="/parcels", tags=["parcels"])


@router.get("")
def list_parcels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    rows = db.execute(
        text("""
            SELECT
                id::text AS id,
                clave_catastral AS cadastral_code,
                clave_catastral AS predial_account,
                cp AS postal_code,
                numof,
                numint,
                letra,
                sup_documental AS area_m2,
                estatus AS status,
                valor2026 AS cadastral_value
            FROM catastro.predios
            WHERE vigente IS TRUE
            ORDER BY id
            LIMIT :limit OFFSET :skip
        """),
        {"limit": limit, "skip": skip},
    ).mappings().all()

    return [
        {
            "id": r["id"],
            "cadastral_code": r["cadastral_code"],
            "predial_account": r["predial_account"],
            "colony": None,
            "postal_code": r["postal_code"],
            "address": " ".join(
                str(x) for x in [r["numof"], r["numint"], r["letra"]]
                if x not in [None, "", "0"]
            ) or None,
            "area_m2": float(r["area_m2"]) if r["area_m2"] is not None else None,
            "land_use": None,
            "status": str(r["status"] or "activo").lower(),
            "cadastral_value": float(r["cadastral_value"]) if r["cadastral_value"] is not None else None,
            "valuation_date": None,
            "notes": None,
            "source_layer": "catastro.predios",
            "source_fid": r["id"],
            "synced_at": None,
            "created_at": None,
            "updated_at": None,
        }
        for r in rows
    ]


@router.get("/geojson")
def parcels_geojson(
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    rows = db.execute(
        text("""
            SELECT
                id::text AS id,
                clave_catastral,
                cp,
                numof,
                numint,
                letra,
                sup_documental,
                estatus,
                valor2026,
                ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geom_json
            FROM catastro.predios
            WHERE vigente IS TRUE
              AND geom IS NOT NULL
            ORDER BY id
            LIMIT 5000
        """)
    ).mappings().all()

    features = []
    for r in rows:
        if not r["geom_json"]:
            continue
        features.append({
            "type": "Feature",
            "id": r["id"],
            "geometry": json.loads(r["geom_json"]),
            "properties": {
                "id": r["id"],
                "cadastral_code": r["clave_catastral"],
                "predial_account": r["clave_catastral"],
                "colony": None,
                "address": " ".join(
                    str(x) for x in [r["numof"], r["numint"], r["letra"]]
                    if x not in [None, "", "0"]
                ) or None,
                "area_m2": float(r["sup_documental"]) if r["sup_documental"] is not None else None,
                "land_use": None,
                "status": str(r["estatus"] or "activo").lower(),
                "cadastral_value": float(r["valor2026"]) if r["valor2026"] is not None else None,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/{parcel_id}")
def get_parcel(
    parcel_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    row = db.execute(
        text("""
            SELECT
                id::text AS id,
                clave_catastral,
                cp,
                numof,
                numint,
                letra,
                sup_documental,
                sup_fisica,
                sup_const,
                estatus,
                valor2026,
                vigente,
                fecha_alta,
                ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geom_json
            FROM catastro.predios
            WHERE id::text = :id
            LIMIT 1
        """),
        {"id": parcel_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Predio no encontrado")

    return {
        "id": row["id"],
        "cadastral_code": row["clave_catastral"],
        "predial_account": row["clave_catastral"],
        "colony": None,
        "postal_code": row["cp"],
        "address": " ".join(
            str(x) for x in [row["numof"], row["numint"], row["letra"]]
            if x not in [None, "", "0"]
        ) or None,
        "area_m2": float(row["sup_documental"]) if row["sup_documental"] is not None else None,
        "land_use": None,
        "status": str(row["estatus"] or "activo").lower(),
        "cadastral_value": float(row["valor2026"]) if row["valor2026"] is not None else None,
        "valuation_date": None,
        "notes": None,
        "geometry": json.loads(row["geom_json"]) if row["geom_json"] else None,
    }


@router.get("/{parcel_id}/ownerships")
def get_parcel_ownerships(
    parcel_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.PARCELS_READ.value)),
):
    return []