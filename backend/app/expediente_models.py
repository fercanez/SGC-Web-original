from sqlalchemy import BigInteger, Column, DateTime, String, Text
from sqlalchemy.sql import func

from app.database import Base


class Expediente(Base):
    __tablename__ = "expediente"
    __table_args__ = {"schema": "catastro"}

    id = Column(BigInteger, primary_key=True)
    clave_catastral = Column(String(30), unique=True, nullable=False)
    estado = Column(String(30), default="ABIERTO")
    fecha_creacion = Column(DateTime, server_default=func.now())
    fecha_actualizacion = Column(DateTime, server_default=func.now())
    observaciones = Column(Text)
