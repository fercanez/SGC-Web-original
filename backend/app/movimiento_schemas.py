from pydantic import BaseModel
from datetime import datetime


class MovimientoResponse(BaseModel):
    id: int
    folio: str
    clave_catastral: str
    tipo_movimiento: str
    estado: str
    descripcion: str | None = None
    usuario_captura: str | None = None
    fecha_captura: datetime | None = None

    class Config:
        from_attributes = True
class MovimientoCreate(BaseModel):
    clave_catastral: str
    tipo_movimiento: str
    descripcion: str | None = None
    usuario_captura: str | None = "admin"
class MovimientoEstadoUpdate(BaseModel):
    estado: str
    usuario: str | None = "admin"
    observaciones: str | None = None
