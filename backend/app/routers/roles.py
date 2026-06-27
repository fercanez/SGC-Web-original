from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.deps import require_permission
from app.auth.models import Role, User, role_permissions
from app.auth.permissions import ALL_PERMISSIONS, Permission
from app.auth.schemas import RolePermissionsUpdate, RoleRead
from app.database import get_db

router = APIRouter(prefix="/roles", tags=["roles"])


def _role_read(db: Session, role: Role) -> RoleRead:
    perms = db.execute(
        select(role_permissions.c.permission_code).where(
            role_permissions.c.role_id == role.id
        )
    ).scalars()
    return RoleRead(
        id=role.id,
        code=role.code,
        name=role.name,
        description=role.description,
        permissions=sorted(set(perms)),
    )


@router.get("", response_model=list[RoleRead])
def list_roles(
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.USERS_READ.value)),
):
    roles = db.query(Role).order_by(Role.code).all()
    return [_role_read(db, r) for r in roles]


@router.get("/permissions/catalog")
def permission_catalog(
    _=Depends(require_permission(Permission.ROLES_MANAGE.value)),
):
    return {"permissions": ALL_PERMISSIONS}


@router.put("/{role_code}/permissions", response_model=RoleRead)
def update_role_permissions(
    role_code: str,
    payload: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(Permission.ROLES_MANAGE.value)),
):
    role = db.query(Role).filter(Role.code == role_code).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if role.is_system and role.code == "admin":
        raise HTTPException(
            status_code=400,
            detail="No se pueden modificar permisos del rol administrador",
        )
    invalid = [p for p in payload.permissions if p not in ALL_PERMISSIONS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Permisos no válidos: {', '.join(invalid)}",
        )
    db.execute(
        delete(role_permissions).where(role_permissions.c.role_id == role.id)
    )
    for perm in set(payload.permissions):
        db.execute(
            role_permissions.insert().values(role_id=role.id, permission_code=perm)
        )
    db.commit()
    return _role_read(db, role)
