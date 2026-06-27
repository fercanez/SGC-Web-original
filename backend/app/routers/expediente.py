from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.database import get_db
from app.expediente_models import Expediente
from app.expediente_schemas import ExpedienteResponse, ExpedienteHistorialItem

router = APIRouter(prefix="/expediente", tags=["expediente"])


@router.get("/{clave_catastral}", response_model=ExpedienteResponse)
def obtener_expediente(
    clave_catastral: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    expediente = (
        db.query(Expediente)
        .filter(Expediente.clave_catastral == clave_catastral.strip().upper())
        .first()
    )

    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

    return expediente

@router.get("/{clave_catastral}/historial", response_model=list[ExpedienteHistorialItem])
def obtener_historial_expediente(
    clave_catastral: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission("cadastral.read")),
):
    clave = clave_catastral.strip().upper()

    rows = db.execute(
        text("""
            SELECT
                id,
                expediente_id,
                clave_catastral,
                tipo_evento,
                descripcion,
                usuario,
                fecha_evento
            FROM catastro.expediente_historial
            WHERE clave_catastral = :clave
            ORDER BY fecha_evento DESC, id DESC
        """),
        {"clave": clave},
    ).mappings().all()

    return [dict(r) for r in rows]
