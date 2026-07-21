from types import SimpleNamespace

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)


ROLE_PERMISSIONS = {
    "admin": {
        "admin",
        "dashboard.view",
        "users.read",
        "users.write",
        "roles.read",
        "roles.write",
        "roles.manage",
        "parcels.read",
        "parcels.write",
        "parcels.sync",
        "parcels.import",
        "parties.read",
        "parties.write",
        "cadastral.read",
        "cadastral.write",
        "catalogs.read",
        "catalogs.write",
        "fiscal.read",
        "fiscal.write",
        "source.read",
        "source.write",
    },
    "supervisor": {
        "dashboard.view",
        "parcels.read",
        "parcels.write",
        "parcels.sync",
        "parcels.import",
        "parties.read",
        "parties.write",
        "users.read",
    },
    "consulta": {
        "dashboard.view",
        "parcels.read",
        "parties.read",
        "cadastral.read",
        "catalogs.read",
    },
    "cartografia": {
        "dashboard.view",
        "parcels.read",
        "cadastral.read",
        "source.read",
    },
    "fiscalizacion": {
        "dashboard.view",
        "parcels.read",
        "cadastral.read",
        "fiscal.read",
    },
}


def get_user_permissions_from_role(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role or "", ROLE_PERMISSIONS["consulta"])


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    uid_param: str | int = user_id
    if isinstance(user_id, str) and user_id.isdigit():
        uid_param = int(user_id)

    row = db.execute(
        text("""
            SELECT
                id,
                usuario,
                nombre_completo,
                rol,
                activo
            FROM seguridad.usuarios
            WHERE id = :id
            LIMIT 1
        """),
        {"id": uid_param},
    ).mappings().first()

    if not row or not row["activo"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    permissions = get_user_permissions_from_role(row["rol"])

    user = SimpleNamespace(
        id=row["id"],
        username=row["usuario"],
        full_name=row["nombre_completo"],
        email=None,
        is_active=row["activo"],
        role=SimpleNamespace(
            code=row["rol"],
            name=row["rol"],
            permissions=list(permissions),
        ),
        permissions=list(permissions),
        _sgc_permissions=permissions,
    )

    return user


def require_permission(*permission_codes: str):
    async def checker(user=Depends(get_current_user)):
        perms = getattr(user, "_sgc_permissions", set())
        if not any(code in perms for code in permission_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permiso para esta acción",
            )
        return user

    return checker

def get_user_permissions(db, user) -> set[str]:
    role_code = getattr(getattr(user, "role", None), "code", None)
    if not role_code:
        role_code = getattr(user, "rol", None)
    return get_user_permissions_from_role(role_code or "consulta")
