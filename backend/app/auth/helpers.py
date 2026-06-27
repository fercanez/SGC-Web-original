from sqlalchemy.orm import Session

from app.auth.deps import get_user_permissions
from app.auth.models import User
from app.auth.schemas import RoleRead, UserRead


def user_to_read(db: Session, user: User) -> UserRead:
    perms = sorted(get_user_permissions(db, user))
    return UserRead(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        role=RoleRead(
            id=user.role.id,
            code=user.role.code,
            name=user.role.name,
            description=user.role.description,
            permissions=perms,
        ),
        permissions=perms,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )
