"""Carga de base alfanumérica desde Excel/CSV."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.auth.deps import require_permission
from app.auth.permissions import Permission
from app.services.excel_import import import_tabular_content

router = APIRouter(prefix="/import", tags=["import"])

ALLOWED_SUFFIXES = (".xlsx", ".xlsm", ".csv", ".txt")
MAX_UPLOAD_BYTES = 150 * 1024 * 1024  # padron_2026.csv ~76 MB


@router.get("/template")
def import_template_info():
    """Describe columnas esperadas y flujo cartografía + alfanumérico."""
    from app.services.cadastral_alfanumerico import ALFANUMERIC_COLUMNS

    return {
        "description": (
            "Importe la base alfanumérica municipal a la tabla predios_alfanumerico. "
            "Enlace con cartografía por clave_catastral_norm ↔ clavecatas (GeoNode)."
        ),
        "table": "predios_alfanumerico",
        "required_column": "clave_catastral",
        "link_column": "clave_catastral (= clavecatas en GeoNode / padron2026)",
        "columns": list(ALFANUMERIC_COLUMNS),
        "formats": list(ALLOWED_SUFFIXES),
        "after_geometry_sync": "POST /api/v1/cadastral/link",
        "docs": "docs/importacion-excel.md",
    }


@router.post("/excel")
async def import_excel(
    file: UploadFile = File(..., description="Archivo .xlsx o .csv"),
    dry_run: bool = Query(False, description="Simular sin escribir en la BD"),
    _=Depends(require_permission(Permission.PARCELS_IMPORT.value)),
):
    """
    Carga datos alfanuméricos y propietarios. No modifica geometrías existentes.
    """
    filename = file.filename or ""
    lower = filename.lower()
    if not any(lower.endswith(s) for s in ALLOWED_SUFFIXES):
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado. Use: {', '.join(ALLOWED_SUFFIXES)}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande (máx. 150 MB)")

    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    try:
        return import_tabular_content(content, filename=filename, dry_run=dry_run)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo leer el archivo: {exc}",
        ) from exc
