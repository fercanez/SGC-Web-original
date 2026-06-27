"""Parámetros y validaciones — Municipio de Mexicali, B.C., México."""

import re
from dataclasses import dataclass

# INEGI: Baja California = 02, Municipio Mexicali = 002
STATE_CODE = "02"
MUNICIPALITY_CODE = "002"
STATE_NAME = "Baja California"
MUNICIPALITY_NAME = "Mexicali"

# Centro aproximado (Palacio Municipal / zona centro)
DEFAULT_CENTER_LON = -115.468278
DEFAULT_CENTER_LAT = 32.624639
DEFAULT_MAP_ZOOM = 12

# Proyección métrica de origen — Mexicali (WGS 84 / UTM zona 11N)
METRIC_SRID = 32611
GEOGRAPHIC_SRID = 4326

# Clave catastral municipal (capa prediosmxli — clavecatas).
# Centro: ST002001 | Delegaciones (Algodones): A1003001
CADASTRAL_CODE_PATTERN = r"^(?:[A-Za-z]{2,3}[0-9]{6}|[A-Za-z][0-9]{7})$"
CADASTRAL_CODE_EXAMPLE = "A1003001"
CADASTRAL_CODE_HELP = (
    "Formato centro: homoclave + manzana + lote (ej. ST002001). "
    "Formato delegaciones: letra + 7 dígitos (ej. A1003001). "
    "Debe coincidir con clavecatas en GeoNode."
)


@dataclass(frozen=True)
class MunicipalityInfo:
    state_code: str
    municipality_code: str
    state_name: str
    municipality_name: str
    full_name: str
    default_center: tuple[float, float]
    default_zoom: int
    metric_srid: int
    geographic_srid: int
    cadastral_pattern: str
    cadastral_example: str
    cadastral_help: str


def get_municipality() -> MunicipalityInfo:
    return MunicipalityInfo(
        state_code=STATE_CODE,
        municipality_code=MUNICIPALITY_CODE,
        state_name=STATE_NAME,
        municipality_name=MUNICIPALITY_NAME,
        full_name=f"{MUNICIPALITY_NAME}, {STATE_NAME}, México",
        default_center=(DEFAULT_CENTER_LON, DEFAULT_CENTER_LAT),
        default_zoom=DEFAULT_MAP_ZOOM,
        metric_srid=METRIC_SRID,
        geographic_srid=GEOGRAPHIC_SRID,
        cadastral_pattern=CADASTRAL_CODE_PATTERN,
        cadastral_example=CADASTRAL_CODE_EXAMPLE,
        cadastral_help=CADASTRAL_CODE_HELP,
    )


def validate_cadastral_code(code: str, pattern: str | None = None) -> bool:
    pat = pattern or CADASTRAL_CODE_PATTERN
    return bool(re.fullmatch(pat, code.strip()))


def normalize_rfc_curp(document_id: str) -> str:
    return document_id.strip().upper()
