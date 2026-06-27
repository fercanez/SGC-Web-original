from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.schemas import LoginRequest, TokenResponse
from app.auth.security import create_access_token, verify_password
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()

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

    db.execute(
        text("""
            UPDATE seguridad.usuarios
            SET ultimo_acceso = :ultimo_acceso
            WHERE id = :id
        """),
        {"ultimo_acceso": datetime.now(timezone.utc), "id": row["id"]},
    )
    db.commit()

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
def me(payload=Depends(lambda: None)):
    return {
        "detail": "Endpoint /me pendiente de adaptar a seguridad.usuarios"
    }
