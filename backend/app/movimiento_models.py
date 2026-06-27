from sqlalchemy import Column, BigInteger, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.database import Base


class MovimientoSGC(Base):
    __tablename__ = "movimientos_sgc"
    __table_args__ = {"schema": "catastro"}

    id = Column(BigInteger, primary_key=True)
    folio = Column(String)
    clave_catastral = Column(String)
    tipo_movimiento = Column(String)
    estado = Column(String)
    descripcion = Column(Text)

    datos = Column(JSONB)

    usuario_captura = Column(String)
    fecha_captura = Column(DateTime)

    usuario_autoriza = Column(String)
    fecha_autorizacion = Column(DateTime)
