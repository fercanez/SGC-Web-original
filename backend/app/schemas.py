from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import settings
from app.municipality import get_municipality, validate_cadastral_code
from app.models import ParcelStatus, PartyType, RightType


class PartyBase(BaseModel):
    party_type: PartyType
    document_id: str = Field(..., max_length=32)
    full_name: str = Field(..., max_length=255)
    email: str | None = None
    phone: str | None = None


class PartyCreate(PartyBase):
    pass


class PartyRead(PartyBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class ParcelBase(BaseModel):
    cadastral_code: str = Field(..., max_length=64)
    predial_account: str | None = Field(None, max_length=64)
    colony: str | None = Field(None, max_length=128)
    postal_code: str | None = Field(None, max_length=10)
    address: str | None = None
    area_m2: Decimal | None = None
    land_use: str | None = None
    status: ParcelStatus = ParcelStatus.ACTIVO
    cadastral_value: Decimal | None = None
    valuation_date: date | None = None
    notes: str | None = None


class ParcelCreate(ParcelBase):
    geometry: dict[str, Any] | None = None

    @field_validator("cadastral_code")
    @classmethod
    def check_cadastral_code(cls, v: str) -> str:
        if not validate_cadastral_code(v, settings.cadastral_code_pattern):
            muni = get_municipality()
            raise ValueError(
                f"Clave catastral inválida para {muni.municipality_name}. "
                f"Ejemplo: {muni.cadastral_example}"
            )
        return v.strip()


class ParcelRead(ParcelBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_layer: str | None = None
    source_fid: str | None = None
    synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ParcelGeoJSON(ParcelRead):
    geometry: dict[str, Any] | None = None


class OwnershipBase(BaseModel):
    parcel_id: str
    party_id: str
    right_type: RightType
    share_percent: Decimal = Field(default=Decimal("100"), ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None


class OwnershipCreate(OwnershipBase):
    pass


class OwnershipRead(OwnershipBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    party: PartyRead | None = None


class HealthResponse(BaseModel):
    status: str
    database: str


class BatchMapGeometriesRequest(BaseModel):
    claves: list[str]
    max_items: int = 80


class BatchMapGeometriesResponse(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict]
    requested: int
    drawn: int
    failed: int
    max_items: int


class CuadroConstruccionRequest(BaseModel):
    geometry: dict[str, Any]


class PredioAlfanumericoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parcel_id: str | None = None
    clave_catastral: str
    clave_catastral_norm: str | None = None
    nombre_completo: str | None = None
    delegacion: str | None = None
    colonia: str | None = None
    calle: str | None = None
    numof: str | None = None
    numint: str | None = None
    letra: str | None = None
    zonah: str | None = None
    valor2026: Decimal | None = None
    sup_documental: Decimal | None = None
    sup_fisica: Decimal | None = None
    condominio: str | None = None
    adeudo_2026: Decimal | None = None
    adeudo_total: Decimal | None = None
    sup_const: Decimal | None = None
    id_tasa: Decimal | None = None
    descripcion_uso: str | None = None
    porcentaje_tasa: Decimal | None = None
    imported_at: datetime
    updated_at: datetime
