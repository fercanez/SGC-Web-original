import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _pg_enum(enum_cls: type[enum.Enum]) -> Enum:
    """PostgreSQL enum con valores en minúsculas (natural, no NATURAL)."""
    return Enum(
        enum_cls,
        values_callable=lambda items: [e.value for e in items],
        native_enum=True,
    )


class PartyType(str, enum.Enum):
    NATURAL = "natural"
    JURIDICA = "juridica"


class RightType(str, enum.Enum):
    PROPIEDAD = "propiedad"
    POSESION = "posesion"
    USUFRUCTO = "usufructo"
    ARRENDAMIENTO = "arrendamiento"


class ParcelStatus(str, enum.Enum):
    ACTIVO = "activo"
    INACTIVO = "inactivo"
    EN_TRAMITE = "en_tramite"


class Party(Base):
    __tablename__ = "parties"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    party_type: Mapped[PartyType] = mapped_column(_pg_enum(PartyType), nullable=False)
    document_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    ownerships: Mapped[list["Ownership"]] = relationship(back_populates="party")


class Parcel(Base):
    """BaUnit / predio catastral."""

    __tablename__ = "parcels"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    cadastral_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    predial_account: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True
    )
    colony: Mapped[str | None] = mapped_column(String(128))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    address: Mapped[str | None] = mapped_column(String(512))
    area_m2: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    land_use: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[ParcelStatus] = mapped_column(
        _pg_enum(ParcelStatus), default=ParcelStatus.ACTIVO
    )
    cadastral_value: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    valuation_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    geom = mapped_column(Geometry(geometry_type="MULTIPOLYGON", srid=4326))
    source_layer: Mapped[str | None] = mapped_column(String(128), index=True)
    source_fid: Mapped[str | None] = mapped_column(String(64), index=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ownerships: Mapped[list["Ownership"]] = relationship(back_populates="parcel")
    alfanumerico: Mapped["PredioAlfanumerico | None"] = relationship(
        back_populates="parcel", uselist=False, foreign_keys="PredioAlfanumerico.parcel_id"
    )


class Ownership(Base):
    """RRR simplificado: vínculo party — parcel."""

    __tablename__ = "ownerships"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    parcel_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("parcels.id", ondelete="CASCADE")
    )
    party_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("parties.id", ondelete="CASCADE")
    )
    right_type: Mapped[RightType] = mapped_column(_pg_enum(RightType), nullable=False)
    share_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=100)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)

    parcel: Mapped["Parcel"] = relationship(back_populates="ownerships")
    party: Mapped["Party"] = relationship(back_populates="ownerships")


class PredioAlfanumerico(Base):
    """Base alfanumérica municipal (Excel/PostgreSQL), separada de la cartografía."""

    __tablename__ = "predios_alfanumerico"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    parcel_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("parcels.id", ondelete="SET NULL"),
        index=True,
    )
    clave_catastral: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    clave_catastral_norm: Mapped[str | None] = mapped_column(String(64), index=True)
    nombre_completo: Mapped[str | None] = mapped_column(String(255))
    delegacion: Mapped[str | None] = mapped_column(String(128))
    colonia: Mapped[str | None] = mapped_column(String(128))
    calle: Mapped[str | None] = mapped_column(String(255))
    numof: Mapped[str | None] = mapped_column(String(32))
    numint: Mapped[str | None] = mapped_column(String(32))
    letra: Mapped[str | None] = mapped_column(String(16))
    zonah: Mapped[str | None] = mapped_column(String(64))
    valor2026: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    sup_documental: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    sup_fisica: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    condominio: Mapped[str | None] = mapped_column(String(128))
    adeudo_2026: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    adeudo_total: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    sup_const: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    id_tasa: Mapped[Decimal | None] = mapped_column(Numeric(10, 0))
    descripcion_uso: Mapped[str | None] = mapped_column(String(255))
    porcentaje_tasa: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    parcel: Mapped["Parcel | None"] = relationship(
        back_populates="alfanumerico", foreign_keys=[parcel_id]
    )

    # Referencias a catálogos (generadas desde el padrón)
    delegacion_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_delegaciones.id", ondelete="SET NULL")
    )
    colonia_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_colonias.id", ondelete="SET NULL")
    )
    calle_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_calles.id", ondelete="SET NULL")
    )
    zona_homogenea_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_zonas_homogeneas.id", ondelete="SET NULL")
    )
    uso_suelo_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_usos_suelo.id", ondelete="SET NULL")
    )
    tasa_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_tasas.id", ondelete="SET NULL")
    )
    regimen_propiedad_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("cat_regimenes_propiedad.id", ondelete="SET NULL"),
    )
    titular_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cat_titulares.id", ondelete="SET NULL")
    )

    valuaciones: Mapped[list["PredioValuacion"]] = relationship(
        back_populates="predio", cascade="all, delete-orphan"
    )
