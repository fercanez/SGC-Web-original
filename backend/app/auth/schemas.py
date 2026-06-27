from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=4)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    description: str | None
    permissions: list[str] = []


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str | None
    full_name: str
    is_active: bool
    role: RoleRead
    permissions: list[str] = []
    last_login_at: datetime | None
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)
    email: EmailStr | None = None
    full_name: str = Field(..., min_length=2, max_length=255)
    role_code: str = Field(..., description="consulta | operador | supervisor | admin")
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    role_code: str | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=6)


class RolePermissionsUpdate(BaseModel):
    permissions: list[str]
