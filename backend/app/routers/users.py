from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user, require_permission
from app.auth.models import Role, User
from app.auth.permissions import Permission
from app.auth.schemas import UserCreate, UserRead, UserUpdate
from app.auth.security import hash_password
from app.database import get_db
from app.auth.helpers import user_to_read

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission(Permission.USERS_READ.value)),
):
    users = (
        db.query(User).options(joinedload(User.role)).order_by(User.username).all()
    )
    return [user_to_read(db, u) for u in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission(Permission.USERS_WRITE.value)),
):
    username = payload.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")
    role = db.query(Role).filter(Role.code == payload.role_code).first()
    if not role:
        raise HTTPException(status_code=400, detail="Rol no válido")
    user = User(
        username=username,
        email=str(payload.email) if payload.email else None,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user.id)
        .first()
    )
    return user_to_read(db, user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_permission(Permission.USERS_WRITE.value)),
):
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="No puede desactivar su propia cuenta")
    if payload.email is not None:
        user.email = str(payload.email)
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role_code is not None:
        role = db.query(Role).filter(Role.code == payload.role_code).first()
        if not role:
            raise HTTPException(status_code=400, detail="Rol no válido")
        user.role_id = role.id
    if payload.password:
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user.id)
        .first()
    )
    return user_to_read(db, user)
