from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.municipality import (
    CADASTRAL_CODE_PATTERN,
    DEFAULT_CENTER_LAT,
    DEFAULT_CENTER_LON,
    DEFAULT_MAP_ZOOM,
    GEOGRAPHIC_SRID,
    METRIC_SRID,
    MUNICIPALITY_NAME,
    STATE_NAME,
)

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent


def _discover_env_files() -> tuple[str, ...]:
    """backend/.env y ../.env (p. ej. /opt/sgc-web/.env); el último gana."""
    found: list[Path] = []
    for path in (_BACKEND_DIR / ".env", _REPO_ROOT / ".env", Path(".env")):
        if path.is_file() and path not in found:
            found.append(path.resolve())
    return tuple(str(p) for p in found) if found else (".env",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_discover_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+psycopg://sgc:sgc@localhost:5432/catastro_lab"
    )
    cors_origins: str = "http://localhost:5173"
    seed_on_startup: bool = False

    jwt_secret: str = "cambie-esta-clave-secreta-en-produccion"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    bootstrap_admin_user: str = "admin"
    bootstrap_admin_password: str = "Admin123!"
    bootstrap_admin_email: str = "admin@catastro.local"
    bootstrap_admin_full_name: str = "Administrador SGC"

    municipality_name: str = MUNICIPALITY_NAME
    state_name: str = STATE_NAME
    default_map_center_lon: float = DEFAULT_CENTER_LON
    default_map_center_lat: float = DEFAULT_CENTER_LAT
    default_map_zoom: int = DEFAULT_MAP_ZOOM
    geographic_srid: int = GEOGRAPHIC_SRID
    metric_srid: int = METRIC_SRID
    cadastral_code_pattern: str = CADASTRAL_CODE_PATTERN

    geonode_url: str = ""
    geoserver_path: str = "/geoserver"
    geonode_wms_layers: str = ""
    geonode_wms_layer_titles: str = ""
    geonode_user: str = ""
    geonode_password: str = ""
    geonode_auth_key: str = ""
    geonode_wms_version: str = "1.1.1"
    geonode_auth_required: bool = True
    geonode_ssl_verify: bool = False

    # Capa vectorial oficial (origen cartográfico y de datos)
    geonode_source_layer: str = "geonode:prediosmxli"
    geonode_source_title: str = "Predios Mexicali (origen oficial)"
    geonode_source_srid: int = 4326
    skip_demo_when_source_layer: bool = True
    # Nombres de campo en la capa GeoNode (probados en orden, separados por coma)
    geonode_field_cadastral: str = (
        "clavecatas,clavecata,clave_catastral,cve_cat,cvecatastral,clave_cat,cuenta_pred,cuenta_predial"
    )
    geonode_field_predial: str = "clavecatas,cuenta_pred,cuenta_predial,cuenta"
    geonode_field_colony: str = "colonia,nom_colonia,colonia_nombre"
    geonode_field_address: str = "domicilio,direccion,domicilio_predio"
    geonode_field_land_use: str = "uso_suelo,uso,land_use,destino"
    geonode_field_area: str = "area,area_m2,superficie,sup_terreno"
    geonode_sync_batch_size: int = 2000
    # Solo geometría + clave de enlace; atributos alfanuméricos vienen del Excel
    geonode_sync_geometry_only: bool = True
    # Capa tributaria WFS (adeudos por clavecatas)
    geonode_adeudo_layer: str = "geonode:predios_adeudo_2026"
    geonode_field_adeudo_2026: str = (
        "adeudo_2026,adeudo2026,adeudo_ejercicio,adeudo,monto_adeudo,importe_adeudo,"
        "impuesto_predial,impuesto,imp_predial,adeudoimp,adeudo_impuesto,saldo_adeudo"
    )
    geonode_field_adeudo_total: str = (
        "adeudo_total,adeudototal,adeudo_acumulado,total_adeudo,adeudo_tot,"
        "total_adeudo,adeudo_acum,adeudo_historico,saldo_total"
    )
    geonode_field_valor: str = "valor2026,valor_catastral,avaluo,valor"

    # Columnas del Excel/CSV (primera coincidencia gana, separadas por coma)
    excel_col_cadastral: str = (
        "clavecatas,clave_catastral,clave catastral,cve_cat,cadastral_code"
    )
    excel_col_predial: str = "cuenta_predial,cuenta predial,predial_account,clavecatas"
    excel_col_colony: str = "colonia,nom_colonia"
    excel_col_postal: str = "cp,codigo_postal,postal_code"
    excel_col_address: str = "domicilio,direccion,address"
    excel_col_area: str = "superficie,area,area_m2,superficie_m2"
    excel_col_land_use: str = "uso_suelo,uso,destino,land_use"
    excel_col_value: str = "valor_catastral,avaluo,cadastral_value,valor"
    excel_col_valuation_date: str = "fecha_avaluo,fecha_valuacion,valuation_date"
    excel_col_status: str = "estatus,status,estado"
    excel_col_notes: str = "observaciones,notas,notes"
    excel_col_owner_name: str = (
        "propietario,nombre_propietario,full_name,titular,dueno"
    )
    excel_col_owner_doc: str = "rfc,curp,documento,document_id,rfc_curp"
    excel_col_owner_type: str = "tipo_persona,party_type,tipo"
    excel_col_owner_email: str = "email,correo"
    excel_col_owner_phone: str = "telefono,phone,tel"
    excel_col_share_percent: str = "porcentaje,participacion,share_percent"
    excel_col_right_type: str = "tipo_derecho,right_type,derecho"
    excel_import_batch_size: int = 500
    padron_default_ejercicio: int = 2026

    @field_validator("geonode_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/") if v else v

    @property
    def geoserver_wms_base(self) -> str | None:
        if not self.geonode_url:
            return None
        path = self.geoserver_path if self.geoserver_path.startswith("/") else f"/{self.geoserver_path}"
        return f"{self.geonode_url}{path}/wms"

    @property
    def geoserver_wfs_base(self) -> str | None:
        if not self.geonode_url:
            return None
        path = (
            self.geoserver_path
            if self.geoserver_path.startswith("/")
            else f"/{self.geoserver_path}"
        )
        return f"{self.geonode_url}{path}/wfs"

    def field_candidates(self, setting_name: str) -> list[str]:
        raw = getattr(self, setting_name, "")
        return [x.strip().lower() for x in raw.split(",") if x.strip()]

    def geonode_layer_list(self) -> list[dict[str, str]]:
        layers = [x.strip() for x in self.geonode_wms_layers.split(",") if x.strip()]
        titles = [x.strip() for x in self.geonode_wms_layer_titles.split(",") if x.strip()]
        result = []
        for i, layer_id in enumerate(layers):
            title = titles[i] if i < len(titles) else layer_id
            result.append({"id": layer_id.replace(":", "_"), "layer": layer_id, "title": title})
        return result


settings = Settings()
