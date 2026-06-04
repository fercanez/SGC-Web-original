"""Códigos de permiso y asignación por rol."""

from enum import Enum


class Permission(str, Enum):
    DASHBOARD_VIEW = "dashboard.view"
    PARCELS_READ = "parcels.read"
    PARCELS_WRITE = "parcels.write"
    PARCELS_SYNC = "parcels.sync"
    PARCELS_IMPORT = "parcels.import"
    PARTIES_READ = "parties.read"
    PARTIES_WRITE = "parties.write"
    USERS_READ = "users.read"
    USERS_WRITE = "users.write"
    ROLES_MANAGE = "roles.manage"


ALL_PERMISSIONS = [p.value for p in Permission]

ROLE_DEFINITIONS: dict[str, dict] = {
    "consulta": {
        "name": "Consulta",
        "description": "Solo lectura de predios y propietarios",
        "permissions": [
            Permission.DASHBOARD_VIEW,
            Permission.PARCELS_READ,
            Permission.PARTIES_READ,
        ],
    },
    "operador": {
        "name": "Operador catastral",
        "description": "Alta y edición de predios y propietarios",
        "permissions": [
            Permission.DASHBOARD_VIEW,
            Permission.PARCELS_READ,
            Permission.PARCELS_WRITE,
            Permission.PARTIES_READ,
            Permission.PARTIES_WRITE,
        ],
    },
    "supervisor": {
        "name": "Supervisor",
        "description": "Operación completa y consulta de usuarios",
        "permissions": [
            Permission.DASHBOARD_VIEW,
            Permission.PARCELS_READ,
            Permission.PARCELS_WRITE,
            Permission.PARCELS_SYNC,
            Permission.PARCELS_IMPORT,
            Permission.PARTIES_READ,
            Permission.PARTIES_WRITE,
            Permission.USERS_READ,
        ],
    },
    "admin": {
        "name": "Administrador",
        "description": "Acceso total, usuarios y roles",
        "permissions": list(Permission),
    },
}


def permissions_for_role(role_code: str) -> list[str]:
    role = ROLE_DEFINITIONS.get(role_code)
    if not role:
        return []
    return [p.value if isinstance(p, Permission) else p for p in role["permissions"]]
