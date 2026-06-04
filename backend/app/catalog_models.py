"""Catálogos catastrales derivados del padrón alfanumérico (padron2026)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models import PredioAlfanumerico


class CatDelegacion(Base):
    __tablename__ = "cat_delegaciones"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    nombre: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    colonias: Mapped[list["CatColonia"]] = relationship(back_populates="delegacion")


class CatColonia(Base):
    __tablename__ = "cat_colonias"
    __table_args__ = (
        UniqueConstraint("delegacion_id", "nombre", name="uq_colonia_delegacion_nombre"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    delegacion_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_delegaciones.id", ondelete="SET NULL")
    )
    nombre: Mapped[str] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    delegacion: Mapped["CatDelegacion | None"] = relationship(back_populates="colonias")
    calles: Mapped[list["CatCalle"]] = relationship(back_populates="colonia")


class CatCalle(Base):
    __tablename__ = "cat_calles"
    __table_args__ = (
        UniqueConstraint("colonia_id", "nombre", name="uq_calle_colonia_nombre"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    colonia_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_colonias.id", ondelete="SET NULL")
    )
    nombre: Mapped[str] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    colonia: Mapped["CatColonia | None"] = relationship(back_populates="calles")


class CatZonaHomogenea(Base):
    __tablename__ = "cat_zonas_homogeneas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    codigo: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CatUsoSuelo(Base):
    __tablename__ = "cat_usos_suelo"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    descripcion: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    tasas: Mapped[list["CatTasa"]] = relationship(back_populates="uso_suelo")


class CatTasa(Base):
    __tablename__ = "cat_tasas"
    __table_args__ = (
        UniqueConstraint(
            "id_tasa_municipal",
            "porcentaje",
            "uso_suelo_id",
            name="uq_tasa_municipal_pct_uso",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    id_tasa_municipal: Mapped[int] = mapped_column(index=True)
    porcentaje: Mapped[Decimal] = mapped_column(Numeric(8, 4))
    uso_suelo_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_usos_suelo.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    uso_suelo: Mapped["CatUsoSuelo | None"] = relationship(back_populates="tasas")


class CatRegimenPropiedad(Base):
    """Régimen de propiedad (columna condominio del padrón, ej. P = propiedad)."""

    __tablename__ = "cat_regimenes_propiedad"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    codigo: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    descripcion: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CatTitular(Base):
    """Titulares únicos (nombre_completo del padrón)."""

    __tablename__ = "cat_titulares"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    nombre_completo: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PredioValuacion(Base):
    """Valores y adeudos por ejercicio fiscal (histórico)."""

    __tablename__ = "predio_valuaciones"
    __table_args__ = (
        UniqueConstraint(
            "predio_alfanumerico_id",
            "ejercicio",
            name="uq_valuacion_predio_ejercicio",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    predio_alfanumerico_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("predios_alfanumerico.id", ondelete="CASCADE"),
        index=True,
    )
    ejercicio: Mapped[int] = mapped_column(index=True)
    valor_catastral: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    adeudo_ejercicio: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    predio: Mapped[PredioAlfanumerico] = relationship(
        "PredioAlfanumerico", back_populates="valuaciones"
    )
