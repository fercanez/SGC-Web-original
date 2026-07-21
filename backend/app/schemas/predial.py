from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.schemas.predial import PredialAdeudoResponse
from app.services.predial_mexicali import consultar_predial_mexicali

router = APIRouter(prefix="/predial", tags=["predial"])


class PredialAdeudosRequest(BaseModel):
    claves_catastrales: List[str] = Field(
        ..., min_length=1, description="Lista de claves catastrales"
    )


@router.get("/adeudo", response_model=PredialAdeudoResponse)
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


@router.post("/adeudos", response_model=List[PredialAdeudoResponse])
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
                    "periodo": None,
                    "subtotal_importes": 0.0,
                    "sobretasa_seguridad_publica": 0.0,
                    "fomento_deportivo": 0.0,
                    "rezago_fomento_deportivo": 0.0,
                    "servicio_alumbrado": 0.0,
                    "recargos": 0.0,
                    "multas": 0.0,
                    "gastos_ejecucion": 0.0,
                    "descuentos": 0.0,
                    "donativo_cruz_roja": 0.0,
                    "donativo_bomberos": 0.0,
                    "total_a_pagar": 0.0,
                    "consultado_en": "",
                    "fuente": "portal_mexicali",
                    "error": f"No se pudo consultar el portal de predial: {exc}",
                }
            )

    return resultados
