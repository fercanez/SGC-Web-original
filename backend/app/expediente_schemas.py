from datetime import datetime
from pydantic import BaseModel


class ExpedienteResponse(BaseModel):
    id: int
    clave_catastral: str
    estado: str
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    observaciones: str | None = None

    class Config:
        from_attributes = True

class ExpedienteHistorialItem(BaseModel):
    id: int
    expediente_id: int
    clave_catastral: str
    tipo_evento: str
    descripcion: str | None = None
    usuario: str | None = None
    fecha_evento: datetime

    class Config:
        from_attributes = True
