from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.auth.models import User
from app.auth.helpers import user_to_read
from app.auth.schemas import LoginRequest, TokenResponse, UserRead
from app.auth.security import create_access_token, verify_password
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.username == payload.username.strip().lower())
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado. Contacte al administrador.",
        )
    user.last_login_at = datetime.now(UTC)
    db.commit()
    token = create_access_token(user.id, extra={"username": user.username})
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_expire_minutes,
    )


@router.get("/me", response_model=UserRead)
def me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_to_read(db, user)
