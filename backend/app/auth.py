"""JWT Authentication and Role-Based Access Control (RBAC) dependencies."""

import os
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=True)

JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE_ME_IN_PRODUCTION_SPBE_SECRET")
JWT_ALGORITHM = "HS256"


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    nip: str
    nama: str
    role_code: str
    unit_kerja_id: UUID


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    """Validate Bearer JWT token and load active user + RBAC role from PostgreSQL."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id_raw = payload.get("sub")
        if not user_id_raw:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token JWT tidak memuat subject (sub).",
            )
        user_uuid = UUID(user_id_raw)
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token otentikasi tidak valid atau telah kedaluwarsa.",
        ) from exc

    stmt = (
        select(User)
        .options(joinedload(User.role))
        .where(User.id == user_uuid, User.is_active.is_(True))
    )
    user = db.execute(stmt).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akun pengguna tidak ditemukan atau berstatus non-aktif.",
        )

    return AuthenticatedUser(
        id=user.id,
        nip=user.nip,
        nama=user.nama,
        role_code=user.role.code,
        unit_kerja_id=user.unit_kerja_id,
    )


def require_roles(*allowed_roles: str):
    """Dependency factory enforcing RBAC per endpoint (NFR-03)."""

    def _guard(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if current_user.role_code not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Akses ditolak untuk peran {current_user.role_code}.",
            )
        return current_user

    return _guard
