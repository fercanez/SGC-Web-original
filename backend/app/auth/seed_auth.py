"""Roles del sistema y usuario administrador inicial."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.models import Role, User, role_permissions
from app.auth.permissions import ROLE_DEFINITIONS, permissions_for_role
from app.auth.security import hash_password
from app.config import settings


def sync_roles(db: Session) -> dict[str, Role]:
    by_code: dict[str, Role] = {}
    for code, meta in ROLE_DEFINITIONS.items():
        role = db.query(Role).filter(Role.code == code).first()
        if not role:
            role = Role(
                code=code,
                name=meta["name"],
                description=meta.get("description"),
                is_system=True,
            )
            db.add(role)
            db.flush()
        else:
            role.name = meta["name"]
            role.description = meta.get("description")
        db.execute(
            delete(role_permissions).where(role_permissions.c.role_id == role.id)
        )
        for perm in permissions_for_role(code):
            db.execute(
                role_permissions.insert().values(
                    role_id=role.id, permission_code=perm
                )
            )
        by_code[code] = role
    db.commit()
    return by_code


def ensure_admin_user(db: Session) -> None:
    roles = sync_roles(db)
    admin_role = roles["admin"]
    existing = db.query(User).filter(User.username == settings.bootstrap_admin_user).first()
    if existing:
        return
    admin = User(
        username=settings.bootstrap_admin_user,
        email=settings.bootstrap_admin_email,
        full_name=settings.bootstrap_admin_full_name,
        password_hash=hash_password(settings.bootstrap_admin_password),
        is_active=True,
        role_id=admin_role.id,
    )
    db.add(admin)
    db.commit()


def run_auth_seed(db: Session | None = None) -> None:
    from app.database import SessionLocal

    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        sync_roles(db)
        ensure_admin_user(db)
    finally:
        if close:
            db.close()
