import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_user_permissions_from_role
from app.auth.schemas import LoginRequest, TokenResponse
from app.auth.security import create_access_token, verify_password
from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()

    try:
        db.execute(text("SET LOCAL statement_timeout = 8000"))
        row = db.execute(
            text("""
                SELECT
                    id,
                    usuario,
                    nombre_completo,
                    password_hash,
                    rol,
                    activo
                FROM seguridad.usuarios
                WHERE lower(usuario) = :username
                LIMIT 1
            """),
            {"username": username},
        ).mappings().first()
    except SQLAlchemyError as exc:
        logger.exception("Login: error al consultar seguridad.usuarios")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "No se pudo consultar la tabla de usuarios. "
                "Verifique permisos SELECT en seguridad.usuarios para el usuario de DATABASE_URL."
            ),
        ) from exc

    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )

    if not row["activo"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado. Contacte al administrador.",
        )

    # No actualizar ultimo_acceso: el usuario de BD de SGC-Web suele ser solo lectura.
    token = create_access_token(
        str(row["id"]),
        extra={
            "username": row["usuario"],
            "full_name": row["nombre_completo"],
            "role": row["rol"],
        },
    )

    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_expire_minutes,
    )


@router.get("/me")
def me(current=Depends(get_current_user)):
    role_code = current.role.code
    permissions = sorted(get_user_permissions_from_role(role_code))
    now = datetime.now(timezone.utc)
    return {
        "id": str(current.id),
        "username": current.username,
        "full_name": current.full_name,
        "email": current.email,
        "is_active": current.is_active,
        "role": {
            "id": role_code,
            "code": role_code,
            "name": current.role.name,
            "description": None,
            "permissions": permissions,
        },
        "permissions": permissions,
        "last_login_at": None,
        "created_at": now.isoformat(),
    }
