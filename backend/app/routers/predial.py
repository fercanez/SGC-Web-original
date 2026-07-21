from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.predial_mexicali import consultar_predial_mexicali

router = APIRouter(prefix="/predial", tags=["predial"])


class PredialAdeudosRequest(BaseModel):
    claves_catastrales: List[str] = Field(
        ..., min_length=1, description="Lista de claves catastrales"
    )


@router.get("/adeudo")
def get_adeudo_predial(
    clave_catastral: str = Query(..., min_length=6, description="Clave catastral")
):
    try:
        return consultar_predial_mexicali(clave_catastral.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo consultar el portal de predial: {exc}",
        ) from exc


@router.post("/adeudos")
def post_adeudos_predial(payload: PredialAdeudosRequest):
    resultados = []

    for clave in payload.claves_catastrales:
        clave = clave.strip()
        if not clave:
            continue

        try:
            resultados.append(consultar_predial_mexicali(clave))
        except Exception as exc:
            resultados.append(
                {
                    "clave_catastral": clave,
                    "tiene_adeudo": False,
                    "estatus_consulta": "error",
                    "error": f"No se pudo consultar el portal de predial: {exc}",
                    "fuente": "portal_mexicali",
                }
            )

    return resultados
